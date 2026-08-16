/// <reference types="@solidjs/start/env" />

import "solid-js";

// `focusable` is a valid SVG attribute (paired with aria-hidden on decorative
// icons) that Solid's JSX types omit. Teach TS about it.
declare module "solid-js" {
  namespace JSX {
    interface SvgSVGAttributes<T> {
      focusable?: "true" | "false";
    }
  }
}
