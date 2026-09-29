import { describe, it, expect, vi, beforeEach } from "vite-plus/test";

// Pass-through spy: lets us assert every URL field is routed through the
// sanitizer, without re-testing sanitizeUrl (it has its own unit tests).
// `trustedUrl` is the seam's empty-URL fallback, so the mock must export it too.
vi.mock("~/lib/sanitizeUrl", () => ({
  sanitizeUrl: vi.fn((u: string) => u),
  trustedUrl: (u: string) => u,
}));

// `categories.list` / `posts.*` / `captions.listForPost` now call the real RPCs
// (ADR-0011, #117, #118), so the back-end client is mocked here — the seam under
// test is the wire→contract mapping (icon mapping, URL sanitize, author/category
// re-shape), not the network. The hoisted fns let each test program its own rows.
const {
  categoryListMock,
  postListMock,
  postFeaturedMock,
  postCreateMock,
  captionListForPostMock,
  captionAddMock,
  heroGetMock,
  profileGetMock,
} = vi.hoisted(() => ({
  categoryListMock: vi.fn(),
  postListMock: vi.fn(),
  postFeaturedMock: vi.fn(),
  postCreateMock: vi.fn(),
  captionListForPostMock: vi.fn(),
  captionAddMock: vi.fn(),
  heroGetMock: vi.fn(),
  profileGetMock: vi.fn(),
}));
vi.mock("~/lib/backend-rpc", () => ({
  category: { list: categoryListMock },
  post: { list: postListMock, featured: postFeaturedMock, create: postCreateMock },
  caption: { listForPost: captionListForPostMock, add: captionAddMock },
  hero: { get: heroGetMock },
  profile: { get: profileGetMock },
}));

import { sanitizeUrl } from "~/lib/sanitizeUrl";
import { ICON_NAMES } from "~/components/Icon";
import { jediApi } from "./jedi-api";

const sanitizeSpy = sanitizeUrl as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => sanitizeSpy.mockClear());

// The seeded taxonomy (frontend/src/lib/jedi/data.json ↔ 02-dev-seed.sql).
const SEEDED_CATEGORIES = [
  { id: 1, name: "Landscape", icon: "landscape" },
  { id: 2, name: "People", icon: "portrait" },
  { id: 3, name: "Animals", icon: "dog" },
  { id: 4, name: "Abstract", icon: "collage" },
  { id: 5, name: "Black & White", icon: "180-degrees" },
  { id: 6, name: "Cute", icon: "fire-heart" },
];

describe("jediApi.categories", () => {
  beforeEach(() => categoryListMock.mockResolvedValue(SEEDED_CATEGORIES));

  it("lists all categories including the added 'Cute'", async () => {
    const cats = await jediApi.categories.list();
    expect(cats.map((c) => c.name)).toEqual([
      "Landscape",
      "People",
      "Animals",
      "Abstract",
      "Black & White",
      "Cute",
    ]);
  });

  // Relaxed from "every icon is a real sprite name": the back-end `icon` is now
  // an opaque key, so the seam maps a known key to itself and any unknown key to
  // the fallback. Either way the result is always a valid IconName.
  it("maps each opaque icon key to a known IconName or the fallback", async () => {
    categoryListMock.mockResolvedValueOnce([
      { id: 1, name: "Known", icon: "dog" },
      { id: 2, name: "Unknown", icon: "no-such-icon" },
    ]);
    const cats = await jediApi.categories.list();
    expect(cats.map((c) => c.icon)).toEqual(["dog", "menu"]);
    for (const c of cats) expect(ICON_NAMES).toContain(c.icon);
  });
});

// The wire `PostView` shape the back-end returns (snake_case, enriched: author +
// resolved Categories + derived counts). `list_posts` is already ranked by the
// back-end, so the fixture is pre-ranked; the front-end never re-ranks (#117).
const WIRE_POST_1 = {
  id: 1,
  author: {
    id: 1,
    name: "Lisa",
    avatar_url: "https://img.icons8.com/doodle/96/null/lisa-simpson.png",
  },
  title: "Little Jedi",
  image_src: "https://live.staticflickr.com/1.jpg",
  image_alt: "Little Jedi cat",
  photographer: "Felicity Berkleef",
  photographer_url: "https://www.flickr.com/photos/felicefelines/",
  source_url: "https://www.flickr.com/photos/felicefelines/1/",
  categories: [
    { id: 3, name: "Animals", icon: "dog" },
    { id: 6, name: "Cute", icon: "fire-heart" },
  ],
  like_count: 5,
  comment_count: 3,
};
const WIRE_POST_2 = {
  id: 2,
  author: {
    id: 2,
    name: "Homer",
    avatar_url: "https://img.icons8.com/doodle/96/null/homer-simpson.png",
  },
  title: "Brilliant tree",
  image_src: "https://live.staticflickr.com/2.jpg",
  image_alt: "Brilliant tree",
  photographer: "Sunsword & Moonsabre",
  photographer_url: "https://www.flickr.com/photos/sunsward7/",
  source_url: "https://www.flickr.com/photos/sunsward7/2/",
  categories: [{ id: 1, name: "Landscape", icon: "landscape" }],
  like_count: 4,
  comment_count: 1,
};

