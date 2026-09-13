import { describe, test, expect } from "vite-plus/test";
import type { WsEvent } from "./index";

// The barrel's `NumericIdsEvent` is the seam that makes the declared `WsEvent`
// match the runtime value (ADR-0003): every id arrives as a `number` via
// JSON.parse, never a `bigint`. After the Channel merge (ADR-0020) every poke is
// one `poke` variant carrying a `Channel`; its id (where the channel carries one)
// is rewritten through the same `Channel` type. These assertions guard that
// boundary so a future generated-binding change cannot silently leave an id as
// `bigint`. The checks are compile-time — `vpr check:type` (tsc) validates them;
// `Expect` fails to compile on any drift.

// Standard type-equality helper: true only when X and Y are the exact same type.
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// Narrow the union to one variant by its `event_type` discriminant.
type Variant<K extends WsEvent["event_type"]> = Extract<WsEvent, { event_type: K }>;
// Narrow the poke variant further by its Channel `kind`.
type Poke<K> = Extract<Variant<"poke">, { kind: K }>;

// Exported so the assertions are referenced (no unused-type noise). A failed
// `Expect` is a compile error regardless.
export type WsEventConversionAssertions = [
  // A poke carries its Channel; an id-bearing channel's id is rewritten to number.
  Expect<Equal<Poke<"post_like">["id"], number>>,
  Expect<Equal<Poke<"caption_like">["id"], number>>,
  Expect<Equal<Poke<"post_caption">["id"], number>>,
  Expect<Equal<Poke<"conv">["id"], number>>,

  // Nested conv_msg payload ids are rewritten bigint -> number...
  Expect<Equal<Variant<"conv_msg">["payload"]["id"], number>>,
  Expect<Equal<Variant<"conv_msg">["payload"]["conv_id"], number>>,
  Expect<Equal<Variant<"conv_msg">["payload"]["user_id"], number>>,
  Expect<Equal<Variant<"conv_msg">["payload"]["cid"], number>>,
  Expect<Equal<Variant<"conv_msg">["payload"]["mid"], number>>,
  // ...while non-id payload fields keep their wire type.
  Expect<Equal<Variant<"conv_msg">["payload"]["content"], string>>,
  Expect<Equal<Variant<"conv_msg">["payload"]["ctime"], string>>,

  // The id-less pokes carry only the discriminant and the channel `kind`.
  Expect<Equal<keyof Poke<"posts">, "event_type" | "kind">>,
  Expect<Equal<keyof Poke<"agents">, "event_type" | "kind">>,
  Expect<Equal<keyof Poke<"convs">, "event_type" | "kind">>,
];

describe("WsEvent discriminated-union narrowing", () => {
  test("a poke narrows by event_type then by channel kind, id as a number", () => {
    const event: WsEvent = { event_type: "poke", kind: "post_like", id: 5 };
    if (event.event_type === "poke" && event.kind === "post_like") {
      // Assignable to number (compile-time) and a number at runtime.
      const id: number = event.id;
      expect(id).toBe(5);
    } else {
      throw new Error("expected the post_like poke");
    }
  });

  test("an id-less poke carries only its kind", () => {
    const event: WsEvent = { event_type: "poke", kind: "agents" };
    if (event.event_type === "poke") {
      expect(event.kind).toBe("agents");
    } else {
      throw new Error("expected a poke");
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
