import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPlist } from "../../src/apple/plist";
import { defaultAuthURL, fetchBag } from "../../src/apple/bag";

const nativeFastAuthURL =
  "https://auth.itunes.apple.com/auth/v1/native/fast";

describe("apple/bag", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses authenticateAccount from urlBag", async () => {
    const xml = buildPlist({
      urlBag: {
        authenticateAccount: nativeFastAuthURL,
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => xml,
      }),
    );

    const result = await fetchBag("aabbccddeeff");

    expect(result.authURL).toBe(nativeFastAuthURL);
  });

  it("falls back to the native fast auth endpoint when authenticateAccount is missing", async () => {
    const xml = buildPlist({
      urlBag: {
        Ghostrider: "YES",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => xml,
      }),
    );

    const result = await fetchBag("aabbccddeeff");

    expect(defaultAuthURL).toBe(nativeFastAuthURL);
    expect(result.authURL).toBe(nativeFastAuthURL);
  });

  it("falls back to the native fast auth endpoint when bag proxy returns non-OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({ error: "upstream failed" }),
      }),
    );

    const result = await fetchBag("aabbccddeeff");

    expect(defaultAuthURL).toBe(nativeFastAuthURL);
    expect(result.authURL).toBe(nativeFastAuthURL);
  });
});
