Compare Solid JS splitProps vs direct use of props.\*

Types:

```typescript
interface CardProps {
  title?: string;
  class?: string;
  children: JSX.Element;
}
```

Example mergePros/splitProps:

This is the idiomatic SolidJS pattern used in most professional codebases and UI libraries (Kobalte, Solid UI, etc.).
In short: mergeProps is the safe, reactive way to provide defaults and combine prop objects without breaking Solid's fine-grained reactivity system.

Applied to Card
Apply to:
Hero
Image
Author

```tsx
import { splitProps, mergeProps } from "solid-js";
import type { JSX } from "solid-js";

export default function Card(props: CardProps) {
  const defaulted = mergeProps(
    {
      title: "Untitled",
      class: "",
    },
    props,
  );

  const [local, rest] = splitProps(defaulted, ["title", "class", "children"]);

  return (
    <section
      class={`flex flex-col overflow-hidden relative rounded-2xl shadow-lg mb-8 pb-4 bg-(--theme-card-bg) text-(--theme-card-fg) ${local.class}`}
      {...rest}
    >
      {local.title && (
        <h2 class="text-2xl font-bold px-4 pt-4 pb-2 text-(--theme-card-fg)">{local.title}</h2>
      )}
      <div class="p-4 pt-0">{local.children}</div>
    </section>
  );
}
```

Example splitProps:

```tsx
import { splitProps } from "solid-js";
import type { JSX } from "solid-js";

export default function Card(props: CardProps) {
  const [local, rest] = splitProps(props, ["class", "title", "children"]);

  return (
    <section
      class={`flex flex-col overflow-hidden relative rounded-2xl shadow-lg mb-8 pb-4 bg-(--theme-card-bg) text-(--theme-card-fg)${local.class ? ` ${local.class}` : ""}`}
      {...rest}
    >
      {local.title && (
        <h2 class="text-2xl font-bold px-4 pt-4 pb-2 text-(--theme-card-fg)">{local.title}</h2>
      )}
      <div class="p-4 pt-0">{local.children}</div>
    </section>
  );
}
```

Example direct props:

```tsx
import type { JSX } from "solid-js";

export default function Card(props: CardProps) {
  return (
    <section
      class={`flex flex-col overflow-hidden relative rounded-2xl shadow-lg mb-8 pb-4 bg-(--theme-card-bg) text-(--theme-card-fg)${props.class ? ` ${props.class}` : ""}`}
    >
      {props.title && (
        <h2 class="text-2xl font-bold px-4 pt-4 pb-2 text-(--theme-card-fg)">{props.title}</h2>
      )}
      <div class="p-4 pt-0">{props.children}</div>
    </section>
  );
}
```