describe("jediApi.posts", () => {
  beforeEach(() => {
    postListMock.mockResolvedValue([WIRE_POST_1, WIRE_POST_2]);
    postFeaturedMock.mockResolvedValue(WIRE_POST_1);
  });

  it("preserves the back-end ranking order (does not re-rank)", async () => {
    const posts = await jediApi.posts.list();
    expect(posts.map((p) => p.id)).toEqual([1, 2]);
    expect(posts[0].title).toBe("Little Jedi");
    expect(posts.map((p) => p.likeCount)).toEqual([5, 4]);
  });

  it("re-shapes the author snapshot from the wire view", async () => {
    const [first] = await jediApi.posts.list();
    expect(first.author).toEqual({
      id: 1,
      name: "Lisa",
      avatarUrl: "https://img.icons8.com/doodle/96/null/lisa-simpson.png",
    });
  });

  it("maps the resolved Categories, opaque icons mapped to sprite names", async () => {
    const [first] = await jediApi.posts.list();
    expect(first.categories.map((c) => c.name)).toEqual(["Animals", "Cute"]);
    for (const c of first.categories) expect(ICON_NAMES).toContain(c.icon);
  });

  it("carries the back-end-derived commentCount", async () => {
    const [first] = await jediApi.posts.list();
    expect(first.commentCount).toBe(3);
  });

  it("featured() re-shapes the top-ranked wire post", async () => {
    const featured = await jediApi.posts.featured();
    expect(featured.id).toBe(1);
    expect(featured.title).toBe("Little Jedi");
  });

  it("routes every URL field through the sanitizer (single boundary)", async () => {
    const [post] = await jediApi.posts.list();
    const args = sanitizeSpy.mock.calls.flat();
    expect(args).toContain(post.imageSrc);
    expect(args).toContain(post.photographerUrl);
    expect(args).toContain(post.sourceUrl);
    expect(args).toContain(post.author.avatarUrl);
  });

  it("create() sends the draft as the wire PostForCreate and re-shapes the result (#120)", async () => {
    postCreateMock.mockResolvedValue(WIRE_POST_2);
    const created = await jediApi.posts.create({
      title: "Brilliant tree",
      imageSrc: "https://live.staticflickr.com/2.jpg",
      imageAlt: "Brilliant tree",
      photographer: "Sunsword & Moonsabre",
      photographerUrl: "https://www.flickr.com/photos/sunsward7/",
      sourceUrl: "https://www.flickr.com/photos/sunsward7/2/",
      categoryIds: [1],
    });
    expect(postCreateMock).toHaveBeenCalledWith({
      title: "Brilliant tree",
      image_src: "https://live.staticflickr.com/2.jpg",
      image_alt: "Brilliant tree",
      photographer: "Sunsword & Moonsabre",
      photographer_url: "https://www.flickr.com/photos/sunsward7/",
      source_url: "https://www.flickr.com/photos/sunsward7/2/",
      category_ids: [1],
    });
    expect(created.id).toBe(2);
    expect(created.author.name).toBe("Homer");
    expect(created.categories.map((c) => c.name)).toEqual(["Landscape"]);
  });
});

// The wire `HeroView` the back-end returns: the seeded singleton (#119). It has
// no `cta_href` — the CTA runs fixed front-end code.
const WIRE_HERO = {
  id: 1,
  title: "Awesome Photos & Captions",
  subtitle: "Share your favorite Photos from Flickr and add a great caption",
  cta_text: "Get Started",
  background_image: "https://live.staticflickr.com/65535/49909538937_3255dcf9e7_b.jpg",
};

