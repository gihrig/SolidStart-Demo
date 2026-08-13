import { describe, it, expect } from "vite-plus/test";
import { createRoot } from "solid-js";
import { createRpcAction } from "./createRpcAction";

// A promise whose resolution we control, to observe `pending` mid-flight.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createRpcAction", () => {
  it("passes the successful result of the wrapped fn through run()", async () => {
    await createRoot(async (dispose) => {
      const action = createRpcAction(async (n: number) => n * 2);
      const result = await action.run(3);
      expect(result).toBe(6);
      expect(action.error()).toBeNull();
      dispose();
    });
  });

  it("toggles pending false → true → false across the async lifecycle", async () => {
    await createRoot(async (dispose) => {
      const d = deferred<string>();
      const action = createRpcAction(() => d.promise);
      expect(action.pending()).toBe(false);

      const run = action.run(undefined);
      expect(action.pending()).toBe(true);

      d.resolve("ok");
      await run;
      expect(action.pending()).toBe(false);
      dispose();
    });
  });

  it("captures an Error's message and returns undefined on failure", async () => {
    await createRoot(async (dispose) => {
      const action = createRpcAction(async () => {
        throw new Error("boom");
      });
      const result = await action.run(undefined);
      expect(result).toBeUndefined();
      expect(action.error()).toBe("boom");
      expect(action.pending()).toBe(false);
      dispose();
    });
  });

  it("falls back to opts.fallbackError when a non-Error is thrown", async () => {
    await createRoot(async (dispose) => {
      const action = createRpcAction(
        async () => {
          throw "not an error object";
        },
        { fallbackError: "Custom fallback" },
      );
      await action.run(undefined);
      expect(action.error()).toBe("Custom fallback");
      dispose();
    });
  });

  it("clears pending in finally even when the wrapped fn throws", async () => {
    await createRoot(async (dispose) => {
      const d = deferred<never>();
      const action = createRpcAction(() => d.promise);
      const run = action.run(undefined);
      expect(action.pending()).toBe(true);

      d.reject(new Error("late failure"));
      await run;
      expect(action.pending()).toBe(false);
      expect(action.error()).toBe("late failure");
      dispose();
    });
  });

  it("clears a prior error at the start of the next run", async () => {
    await createRoot(async (dispose) => {
      let shouldThrow = true;
      const action = createRpcAction(async () => {
        if (shouldThrow) throw new Error("first failure");
        return "recovered";
      });

      await action.run(undefined);
      expect(action.error()).toBe("first failure");

      shouldThrow = false;
      const result = await action.run(undefined);
      expect(result).toBe("recovered");
      expect(action.error()).toBeNull();
      dispose();
    });
  });
});
