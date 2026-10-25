import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { getRequestEvent } from "solid-js/web";
import { isSameOrigin, parseTheme, saveTheme, themeCookie, themeFromCookies } from "./theme";

// `getRequestEvent` is the only import theme.ts takes from solid-js/web. Not
// loading the original keeps a second copy of Solid out of the registry.
vi.mock("solid-js/web", () => ({ getRequestEvent: vi.fn() }));

describe("parseTheme", () => {
  it.each(["system", "light", "dark"])("keeps %s", (value) => {
    expect(parseTheme(value)).toBe(value);
  });

  it.each(["auto", "DARK", "", null, undefined])("turns %j into system", (value) => {
    expect(parseTheme(value)).toBe("system");
  });
});

describe("themeFromCookies", () => {
  it("finds the theme cookie among other cookies", () => {
    expect(themeFromCookies("auth-token=abc; theme=dark; other=1")).toBe("dark");
    expect(themeFromCookies("theme=light")).toBe("light");
    expect(themeFromCookies("theme=system")).toBe("system");
    expect(themeFromCookies("themex; theme=dark")).toBe("dark");
  });

  it.each([
    null,
    undefined,
    "",
    "auth-token=abc",
    "theme=auto",
    "theme=",
    "theme=dark=x",
    "mytheme=dark",
  ])("gives undefined for %j", (header) => {
    expect(themeFromCookies(header)).toBeUndefined();
  });
});

describe("themeCookie", () => {
  it("holds the value with the fixed attributes", () => {
    expect(themeCookie("dark")).toBe(
      "theme=dark; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax",
    );
  });
});

describe("isSameOrigin", () => {
  it("passes Sec-Fetch-Site: same-origin", () => {
    expect(isSameOrigin(new Headers({ "Sec-Fetch-Site": "same-origin" }))).toBe(true);
  });

  it.each(["same-site", "cross-site", "none"])("fails Sec-Fetch-Site: %s", (site) => {
    expect(isSameOrigin(new Headers({ "Sec-Fetch-Site": site }))).toBe(false);
  });

  it("fails a request with no Sec-Fetch-Site", () => {
    expect(isSameOrigin(new Headers())).toBe(false);
  });
});

describe("saveTheme", () => {
  let responseHeaders: Headers;

  function requestFrom(site: string) {
    responseHeaders = new Headers();
    vi.mocked(getRequestEvent).mockReturnValue({
      request: new Request("https://localhost:3443/_server", {
        method: "POST",
        headers: { "Sec-Fetch-Site": site },
      }),
      response: { headers: responseHeaders },
    } as unknown as ReturnType<typeof getRequestEvent>);
  }

  beforeEach(() => {
    vi.mocked(getRequestEvent).mockReset();
  });

  it("sets the cookie for a same-origin request", async () => {
    requestFrom("same-origin");
    await saveTheme("light");
    expect(responseHeaders.get("Set-Cookie")).toBe(
      "theme=light; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax",
    );
  });

  it("refuses a cross-site request and sets no cookie", async () => {
    requestFrom("cross-site");
    await expect(saveTheme("dark")).rejects.toThrow();
    expect(responseHeaders.get("Set-Cookie")).toBeNull();
  });

  it("refuses a bad value and sets no cookie", async () => {
    requestFrom("same-origin");
    await expect(saveTheme("auto" as never)).rejects.toThrow();
    expect(responseHeaders.get("Set-Cookie")).toBeNull();
  });

  it("refuses when there is no request", async () => {
    await expect(saveTheme("dark")).rejects.toThrow();
  });
});