describe("jediApi.hero", () => {
  beforeEach(() => heroGetMock.mockResolvedValue(WIRE_HERO));

  it("returns the back-end Hero, re-shaped with no CTA href", async () => {
    const hero = await jediApi.hero.get();
    expect(hero).toEqual({
      title: "Awesome Photos & Captions",
      subtitle: "Share your favorite Photos from Flickr and add a great caption",
      ctaText: "Get Started",
      backgroundImage: "https://live.staticflickr.com/65535/49909538937_3255dcf9e7_b.jpg",
    });
  });

  it("routes the background image through the sanitizer (single boundary)", async () => {
    const hero = await jediApi.hero.get();
    expect(sanitizeSpy.mock.calls.flat()).toContain(hero.backgroundImage);
  });
});

describe("jediApi.profile", () => {
  it("returns the current User from get_profile for the nav avatar", async () => {
    profileGetMock.mockResolvedValue({
      id: 1,
      name: "Lisa",
      avatar_url: "https://img.icons8.com/doodle/96/null/lisa-simpson.png",
    });
    const profile = await jediApi.profile.get();
    expect(profile).toEqual({
      id: 1,
      name: "Lisa",
      avatarUrl: "https://img.icons8.com/doodle/96/null/lisa-simpson.png",
    });
    expect(sanitizeSpy.mock.calls.flat()).toContain(profile.avatarUrl);
  });

  it("maps a User with no avatar to the empty URL", async () => {
    profileGetMock.mockResolvedValue({ id: 1000, name: "demo1", avatar_url: null });
    const profile = await jediApi.profile.get();
    expect(profile).toEqual({ id: 1000, name: "demo1", avatarUrl: "" });
  });
});

// The wire `CaptionView`s the back-end returns for seeded Post 1 (snake_case,
// enriched: author + derived counts). The seeded `caption_like` rows give Captions
// 1 and 2 their fixture like counts, 8 and 5, ranked by like count (#177).
const WIRE_CAPTIONS_POST_1 = [
  {
    id: 1,
    post_id: 1,
    author: {
      id: 1,
      name: "Lisa",
      avatar_url: "https://img.icons8.com/doodle/96/null/lisa-simpson.png",
    },
    text: "Jedi Kitty protects the street",
    like_count: 8,
    comment_count: 0,
  },
  {
    id: 2,
    post_id: 1,
    author: {
      id: 3,
      name: "Bart",
      avatar_url: "https://img.icons8.com/doodle/96/null/bart-simpson.png",
    },
    text: "May the paws be with you",
    like_count: 5,
    comment_count: 0,
  },
];

describe("jediApi.captions", () => {
  beforeEach(() => {
    captionListForPostMock.mockReset();
    captionListForPostMock.mockImplementation((postId: number) =>
      Promise.resolve(postId === 1 ? WIRE_CAPTIONS_POST_1 : []),
    );
  });

  it("asks the back-end for the given post's captions", async () => {
    await jediApi.captions.listForPost(1);
    expect(captionListForPostMock).toHaveBeenCalledWith(1);
  });

  it("preserves the back-end ranking order (Top Captions, does not re-rank)", async () => {
    const caps = await jediApi.captions.listForPost(1);
    expect(caps.map((c) => c.id)).toEqual([1, 2]);
    expect(caps.map((c) => c.likeCount)).toEqual([8, 5]);
    expect(caps[0].text).toBe("Jedi Kitty protects the street");
    expect(caps[0].postId).toBe(1);
  });

  it("re-shapes the author snapshot from the wire view", async () => {
    const [first] = await jediApi.captions.listForPost(1);
    expect(first.author).toEqual({
      id: 1,
      name: "Lisa",
      avatarUrl: "https://img.icons8.com/doodle/96/null/lisa-simpson.png",
    });
  });

  it("routes the author avatar through the sanitizer (single boundary)", async () => {
    const [first] = await jediApi.captions.listForPost(1);
    expect(sanitizeSpy.mock.calls.flat()).toContain(first.author.avatarUrl);
  });

  it("returns [] for a post with no captions", async () => {
    expect(await jediApi.captions.listForPost(999)).toEqual([]);
  });

  it("add() sends the wire CaptionForCreate and re-shapes the result (#121)", async () => {
    captionAddMock.mockResolvedValue(WIRE_CAPTIONS_POST_1[1]);
    const added = await jediApi.captions.add(1, "May the paws be with you");
    expect(captionAddMock).toHaveBeenCalledWith({ post_id: 1, text: "May the paws be with you" });
    expect(added).toEqual({
      id: 2,
      postId: 1,
      author: {
        id: 3,
        name: "Bart",
        avatarUrl: "https://img.icons8.com/doodle/96/null/bart-simpson.png",
      },
      text: "May the paws be with you",
      likeCount: 5,
    });
  });
});
