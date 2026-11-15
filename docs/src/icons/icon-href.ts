import type { IconName } from "./icon-names.ts";

/** Id prefix of the sprite's symbols in the page, so they never meet an anchor id. */
export const ICON_ID_PREFIX = "sw-icon-";

/**
 * The `<use href>` of one icon. Every page carries the sprite's symbols
 * inline (components/IconSprite.tsx), so icons paint with the HTML and the
 * markup carries only references. React, Vue and Svelte icons all read it
 * from here.
 */
export function iconHref(name: IconName): string {
  return `#${ICON_ID_PREFIX}${name}`;
}
