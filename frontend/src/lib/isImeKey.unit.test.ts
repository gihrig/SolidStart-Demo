import { describe, it, expect } from "vite-plus/test";
import { isImeKey } from "./isImeKey";

// A key that belongs to an IME composition is left to the browser (#246, #251).
describe("isImeKey", () => {
  const key = (init: KeyboardEventInit & { keyCode?: number }) =>
    new KeyboardEvent("keydown", { key: "Enter", ...init });

  it("a key during a composition is an IME key", () => {
    expect(isImeKey(key({ isComposing: true }))).toBe(true);
  });

  it("Safari's composition Enter (keyCode 229, isComposing false) is an IME key", () => {
    expect(isImeKey(key({ isComposing: false, keyCode: 229 }))).toBe(true);
  });

  it("a plain Enter is no IME key", () => {
    expect(isImeKey(key({ keyCode: 13 }))).toBe(false);
  });
});
