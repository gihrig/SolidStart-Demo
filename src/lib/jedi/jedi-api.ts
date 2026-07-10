import data from "./data.json";
import { sanitizeUrl } from "~/lib/sanitizeUrl";
import type {
  JediData,
  JediPost,
  JediCaption,
  JediCategory,
  AuthorRef,
  PostView,
  CaptionView,
} from "~/types/jedi";

// data.json widens `icon` to `string`; the unit test asserts every
// icon is a real sprite name, so this once-only boundary cast is safe.
const db = data as unknown as JediData;

/** Drop any URL the shared sanitizer rejects (javascript:/data:/etc.). */
const safe = (url: string): string => sanitizeUrl(url) ?? "";

const byLikesDesc = <T extends { likeCount: number }>(a: T, b: T): number =>
  b.likeCount - a.likeCount;

function authorOf(ownerId: number): AuthorRef {
  const u = db.users.find((x) => x.id === ownerId);
  if (!u) throw new Error(`jedi-api: unknown user id ${ownerId}`);
  return { id: u.id, name: u.name, avatarUrl: safe(u.avatarUrl) };
}

function categoriesOf(ids: number[]): JediCategory[] {
  return ids.map((id) => {
    const c = db.categories.find((x) => x.id === id);
    if (!c) throw new Error(`jedi-api: unknown category id ${id}`);
    return c;
  });
}

const commentCountOf = (postId: number): number =>
  db.comments.filter((c) => c.post_id === postId).length;

const toPostView = (p: JediPost): PostView => ({
  id: p.id,
  author: authorOf(p.owner_id),
  title: p.title,
  imageSrc: safe(p.imageSrc),
  imageAlt: p.imageAlt,
  photographer: p.photographer,
  photographerUrl: safe(p.photographerUrl),
  sourceUrl: safe(p.sourceUrl),
  categories: categoriesOf(p.category_ids),
  likeCount: p.likeCount,
  commentCount: commentCountOf(p.id),
});

const toCaptionView = (c: JediCaption): CaptionView => ({
  id: c.id,
  postId: c.post_id,
  author: authorOf(c.owner_id),
  text: c.text,
  likeCount: c.likeCount,
});

const rankedPosts = (): PostView[] => db.posts.map(toPostView).sort(byLikesDesc);

/**
 * RPC-shaped mock. Swapping to the real back-end later replaces each body with a
 * `rpcCall(...)` (see src/lib/backend-rpc.ts); the signatures stay identical.
 */
export const jediApi = {
  categories: {
    list: (): Promise<JediCategory[]> => Promise.resolve(db.categories),
  },
  posts: {
    list: (): Promise<PostView[]> => Promise.resolve(rankedPosts()),
    featured: (): Promise<PostView> => Promise.resolve(rankedPosts()[0]),
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
};
