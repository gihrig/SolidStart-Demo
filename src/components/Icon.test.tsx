import { describe, it, expect } from "vite-plus/test";
import { render } from "@solidjs/testing-library";
import spriteRaw from "~/icon-sprite.svg?raw";
import Icon, { ICON_NAMES } from "./Icon";

describe("<Icon />", () => {
  it("renders a decorative svg that references the named sprite symbol", () => {
    const { container } = render(() => <Icon name="fire-heart" class="w-5" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveClass("w-5");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(container.querySelector("use")).toHaveAttribute("href", "#icon-fire-heart");
  });

  it("exposes the icon to assistive tech when a label is given", () => {
    const { container } = render(() => <Icon name="menu" label="Open menu" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "Open menu");
    expect(svg).not.toHaveAttribute("aria-hidden");
  });

  it("keeps ICON_NAMES an exact mirror of the sprite symbol ids", () => {
    const spriteIds = [...spriteRaw.matchAll(/id="icon-([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ICON_NAMES)).toEqual(new Set(spriteIds));
  });

  // ThemeToggle's sun/moon/system are outline glyphs. When referenced via <use>
  // they must stay outlined (fill:none + stroke-width:2), not fill as blobs.
  it.each(["sun", "moon", "system"])("keeps the %s symbol an outline glyph", (name) => {
    const openTag = spriteRaw.match(new RegExp(`<symbol id="icon-${name}"[^>]*>`))![0];
    expect(openTag).toContain('fill="none"');
    expect(openTag).toContain('stroke-width="2"');
  });
});
