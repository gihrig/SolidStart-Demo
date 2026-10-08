import { vi } from "vite-plus/test";

/**
 * Silence only the warnings that start with `prefix`, and return the spy so a
 * test can assert on them. Every other warning still reaches `console.warn`, so
 * the owner guard in `vitest-setup.ts` still sees Solid's warnings. A blanket
 * `mockImplementation(() => {})` would hide them. Only imported by test files.
 */
export function silenceWarn(prefix: string) {
  // `vi.spyOn` returns an existing spy as is, so `original` would be the spy
  // itself and a warning without the prefix would recurse without end.
  if (vi.isMockFunction(console.warn)) {
    throw new Error("silenceWarn: console.warn is already a spy; restore it first");
  }
  const original = console.warn;
  return vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    if (!(typeof args[0] === "string" && args[0].startsWith(prefix))) original(...args);
  });
}
