import type { JSX } from "solid-js";

// Mirror of the sprite symbol ids in src/icon-sprite.svg (bare, without the
// `icon-` prefix). Kept in sync by the drift test in Icon.test.tsx.
export const ICON_NAMES = [
  "180-degrees",
  "collage",
  "delete-sign",
  "dog",
  "expand-arrow",
  "fire-heart",
  "landscape",
  "menu",
  "moon",
  "portrait",
  "sun",
  "system",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export type IconProps = {
  name: IconName;
  class?: string;
  label?: string;
};

export default function Icon(props: IconProps): JSX.Element {
  return (
    <svg
      class={props.class}
      focusable="false"
      role={props.label ? "img" : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : "true"}
    >
      <use href={`#icon-${props.name}`} />
    </svg>
  );
}
