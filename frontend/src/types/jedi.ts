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

/** The viewer's like state of one Post (#122): the live count, and whether the
 *  logged-in viewer likes it. The anonymous `PostView` cannot carry `liked`. */
export interface PostLike {
  postId: number;
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
}
