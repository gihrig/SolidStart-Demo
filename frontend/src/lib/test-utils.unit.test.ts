import { describe, it, expect } from "vite-plus/test";
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
});
