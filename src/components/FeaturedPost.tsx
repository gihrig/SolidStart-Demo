import { For } from "solid-js";
import { trustedUrl } from "~/lib/sanitizeUrl";
import type { PostView, CaptionView } from "~/types/jedi";
import Image from "~/components/Image";
import Author from "~/components/Author";
import Icon from "~/components/Icon";

export interface FeaturedPostProps {
  post: PostView;
  /** The winning Caption shown on the post (a first-class entity, not bare
   *  text); undefined until the post's captions load or when it has none. */
  caption?: CaptionView;
}

export default function FeaturedPost(props: FeaturedPostProps) {
  const isLiked = () => false;
  // Like/comment/edit/delete are placeholders until they land on the feed seam.
  const notImplemented = (e: MouseEvent) => {
    e.preventDefault();
    alert("Not implemented");
  };

  return (
    <article class="card-style">
      {/* Title bar */}
      <div class="flex items-center justify-between px-4 h-14">
        <h2 class="text-2xl font-bold w-1/2 truncate">{props.post.title}</h2>
        <div class="text-sm text-(--theme-muted)">
          flickr @{" "}
          <a
            href={props.post.photographerUrl}
            class="hover:underline rounded"
            target="_blank"
            rel="noreferrer"
          >
            {props.post.photographer}
          </a>
        </div>
      </div>
      {/* Image */}
      <Image
        src={props.post.imageSrc}
        alt={props.post.imageAlt}
        href={props.post.sourceUrl}
        loading="lazy"
      />
      {/* Body: author, caption, tags, actions */}
      <div class="p-4 pb-2">
        <Author
          avatarSrc={props.post.author.avatarUrl}
          name={props.post.author.name}
          href={trustedUrl("#")}
          onClick={notImplemented}
        />
        <p class="text-5xl mb-10 px-4 font-hero">{props.caption?.text ?? ""}</p>
        <div class="flex items-center gap-2 text-sm mb-5">
          <For each={props.post.categories}>
            {(c) => (
              <button type="button" onClick={() => {}} class="theme-button">
                {c.name}
              </button>
            )}
          </For>
        </div>
        <div class="flex items-center justify-between text-sm px-2">
          <a
            class="font-bold hover:underline rounded"
            href="#"
            aria-label={`Open Comments page, ${props.post.commentCount} comments`}
            onClick={notImplemented}
          >
            Comments
            <span class="font-light text-(--theme-card-fg) ml-2">{props.post.commentCount}</span>
          </a>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-1">
              <Icon name="fire-heart" class="w-5 -mt-1" />
              <span class="font-light text-(--theme-card-fg) ml-2">
                <span class="sr-only">Likes: </span>
                {props.post.likeCount}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {}}
              class="theme-button"
              aria-pressed={isLiked()}
              aria-label={`Like post by ${props.post.author.name}`}
            >
              Like
            </button>
            <button
              type="button"
              onClick={() => {}}
              class="theme-button"
              aria-label={`Edit Post by ${props.post.author.name}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {}}
              class="theme-button"
              aria-label={`Delete Post by ${props.post.author.name}`}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
