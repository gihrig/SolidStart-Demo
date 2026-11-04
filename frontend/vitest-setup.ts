import { cleanup } from "@solidjs/testing-library";
import { afterEach, expect } from "vite-plus/test";

// jsdom has no `window.scrollTo`; the router calls it after each navigation and
// jsdom prints "Not implemented". Scrolling has no effect in jsdom, so a no-op.
window.scrollTo = () => {};

// jsdom has no `window.matchMedia`. The default matches no query: a wide
// screen with a fine pointer. A test that needs a match stubs its own.
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) satisfies MediaQueryList;

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
