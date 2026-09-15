import data from "./data.json";
import { sanitizeUrl, trustedUrl, type SafeUrl } from "~/lib/sanitizeUrl";
import { category as categoryRpc, post as postRpc } from "~/lib/backend-rpc";
import { ICON_NAMES, type IconName } from "~/components/Icon";
import type {
  CategoryPublic,
  PostView as PostViewWire,
  AuthorRef as AuthorRefWire,
} from "~/types/backend";
import type {
  JediData,
  JediCaption,
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

const byLikesDesc = <T extends { likeCount: number }>(a: T, b: T): number =>
  b.likeCount - a.likeCount;

function authorOf(ownerId: number): AuthorRef {
  const u = db.users.find((x) => x.id === ownerId);
  if (!u) throw new Error(`jedi-api: unknown user id ${ownerId}`);
  return { id: u.id, name: u.name, avatarUrl: safe(u.avatarUrl) };
}

// Real back-end call now (#117): Posts come from `list_posts` / `featured_post`
// as the enriched `PostView` wire type. These seams re-shape one wire view into
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

const toCaptionView = (c: JediCaption): CaptionView => ({
  id: c.id,
  postId: c.post_id,
  author: authorOf(c.owner_id),
  text: c.text,
  likeCount: c.likeCount,
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
    listForPost: (postId: number): Promise<CaptionView[]> =>
      Promise.resolve(
        db.captions
          .filter((c) => c.post_id === postId)
          .map(toCaptionView)
          .sort(byLikesDesc),
      ),
  },
  hero: {
    get: (): Promise<HeroView> => Promise.resolve(heroContent()),
  },
  profile: {
    get: (): Promise<AuthorRef> => Promise.resolve(authorOf(db.profile.userId)),
  },
};
