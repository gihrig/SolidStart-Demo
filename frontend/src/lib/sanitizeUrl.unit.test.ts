import { describe, it, expect } from "vite-plus/test";
import { sanitizeUrl } from "./sanitizeUrl";
import { silenceWarn } from "./test-utils";

describe("sanitizeUrl", () => {
  it("allows https URLs", () => {
    expect(sanitizeUrl("https://example.com/img.jpg")).toBe("https://example.com/img.jpg");
  });

  it("allows http URLs", () => {
    expect(sanitizeUrl("http://example.com/img.jpg")).toBe("http://example.com/img.jpg");
  });

  it("allows absolute paths", () => {
    expect(sanitizeUrl("/images/hero.jpg")).toBe("/images/hero.jpg");
  });

  it("allows root path", () => {
    expect(sanitizeUrl("/")).toBe("/");
  });

  it("blocks javascript: protocol", () => {
    const warn = silenceWarn("[sanitizeUrl]");
    expect(sanitizeUrl("javascript:alert(1)")).toBeUndefined();
    warn.mockRestore();
  });

  it("blocks data: URIs", () => {
    const warn = silenceWarn("[sanitizeUrl]");
    expect(sanitizeUrl("data:image/svg+xml,<svg></svg>")).toBeUndefined();
    warn.mockRestore();
  });

  it("blocks URLs with single quotes (CSS breakout)", () => {
    const warn = silenceWarn("[sanitizeUrl]");
    expect(sanitizeUrl("https://evil.com/img'.jpg")).toBeUndefined();
    warn.mockRestore();
  });

  it("blocks URLs with parentheses (CSS breakout)", () => {
    const warn = silenceWarn("[sanitizeUrl]");
    expect(sanitizeUrl("https://evil.com/img).jpg")).toBeUndefined();
    warn.mockRestore();
  });

  it("blocks relative paths", () => {
    const warn = silenceWarn("[sanitizeUrl]");
    expect(sanitizeUrl("../images/hack.jpg")).toBeUndefined();
    warn.mockRestore();
  });
});
