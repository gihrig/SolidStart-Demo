import { sanitizeUrl, trustedUrl, type SafeUrl } from "~/lib/sanitizeUrl";
import { authenticatedRpc, publicRpc } from "~/lib/backend-rpc";
import { ICON_NAMES, type IconName } from "~/components/Icon";
import type {
  CategoryPublic,
  PostView as PostViewWire,
  LikeView as LikeViewWire,
  CaptionView as CaptionViewWire,
  AuthorRef as AuthorRefWire,
  HeroView as HeroViewWire,
  CommentView as CommentViewWire,
} from "~/types/backend";
import type {
  JediCategory,
  HeroView,
  AuthorRef,
  Like,
  PostDraft,
  PostView,
  CommentView,
  CaptionView,
} from "~/types/jedi";

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

// Real back-end calls now (#117, #118): Posts come from `list_posts` as the
// enriched `PostView` wire type, and a Post's Captions from
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

const toLike = (l: LikeViewWire): Like => ({
  id: l.id,
  likeCount: l.like_count,
  liked: l.liked,
});

const toCaptionView = (c: CaptionViewWire): CaptionView => ({
  id: c.id,
  postId: c.post_id,
  author: toAuthorRef(c.author),
  text: c.text,
  likeCount: c.like_count,
  commentCount: c.comment_count,
});

// A Comment time must parse. A bad time fails here, where each caller has an
// error path, and not later in a render (#125 review).
const wireTime = (time: string): string => {
  if (Number.isNaN(Date.parse(time))) throw new Error(`Invalid Comment time: ${time}`);
  return time;
};

