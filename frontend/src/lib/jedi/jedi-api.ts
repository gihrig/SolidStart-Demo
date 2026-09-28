import data from "./data.json";
import { sanitizeUrl, trustedUrl, type SafeUrl } from "~/lib/sanitizeUrl";
import { caption as captionRpc, category as categoryRpc, post as postRpc } from "~/lib/backend-rpc";
import { ICON_NAMES, type IconName } from "~/components/Icon";
import type {
  CategoryPublic,
  PostView as PostViewWire,
  CaptionView as CaptionViewWire,
  AuthorRef as AuthorRefWire,
} from "~/types/backend";
import type {
  JediData,
  JediCategory,
  HeroView,
  AuthorRef,
  PostView,
  CaptionView,
} from "~/types/jedi";

// data.json widens `icon` to `string`; the unit test asserts every
// icon is a real sprite name, so this once-only boundary cast is safe.
const db = data as unknown as JediData;

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

function authorOf(ownerId: number): AuthorRef {
  const u = db.users.find((x) => x.id === ownerId);
  if (!u) throw new Error(`jedi-api: unknown user id ${ownerId}`);
  return { id: u.id, name: u.name, avatarUrl: safe(u.avatarUrl) };
}

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

const heroContent = (): HeroView => ({
  title: db.hero.title,
  subtitle: db.hero.subtitle,
  ctaText: db.hero.ctaText,
  ctaHref: safe(db.hero.ctaHref),
  backgroundImage: safe(db.hero.backgroundImage),
});

/**
 * RPC-shaped mock. Swapping to the real back-end later replaces each body with a
 * `rpcCall(...)` (see src/lib/backend-rpc.ts); the signatures stay identical.
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
    get: (): Promise<HeroView> => Promise.resolve(heroContent()),
  },
  profile: {
    get: (): Promise<AuthorRef> => Promise.resolve(authorOf(db.profile.userId)),
  },
};
