import { sanitizeUrl, trustedUrl, type SafeUrl } from "~/lib/sanitizeUrl";
import {
  caption as captionRpc,
  category as categoryRpc,
  hero as heroRpc,
  post as postRpc,
  profile as profileRpc,
} from "~/lib/backend-rpc";
import { ICON_NAMES, type IconName } from "~/components/Icon";
import type {
  CategoryPublic,
  PostView as PostViewWire,
  CaptionView as CaptionViewWire,
  AuthorRef as AuthorRefWire,
  HeroView as HeroViewWire,
} from "~/types/backend";
import type { JediCategory, HeroView, AuthorRef, PostView, CaptionView } from "~/types/jedi";

/** The single sanitize boundary (ADR-0002): every URL field passes through here.
 *  A rejected URL collapses to the empty `SafeUrl`; consumers bind it raw. */
const safe = (url: string): SafeUrl => sanitizeUrl(url) ?? trustedUrl("");

// The back-end owns `Category.icon` as an opaque string (ADR-0011). This seam
// maps that key to a sprite `IconName`, falling back to "menu" for any key the
// front-end sprite does not carry — so an unknown icon renders a placeholder
// rather than a broken reference.
const ICON_FALLBACK: IconName = "menu";
const toIconName = (icon: string): IconName =>
  (ICON_NAMES as readonly string[]).includes(icon) ? (icon as IconName) : ICON_FALLBACK;

const toJediCategory = (c: CategoryPublic): JediCategory => ({
  id: c.id,
  name: c.name,
  icon: toIconName(c.icon),
});

// Real back-end calls now (#117, #118): Posts come from `list_posts` /
// `featured_post` as the enriched `PostView` wire type, and a Post's Captions from
// `list_captions_for_post` as the enriched `CaptionView`. These seams re-shape one wire view into
// the contract the components consume — URL fields routed through the single
// sanitize boundary, opaque Category icons mapped to sprite names. The back-end
// already ranks and derives the counts, so the front-end never re-ranks.
const toAuthorRef = (a: AuthorRefWire): AuthorRef => ({
  id: a.id,
  name: a.name,
  avatarUrl: safe(a.avatar_url ?? ""),
});

const toPostView = (p: PostViewWire): PostView => ({
  id: p.id,
  author: toAuthorRef(p.author),
  title: p.title,
  imageSrc: safe(p.image_src),
  imageAlt: p.image_alt,
  photographer: p.photographer,
  photographerUrl: safe(p.photographer_url),
  sourceUrl: safe(p.source_url),
  categories: p.categories.map(toJediCategory),
  likeCount: p.like_count,
  commentCount: p.comment_count,
});

// The wire `comment_count` is dropped here: front-end Caption comment counts
// land with Caption Comments (#127).
const toCaptionView = (c: CaptionViewWire): CaptionView => ({
  id: c.id,
  postId: c.post_id,
  author: toAuthorRef(c.author),
  text: c.text,
  likeCount: c.like_count,
});

// The Hero singleton (#119). The wire view has no `cta_href`: the CTA runs fixed
// front-end code, so `HeroView` carries only the sanitized background image.
const toHeroView = (h: HeroViewWire): HeroView => ({
  title: h.title,
  subtitle: h.subtitle,
  ctaText: h.cta_text,
  backgroundImage: safe(h.background_image),
});

/**
 * The Jedi data seam. Each body calls a real back-end RPC (see
 * src/lib/backend-rpc.ts); the signatures stayed identical through the swap
 * from the former `data.json` mock.
 */
export const jediApi = {
  categories: {
    // Real back-end call now (ADR-0011): the static taxonomy comes from
    // `list_categories`, each row's opaque `icon` mapped to an `IconName`.
    list: async (): Promise<JediCategory[]> => (await categoryRpc.list()).map(toJediCategory),
  },
  posts: {
    // Real back-end calls now (#117): the ranked Post list and the featured Post
    // come from the public RPCs, each wire `PostView` re-shaped for the components.
    list: async (): Promise<PostView[]> => (await postRpc.list()).map(toPostView),
    featured: async (): Promise<PostView> => toPostView(await postRpc.featured()),
  },
  captions: {
    // Real back-end call now (#118): Top Captions come from
    // `list_captions_for_post`, already ranked by the back-end.
    listForPost: async (postId: number): Promise<CaptionView[]> =>
      (await captionRpc.listForPost(postId)).map(toCaptionView),
  },
  hero: {
    // Real back-end call now (#119): the public `get_hero` singleton read.
    get: async (): Promise<HeroView> => toHeroView(await heroRpc.get()),
  },
  profile: {
    // Real back-end call now (#119): `get_profile` returns the logged-in User,
    // so it needs a login (the authenticated RPC surface).
    get: async (): Promise<AuthorRef> => toAuthorRef(await profileRpc.get()),
  },
};

/** The `jediApi` contract, so a consumer can inject an in-memory stand-in. */
export type JediApi = typeof jediApi;