// A Comment (#124, #125), from a read, a write result or a Feed Event
// (`createCommentThread`). The author goes through the sanitize boundary; the
// times stay the wire RFC 3339 strings. `contentHtml` stays the server's
// render: the thread passes it through `sanitizeCommentHtml` (#126).
export const toCommentView = (c: CommentViewWire): CommentView => ({
  id: c.id,
  parentId: c.parent_id,
  author: toAuthorRef(c.author),
  contentHtml: c.content_html,
  ctime: wireTime(c.ctime),
  mtime: wireTime(c.mtime),
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
 * The Jedi data seam. Each body calls a real back-end RPC through the typed
 * `authenticatedRpc` / `publicRpc` (see src/lib/backend-rpc.ts, ADR-0029); the
 * signatures stayed identical through the swap from the former `data.json` mock.
 */
export const jediApi = {
  categories: {
    // Real back-end call now (ADR-0011): the static taxonomy comes from
    // `list_categories`, each row's opaque `icon` mapped to an `IconName`.
    list: async (): Promise<JediCategory[]> =>
      (await publicRpc("list_categories")).map(toJediCategory),
  },
  posts: {
    // Real back-end call now (#117): the ranked Post list comes from the public
    // RPC, each wire `PostView` re-shaped for the components. The view-model
    // derives the featured Post from it, so the featured-Post RPC has no wrapper (#191).
    list: async (): Promise<PostView[]> => (await publicRpc("list_posts")).map(toPostView),
    // Real back-end call (#120): `create_post` needs a login. The draft is sent
    // raw — the back-end is the authoritative URL boundary and rejects an
    // unsafe URL; the returned view passes the sanitize boundary like any read.
    create: async (draft: PostDraft): Promise<PostView> =>
      toPostView(
        await authenticatedRpc("create_post", {
          data: {
            title: draft.title,
            image_src: draft.imageSrc,
            image_alt: draft.imageAlt,
            photographer: draft.photographer,
            photographer_url: draft.photographerUrl,
            source_url: draft.sourceUrl,
            category_ids: draft.categoryIds,
          },
        }),
      ),
    // Real back-end calls (#122): the viewer's like state needs a login. The
    // toggle sends the wanted state, so a repeat is a no-op; the back-end pokes
    // `post_like` and `posts`, so every client refetches the count and ranking.
    getLike: async (postId: number): Promise<Like> =>
      toLike(await authenticatedRpc("get_post_like", { id: postId })),
    toggleLike: async (postId: number, liked: boolean): Promise<Like> =>
      toLike(await authenticatedRpc("toggle_post_like", { data: { id: postId, liked } })),
  },
  captions: {
    // Real back-end call now (#118): Top Captions come from
    // `list_captions_for_post`, already ranked by the back-end.
    listForPost: async (postId: number): Promise<CaptionView[]> =>
      (await publicRpc("list_captions_for_post", { id: postId })).map(toCaptionView),
    // Real back-end call (#121): `add_caption` needs a login. The back-end
    // validates the text (cap 36) and pokes the Post's `post_caption` feed.
    add: async (postId: number, text: string): Promise<CaptionView> =>
      toCaptionView(await authenticatedRpc("add_caption", { data: { post_id: postId, text } })),
    // Real back-end calls (#123): the viewer's like state needs a login. The
    // toggle sends the wanted state, so a repeat is a no-op; the back-end pokes
    // `caption_like` and `post_caption`, so every client refetches the count and
    // the Top Captions ranking.
    getLike: async (captionId: number): Promise<Like> =>
      toLike(await authenticatedRpc("get_caption_like", { id: captionId })),
    toggleLike: async (captionId: number, liked: boolean): Promise<Like> =>
      toLike(await authenticatedRpc("toggle_caption_like", { data: { id: captionId, liked } })),
  },
  comments: {
    // A Post's thread (#124): every Post is public, so the read needs no login;
    // the back-end returns it newest first (#125). The writes need a login. Each
    // write pushes on the Post's `post_comment` Channel; an add or delete also
    // pokes `posts`, for the comment count.
    list: async (postId: number): Promise<CommentView[]> =>
      (await publicRpc("list_post_comments", { id: postId })).map(toCommentView),
    add: async (postId: number, content: string): Promise<CommentView> =>
      toCommentView(
        await authenticatedRpc("add_post_comment", { data: { post_id: postId, content } }),
      ),
    update: async (id: number, content: string): Promise<CommentView> =>
      toCommentView(await authenticatedRpc("update_post_comment", { id, data: { content } })),
    // The stored text of the viewer's own Comment, for its edit form (#126).
    // Only the Owner may read it: a non-owner call fails.
    source: async (id: number): Promise<string> =>
      (await authenticatedRpc("get_post_comment", { id })).content,
    remove: async (id: number): Promise<void> => {
      await authenticatedRpc("delete_post_comment", { id });
    },
  },
  captionComments: {
    // A Caption's thread (#127), in the same shape as `comments`. Each write
    // pushes on the Caption's `caption_comment` Channel; an add or delete also
    // pokes the Post's `post_caption`, for the comment count.
    list: async (captionId: number): Promise<CommentView[]> =>
      (await publicRpc("list_caption_comments", { id: captionId })).map(toCommentView),
    add: async (captionId: number, content: string): Promise<CommentView> =>
      toCommentView(
        await authenticatedRpc("add_caption_comment", {
          data: { caption_id: captionId, content },
        }),
      ),
    update: async (id: number, content: string): Promise<CommentView> =>
      toCommentView(await authenticatedRpc("update_caption_comment", { id, data: { content } })),
    source: async (id: number): Promise<string> =>
      (await authenticatedRpc("get_caption_comment", { id })).content,
    remove: async (id: number): Promise<void> => {
      await authenticatedRpc("delete_caption_comment", { id });
    },
  },
  hero: {
    // Real back-end call now (#119): the public `get_hero` singleton read.
    get: async (): Promise<HeroView> => toHeroView(await publicRpc("get_hero")),
  },
  profile: {
    // Real back-end call now (#119): `get_profile` returns the logged-in User,
    // so it needs a login (the authenticated RPC surface).
    get: async (): Promise<AuthorRef> => toAuthorRef(await authenticatedRpc("get_profile")),
  },
};

/** The `jediApi` contract, so a consumer can inject an in-memory stand-in. */
export type JediApi = typeof jediApi;

/** The calls of one Comment target: `comments` (a Post's thread) or
 *  `captionComments` (a Caption's thread). Both have this one shape. */
export type CommentApi = JediApi["comments"];
