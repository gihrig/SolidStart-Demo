# Layered user-text sanitization: hygiene on write, server markdown→sanitized-HTML on read, escape at every sink

[ADR-0006](0006-safeurl-brand-enforces-sanitize-boundary.md) made the front-end
seam the single boundary that sanitizes **URLs**, and
[#110](https://github.com/gihrig/SolidStart-Demo/issues/110) settled that the
back-end **validates and rejects** unsafe URLs on write. Free **text** was left
open (#110 §5 → [#112](https://github.com/gihrig/SolidStart-Demo/issues/112)):
the maintainer requires user-supplied text to be sanitized before it is
persisted, which sits in tension with the web-standard "store raw, escape at
output" rule. This ADR settles that tension as **defense in depth across four
layers**, not a single owner. It honors the write-time requirement through input
hygiene, keeps #110's store-raw rule, and adds server-side HTML rendering plus
sanitization for content that reaches an HTML sink.

**The layers.**

1. **Input (server write).** The Rust write path (`base::create` / `base::update`,
   `crates/libs/lib-core/src/model/base/crud_fns.rs`) runs a typed, per-entity
   validator over every free-text field: Unicode **NFC** normalize, trim, and
   **reject** C0/C1 control characters (except tab and newline) and zero-width /
   bidirectional-override characters (the "Trojan Source" class), plus per-field
   length caps and business rules. It **rejects**, it does not neutralize, and it
   stores the **original** value (markdown or plain text). It never HTML-escapes
   on write — that would double-escape (#110 §5). This mirrors the URL rule's
   reject-not-neutralize stance (ADR-0006) and covers admin-authored fields too.

2. **Storage.** Postgres keeps the original, lightly-cleaned value. Fidelity is
   preserved for re-rendering and for non-HTML consumers.

3. **Output (server read).** Text destined for an HTML sink is rendered **on the
   server**: the `markdown` crate (v1.0.0, CommonMark) `to_html()` turns stored
   markdown into HTML — its default path escapes raw embedded HTML — and
   **ammonia** (html5ever-based, allow-list) sanitizes the result. The server
   ships HTML; the client ships no markdown compiler, which minimizes download
   size and client CPU. Plain-text fields that never render as HTML (comment,
   title, caption, username) are returned as-is in JSON and escaped at their
   render sink.

4. **Client.** SolidStart escapes every text node at render, on the SSR server and
   in the browser (e.g. `frontend/src/components/MessagePanel.tsx:76`). Where the
   server's sanitized HTML is injected via `innerHTML`, **neosanitize** sanitizes
   again — defense in depth if the value is manipulated client-side.

URLs are unchanged: reject on write (#110) plus the `SafeUrl` brand at the
front-end sink (ADR-0006).

## Considered and rejected

- **Single authoritative layer.** Pick one place — escape only at render, or strip
  only on write — and trust it. Rejected: a single layer fails open. Render
  escaping alone leaves non-browser consumers and any future raw-HTML sink
  exposed; write-time stripping alone loses fidelity and still cannot know the
  output context. The layers each cover the others' blind spots.

- **HTML-escape or HTML-strip on write.** Neutralize markup as it is persisted.
  Rejected: the render layer already escapes, so this double-escapes and corrupts
  stored text (#110 §5). Storage must keep the original so it can be re-rendered
  and served to non-HTML consumers faithfully.

- **Render markdown on the client.** Ship a JS markdown compiler and sanitize in
  TypeScript only. Rejected: it adds client download and CPU for content that is
  admin-authored and changes rarely, and it drops the server-side guarantee. The
  server render + ammonia makes every consumer receive already-safe HTML;
  neosanitize stays a client backstop, not the sole defense.

- **Markdown-only, no server HTML sanitizer.** Store markdown, compile in TS, skip
  ammonia. Rejected because Layer 3 renders on the server; with HTML produced in
  Rust, ammonia is the natural allow-list at that boundary.

## Consequences

- The back-end gains two read-path dependencies: `markdown` and `ammonia`. Both
  run on read for rendered fields; caching the rendered HTML is a `/to-spec` perf
  lever, not decided here.
- The served HTML for a rendered field differs from the stored markdown. Storage
  is the source of truth; the wire form is derived and safe.
- Admin About/README content **as data** implies a new `Page` entity (a markdown
  body) that the #110 model does not yet define. Tracked as fog on the map (#105),
  resolved in a later effort, not here.
- Open for `/to-spec`: exact per-field length caps, the reject error variant, and
  which fields are markdown-rendered versus plain text.
