import type { IconName } from "~/components/Icon";
import type { SafeUrl } from "~/lib/sanitizeUrl";

/** A Category as the components consume it: the back-end's opaque `icon` key
 *  already mapped to a sprite `IconName` (see `jedi-api`). */
export interface JediCategory {
  id: number;
  name: string;
  icon: IconName;
}

/* ---- Response shapes: what jedi-api returns (author joined, categories
   resolved, counts derived, URLs sanitized). The contract components consume. */

export interface AuthorRef {
  id: number;
  name: string;
  avatarUrl: SafeUrl;
}

export interface PostView {
  id: number;
  author: AuthorRef;
  title: string;
  imageSrc: SafeUrl;
  imageAlt: string;
  photographer: string;
  photographerUrl: SafeUrl;
  sourceUrl: SafeUrl;
  categories: JediCategory[];
  likeCount: number;
  commentCount: number;
}

/** The viewer's like state of one Like target, a Post (#122) or a Caption
 *  (#123): the live count, and whether the logged-in viewer likes it. `id` is
 *  the target's id. The anonymous `PostView` cannot carry `liked`. */
export interface Like {
  id: number;
  likeCount: number;
  liked: boolean;
}

/** A new Post as the create form submits it (#120): the seam maps it to the
 *  wire `PostForCreate`. The back-end validates and rejects unsafe URLs. */
export interface PostDraft {
  title: string;
  imageSrc: string;
  imageAlt: string;
  photographer: string;
  photographerUrl: string;
  sourceUrl: string;
  categoryIds: number[];
}

/** The changed fields of a Post edit (#187): the seam maps them to the wire
 *  `PostForUpdate`. The photo never changes, so there is no `imageSrc`. */
export type PostChanges = Partial<Omit<PostDraft, "imageSrc">>;

/** Hero as returned by the seam: its URL field is sanitized. There is no CTA
 *  href: the CTA runs fixed front-end code (#119, ADR-0011 addendum). */
export interface HeroView {
  title: string;
  subtitle: string;
  ctaText: string;
  backgroundImage: SafeUrl;
}

export interface CaptionView {
  id: number;
  postId: number;
  author: AuthorRef;
  text: string;
  likeCount: number;
  /** The derived count of the Caption's Comments (#127). */
  commentCount: number;
}

/** One Comment in a thread (#124, #125). `parentId` is the id of the Post or
 *  the Caption that holds the thread (#127). `author.id` gates the Edit / Delete buttons: a content
 *  entity's author is its Owner. `contentHtml` is the server's sanitized render
 *  of the stored markdown (#126); a consumer injects it only through the
 *  `sanitizeCommentHtml` backstop. `ctime` and `mtime` are the wire RFC 3339
 *  times; `mtime` differs from `ctime` after an edit. */
export interface CommentView {
  id: number;
  parentId: number;
  author: AuthorRef;
  contentHtml: string;
  ctime: string;
  mtime: string;
}
