import { describe, it, expect, vi } from "vite-plus/test";
import { silenceWarn } from "./test-utils";

describe("silenceWarn", () => {
  it("silences only the warnings that start with the prefix, and passes the others on", () => {
    // A plain function, not `vi.fn()`: `vi.spyOn` reuses a method that is
    // already a spy, so the helper would then call itself.
    const passedOn: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => passedOn.push(args);
    try {
      const warn = silenceWarn("[expected]");

      console.warn("[expected] quiet", 1);
      console.warn("something else", 2);

      expect(warn).toHaveBeenCalledWith("[expected] quiet", 1);
      expect(passedOn).toEqual([["something else", 2]]);
      warn.mockRestore();
    } finally {
      console.warn = original;
    }
  });

  it("refuses a console.warn that is already a spy, instead of calling itself", () => {
    // `vi.spyOn` would return that same spy, so a warning without the prefix
    // would recurse until the stack overflows.
    const earlier = vi.spyOn(console, "warn");
    try {
      expect(() => silenceWarn("[expected]")).toThrow(
        "silenceWarn: console.warn is already a spy; restore it first",
      );
    } finally {
      earlier.mockRestore();
    }
  });
});
