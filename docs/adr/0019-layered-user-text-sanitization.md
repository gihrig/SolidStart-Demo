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

## Addendum (2026-10-12) — the Comment render policy (#126)

#126 builds Layers 3 and 4 for Comment `content`, the one markdown field (#113).
Layer 3 above lists "comment" as a plain-text field. That text is older than
#113 and is wrong: a Comment is plain text or markdown.

**Decision.**

- **Render.** `markdown::to_html` (CommonMark, default options) turns the stored
  markdown into HTML. ammonia then cleans the HTML with an explicit policy, not
  with the ammonia default.
- **Tags.** `p`, `br`, `strong`, `em`, `code`, `pre`, `blockquote`, `ul`, `ol`,
  `li`, `a`, `hr`. ammonia removes every other tag and keeps its text; it
  removes the content too only for `script` and `style`. So no image loads from
  a third party.
- **Headings.** Before ammonia runs, the server changes each heading that
  `markdown` made (`<hN>`) into `<p class="md-hN">`, for N = 1 to 6. ammonia
  allows only those six classes, and only on `p`. The client styles them as
  smaller headings. So user text never enters the page's heading outline. The
  string change is safe because `markdown` escapes each `<` that a user types.
- **Links.** A link keeps only `href`, with the scheme `http`, `https` or
  `mailto`. ammonia sets `rel="noopener noreferrer nofollow ugc"` and
  `target="_blank"` on each link.
- **Newlines.** CommonMark renders a single newline as a space. The client
  styles the comment body's `p` and `li` with `white-space: pre-line`. So a
  single newline shows as a line break, as plain text did before #126.
- **One policy.** One Rust constant holds the tags, the attributes, the classes,
  the schemes and the link values. ammonia reads it. A generated `CommentHtmlPolicy.ts`
  exports it, as `HygieneCaps.ts` exports the caps (ADR-0029). The
  `neosanitize` backstop reads that file. The bindings drift guard catches a
  change on one side only.

**Why.** A Comment needs bold, links, lists and code, not a page layout. A short
allow-list makes the attack surface small. It also stops tracking images. One
policy for both layers stops the client from silently removing server output.

**Considered and rejected.**

- **The ammonia default.** It allows `img`, headings, tables and more. An image
  loads from a third party for each viewer.
- **`img` for `https` only.** It still loads from a third party for each viewer.
- **A hand-written client copy of the policy.** It drifts. The client then
  removes server output, for example `target`, and no test fails.
- **Hard breaks on the server.** Changing each single newline before the render
  is risky inside code blocks.
- **Real heading tags.** Each Comment adds headings to the page outline, and a
  screen reader lists them among the page's real headings.
- **Headings as plain text.** The user's markup seems to disappear.

**Consequences.**

- `CommentView.content` becomes `content_html`. No read sends the raw markdown
  except the owner-scoped `get_post_comment`. It returns a `CommentSource`
  (`id`, `content`) for the edit form.
- Caption Comments (#127) reuse the render, the policy and `CommentSource`.
- A later `Page` entity possibly needs headings. It then gets its own policy.
- A screen reader reads a Comment heading as a paragraph. A strict WCAG audit
  can flag this (technique F2, criterion 1.3.1).
- The heading change depends on the `markdown` output format. A test pins it,
  and the exact version pin blocks a silent change.
