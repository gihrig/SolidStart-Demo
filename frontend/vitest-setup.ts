import { cleanup } from "@solidjs/testing-library";
import { afterEach, expect } from "vite-plus/test";

// Solid warns when a computation, a cleanup or an error handler is created with
// no owner, e.g. after an `await` or in an event handler. Nothing disposes it,
// so it leaks. Each such warning fails the test that raised it. The fix is to
// create it under an owner (`createRoot`, or `getOwner()` + `runWithOwner`), or
// not to create it at all.
const OWNERLESS = /created outside a `createRoot` or `render` will never be/;
const ownerlessWarnings: string[] = [];
const warn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && OWNERLESS.test(args[0])) ownerlessWarnings.push(args[0]);
  warn(...args);
};

afterEach(() => {
  cleanup();
  expect(
    ownerlessWarnings.splice(0),
    "Solid reactive code was created with no owner, so it will never be disposed",
  ).toEqual([]);
});
