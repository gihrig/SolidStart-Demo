# User input is defended in layers: reject on write, sanitize on read, escape at sinks

No single layer is trusted. Each layer covers a gap in the others.

## Decisions

- **Write: the server rejects, it does not repair.** Each URL field must be safe,
  or the write fails. Each free-text field is NFC-normalized and trimmed. The
  server rejects C0/C1 control characters (not tab or newline), zero-width and
  bidi-override characters, and text over the field's length cap. The server
  stores the original text. It never HTML-escapes on write.
- **Read: the server renders and sanitizes HTML.** Comment content is markdown.
  `markdown::to_html` renders it, and ammonia cleans it with an explicit policy.
  The allowed tags are `p`, `br`, `strong`, `em`, `code`, `pre`, `blockquote`,
  `ul`, `ol`, `li`, `a` and `hr`. Headings become `<p class="md-hN">`. A link
  keeps only `href` (`http`, `https`, `mailto`) and gets
  `rel="noopener noreferrer nofollow ugc"`. Other text fields go out as plain text.
- **One policy, exported.** One Rust constant holds the HTML policy. ts-rs
  exports it as `CommentHtmlPolicy.ts`, and the length caps as `HygieneCaps.ts`.
  The drift guard catches a change on one side only.
- **Client: escape by default, sanitize again before `innerHTML`.** Solid
  escapes each text node. Server HTML goes through `neosanitize` with the
  exported policy before `innerHTML`.
- **Client URLs carry a `SafeUrl` brand.** `sanitizeUrl` returns a `SafeUrl` or
  `undefined`. `trustedUrl` brands a developer constant with no check. Each
  URL prop requires `SafeUrl`, so a raw string fails `tsc`.

## Considered and rejected

- **One authoritative layer.** One layer that fails leaves the input open.
- **Escape or strip on write.** The render then double-escapes, and the stored
  text loses fidelity.
- **Markdown in the client.** It adds download and CPU, and it removes the
  server guarantee.
- **The ammonia default policy.** It allows `img`, so each viewer loads an
  image from a third party.
- **A comment-only URL convention.** Nothing stops a raw string at a URL prop.

## Consequences

- DOM attributes are typed `string`, so a direct `<a href={raw}>` still passes
  `tsc`. The guarantee is in the data, not at the DOM sink.
- A screen reader reads a Comment heading as a paragraph (WCAG F2, 1.3.1).
