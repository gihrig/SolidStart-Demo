import type { IconName } from "~/components/Icon";
import type { SafeUrl } from "~/lib/sanitizeUrl";

/* ---- Storage shapes: one object per row, mirroring a future DB table. ----
   IDs are plain numbers (JSON has no bigint; the RPC wire format is numeric). */

export interface JediUser {
  id: number;
  name: string;
  avatarUrl: string;
}

export interface JediCategory {
  id: number;
  name: string;
  icon: IconName;
}

export interface JediPost {
  id: number;
  owner_id: number;
  title: string;
  imageSrc: string;
  imageAlt: string;
  photographer: string;
  photographerUrl: string;
  sourceUrl: string;
  category_ids: number[];
  likeCount: number;
}

export interface JediCaption {
  id: number;
  post_id: number;
  owner_id: number;
  text: string;
  likeCount: number;
}

export interface JediComment {
  id: number;
  post_id: number;
  owner_id: number;
  body: string;
}

export interface JediHero {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaHref: string;
  backgroundImage: string;
}

export interface JediProfile {
  userId: number;
}

export interface JediData {
  users: JediUser[];
  categories: JediCategory[];
  posts: JediPost[];
  captions: JediCaption[];
  comments: JediComment[];
  hero: JediHero;
  profile: JediProfile;
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

/** Hero as returned by the seam: its URL fields are sanitized (`JediHero` is the
 *  raw storage row). Mirrors the `JediPost`→`PostView` storage/view split. */
export interface HeroView {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaHref: SafeUrl;
  backgroundImage: SafeUrl;
}

export interface CaptionView {
  id: number;
  postId: number;
  author: AuthorRef;
  text: string;
  likeCount: number;
}
