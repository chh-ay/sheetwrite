import { readFileSync } from "node:fs";

import type { IconName } from "./icon-names.ts";

/** Rendered size: 16, 20 or 24 px, as in the `Icon` component. */
export type InlineIconSize = "sm" | "md" | "lg";

const ICON_SPRITE = readFileSync(new URL("./sprite.svg", import.meta.url), "utf8");

/**
 * One sprite icon as standalone, decorative markup, for build-time HTML
 * (Markdown callouts, code hover panels). Static markup inlines its few icons
 * instead of referencing the sprite file, so it needs no JavaScript.
 */
export function inlineIcon(name: IconName, size: InlineIconSize = "sm"): string {
  const symbol = new RegExp(`<symbol id="${name}" viewBox="([^"]+)">(.*?)</symbol>`).exec(
    ICON_SPRITE,
  );
  if (symbol === null) throw new Error(`The icon sprite has no symbol "${name}"`);
  return `<svg aria-hidden="true" class="sw-icon" data-size="${size}" focusable="false" viewBox="${symbol[1]}">${symbol[2]}</svg>`;
}
