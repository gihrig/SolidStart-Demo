import { describe, it, expect } from "vite-plus/test";
import { sanitizeCommentHtml } from "./sanitizeCommentHtml";

// The server output of `render_comment_html` (#126), as the back-end render
// tests pin it. The backstop keeps it unchanged.
const LINK =
  '<p><a href="https://x.example/" target="_blank" rel="noopener noreferrer nofollow ugc">x</a></p>';

describe("sanitizeCommentHtml (#126)", () => {
  it("keeps each tag of the policy", () => {
    const html =
      "<p>a<br>b</p><p><strong>s</strong> <em>e</em> <code>c</code></p>" +
      "<pre><code>x\n</code></pre><blockquote><p>q</p></blockquote>" +
      "<ul><li>u</li></ul><ol><li>o</li></ol><hr>";
    expect(sanitizeCommentHtml(html)).toBe(html);
  });

  it.each(["md-h1", "md-h2", "md-h3", "md-h4", "md-h5", "md-h6"])(
    "keeps the heading class %s on a p",
    (name) => {
      const html = `<p class="${name}">Title</p>`;
      expect(sanitizeCommentHtml(html)).toBe(html);
    },
  );

  it("keeps a link's href, rel and target", () => {
    expect(sanitizeCommentHtml(LINK)).toBe(LINK);
  });

  it("keeps a mailto link", () => {
    expect(sanitizeCommentHtml('<a href="mailto:a@x.example">a</a>')).toBe(
      '<a href="mailto:a@x.example">a</a>',
    );
  });

  it("removes a class that is not in the policy", () => {
    expect(sanitizeCommentHtml('<p class="md-h7">x</p>')).toBe("<p>x</p>");
    expect(sanitizeCommentHtml('<p class="evil">x</p>')).toBe("<p>x</p>");
    expect(sanitizeCommentHtml('<em class="md-h1">x</em>')).toBe("<em>x</em>");
  });

  it("removes an href with another scheme, or with no scheme", () => {
    expect(sanitizeCommentHtml('<a href="ftp://x.example/">x</a>')).toBe("<a>x</a>");
    expect(sanitizeCommentHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeCommentHtml('<a href="/y">x</a>')).toBe("<a>x</a>");
  });

  it("removes a tag outside the policy, and keeps its text", () => {
    expect(sanitizeCommentHtml("<h1>x</h1>")).toBe("x");
    expect(sanitizeCommentHtml('<img src="https://x.example/y.png">')).toBe("");
  });

  it("removes a script with its content", () => {
    expect(sanitizeCommentHtml("<p>a</p><script>alert(1)</script>")).toBe("<p>a</p>");
  });

  it("removes an attribute that is not in the policy", () => {
    expect(sanitizeCommentHtml('<p onclick="alert(1)" title="t">x</p>')).toBe("<p>x</p>");
  });
});
