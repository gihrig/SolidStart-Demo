import { Sanitizer } from "neosanitize";
import { COMMENT_HTML_POLICY as POLICY } from "~/types/backend";

// The policy's lists, typed for a lookup by any string.
const CLASSES: Readonly<Record<string, readonly string[]>> = POLICY.classes;
const URL_SCHEMES: readonly string[] = POLICY.url_schemes;

/** The scheme of a URL, lower-cased; undefined for a relative URL. */
const schemeOf = (url: string): string | undefined =>
  /^([a-z][a-z\d+.-]*):/i.exec(url.trim())?.[1].toLowerCase();

const builder = Sanitizer.builder().allow([...POLICY.tags]);
for (const [tag, attrs] of Object.entries(POLICY.tag_attributes)) builder.allow(tag, attrs);
for (const tag of Object.keys(CLASSES)) builder.allow(tag, ["class"]);
builder.allow("a", ["rel", "target"]).transformAttribute(({ tag, name, value }) => {
  switch (name) {
    case "class":
      return CLASSES[tag]?.includes(value) ? undefined : null;
    case "href": {
      const scheme = schemeOf(value);
      return scheme !== undefined && URL_SCHEMES.includes(scheme) ? undefined : null;
    }
    case "rel":
      return POLICY.link_rel;
    case "target":
      return POLICY.link_target;
    default:
      return undefined;
  }
});
const sanitizer = builder.build();

/**
 * The client backstop of the Comment render (#126, ADR-0019 addendum). The
 * server already cleans `CommentView.contentHtml` with ammonia; this cleans it
 * again, deny-by-default, under the same generated policy
 * (`CommentHtmlPolicy.ts`), before the thread injects it as HTML. A tag outside
 * the policy is removed and its text kept; `script` and `style` lose their
 * content too. Only the six heading classes and the three URL schemes survive,
 * and a link's `rel` and `target` take the policy's values.
 */
export const sanitizeCommentHtml = (html: string): string => sanitizer.sanitize(html);
