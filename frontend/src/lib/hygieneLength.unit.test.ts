import { describe, it, expect } from "vite-plus/test";
import { hygieneLength } from "./hygieneLength";

// Mirrors the back-end `hygiene_value` count (ADR-0019): NFC, fold CR/CRLF to
// LF, trim, then count Unicode scalar values — so a front-end cap check agrees
// with the back-end's `max_len` exactly.
describe("hygieneLength", () => {
  it("counts plain text by character", () => {
    expect(hygieneLength("hello")).toBe(5);
  });

  it("counts an emoji as one character, not two UTF-16 units", () => {
    expect("😀".length).toBe(2);
    expect(hygieneLength("😀")).toBe(1);
  });

  it("counts each scalar value of a joined emoji, as the back-end does", () => {
    // man ZWJ woman ZWJ girl: one glyph, five scalar values.
    expect(hygieneLength("👨‍👩‍👧")).toBe(5);
  });

  it("NFC-normalizes first: e + combining acute counts as one", () => {
    expect(hygieneLength("é")).toBe(1);
  });

  it("ignores leading and trailing whitespace", () => {
    expect(hygieneLength("  ab  ")).toBe(2);
  });

  it("folds CRLF and a lone CR to one LF before counting", () => {
    expect(hygieneLength("a\r\nb")).toBe(3);
    expect(hygieneLength("a\rb")).toBe(3);
  });

  it("is 0 for an empty or all-whitespace value", () => {
    expect(hygieneLength("")).toBe(0);
    expect(hygieneLength("   ")).toBe(0);
  });
});
