import { describe, test, expect } from "vite-plus/test";
import type { WsEvent } from "./index";

// The barrel's `NumericIdsEvent` is the seam that makes the declared `WsEvent`
// match the runtime value (ADR-0003): every id arrives as a `number` via
// JSON.parse, never a `bigint`. These assertions guard that boundary so a future
// generated-binding change (a new poke id, a ConvMsg field) or a rewrite of the
// utility cannot silently leave an id as `bigint`. The checks are compile-time —
// `vpr check:type` (tsc) validates them; `Expect` fails to compile on any drift.

// Standard type-equality helper: true only when X and Y are the exact same type.
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

// Narrow the union to one variant by its `event_type` discriminant.
type Variant<K extends WsEvent["event_type"]> = Extract<WsEvent, { event_type: K }>;

// Exported so the assertions are referenced (no unused-type noise). A failed
// `Expect` is a compile error regardless.
export type WsEventConversionAssertions = [
  // Top-level poke ids are rewritten bigint -> number.
  Expect<Equal<Variant<"post_like">["post_id"], number>>,
  Expect<Equal<Variant<"caption_like">["caption_id"], number>>,
  Expect<Equal<Variant<"post_caption">["post_id"], number>>,

  // Nested conv_msg payload ids are rewritten bigint -> number...
  Expect<Equal<Variant<"conv_msg">["payload"]["id"], number>>,
  Expect<Equal<Variant<"conv_msg">["payload"]["conv_id"], number>>,
  Expect<Equal<Variant<"conv_msg">["payload"]["user_id"], number>>,
  Expect<Equal<Variant<"conv_msg">["payload"]["cid"], number>>,
  Expect<Equal<Variant<"conv_msg">["payload"]["mid"], number>>,
  // ...while non-id payload fields keep their wire type.
  Expect<Equal<Variant<"conv_msg">["payload"]["content"], string>>,
  Expect<Equal<Variant<"conv_msg">["payload"]["ctime"], string>>,

  // The contentless pokes carry nothing but the discriminant.
  Expect<Equal<keyof Variant<"posts">, "event_type">>,
  Expect<Equal<keyof Variant<"agent_update">, "event_type">>,
  Expect<Equal<keyof Variant<"conv_update">, "event_type">>,
];

describe("WsEvent discriminated-union narrowing", () => {
  test("narrowing by event_type exposes the poke id as a number", () => {
    const event: WsEvent = { event_type: "post_like", post_id: 5 };
    if (event.event_type === "post_like") {
      // Assignable to number (compile-time) and a number at runtime.
      const id: number = event.post_id;
      expect(id).toBe(5);
    } else {
      throw new Error("expected the post_like variant");
    }
  });

  test("narrowing exposes the nested conv_msg payload with numeric ids", () => {
    const event: WsEvent = {
      event_type: "conv_msg",
      payload: {
        id: 1,
        conv_id: 7,
        user_id: 2,
        content: "hi",
        cid: 2,
        ctime: "1970-01-01T00:00:00Z",
        mid: 2,
        mtime: "1970-01-01T00:00:00Z",
      },
    };
    if (event.event_type === "conv_msg") {
      const convId: number = event.payload.conv_id;
      expect(convId).toBe(7);
    } else {
      throw new Error("expected the conv_msg variant");
    }
  });
});
