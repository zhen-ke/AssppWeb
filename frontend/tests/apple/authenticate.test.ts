import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPlist } from "../../src/apple/plist";
import { authenticate, AuthenticationError } from "../../src/apple/authenticate";
import { appleRequest } from "../../src/apple/request";
import { fetchBag } from "../../src/apple/bag";

vi.mock("../../src/apple/request", () => ({
  appleRequest: vi.fn(),
}));

vi.mock("../../src/apple/bag", () => ({
  fetchBag: vi.fn(),
  defaultAuthURL: "https://auth.itunes.apple.com/auth/v1/native/fast",
}));

describe("apple/authenticate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchBag).mockResolvedValue({
      authURL: "https://auth.itunes.apple.com/auth/v1/native/fast?foo=1&guid=old-value",
    });
  });

  it("sets guid query exactly once from bag endpoint", async () => {
    vi.mocked(appleRequest).mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      rawHeaders: [],
      body: buildPlist({
        accountInfo: {
          appleId: "test@example.com",
          address: {
            firstName: "Test",
            lastName: "User",
          },
        },
        passwordToken: "token",
        dsPersonId: "123",
      }),
    });

    await authenticate(
      "test@example.com",
      "password",
      undefined,
      undefined,
      "aabbccddeeff",
    );

    const requestCall = vi.mocked(appleRequest).mock.calls[0][0];
    const endpoint = new URL(`https://${requestCall.host}${requestCall.path}`);

    expect(endpoint.searchParams.get("guid")).toBe("aabbccddeeff");
    expect(endpoint.searchParams.getAll("guid")).toHaveLength(1);
    expect(endpoint.searchParams.get("foo")).toBe("1");
  });

  it("follows 307 redirects during authentication", async () => {
    vi.mocked(appleRequest)
      .mockResolvedValueOnce({
        status: 307,
        statusText: "Temporary Redirect",
        headers: {
          location:
            "https://p25-buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/authenticate?guid=redirected",
        },
        rawHeaders: [],
        body: "",
      })
      .mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: {},
        rawHeaders: [],
        body: buildPlist({
          accountInfo: {
            appleId: "test@example.com",
            address: {
              firstName: "Test",
              lastName: "User",
            },
          },
          passwordToken: "token",
          dsPersonId: "123",
        }),
      });

    const account = await authenticate(
      "test@example.com",
      "password",
      undefined,
      undefined,
      "aabbccddeeff",
    );

    expect(account.passwordToken).toBe("token");
    expect(vi.mocked(appleRequest)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(appleRequest).mock.calls[1][0].host).toBe(
      "p25-buy.itunes.apple.com",
    );
  });

  it("treats verification prompt text as a code-required error", async () => {
    vi.mocked(appleRequest).mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      rawHeaders: [],
      body: buildPlist({
        failureType: "",
        customerMessage: "Enter the verification code sent to your devices.",
        dialog: {
          explanation: "Enter the verification code sent to your trusted devices.",
        },
      }),
    });

    await expect(
      authenticate(
        "test@example.com",
        "password",
        undefined,
        undefined,
        "aabbccddeeff",
      ),
    ).rejects.toMatchObject<Partial<AuthenticationError>>({
      codeRequired: true,
      message:
        "Authentication requires verification code. If no verification code was prompted, try logging in at https://account.apple.com to trigger the alert and fill the code in the 2FA Code field.",
    });
  });
});
