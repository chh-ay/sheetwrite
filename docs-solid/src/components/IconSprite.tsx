import { ICON_ID_PREFIX } from "@docs/icons/icon-href.js";
import spriteSource from "@docs/icons/sprite.svg?raw";
import { isServer } from "solid-js/web";

/**
 * The sprite markup: on the server, the sprite file with its symbol ids
 * prefixed; in the browser, whatever the server wrote, so hydration keeps the
 * symbols without shipping them in script.
 */
const SPRITE_MARKUP = isServer
  ? spriteSource
      .replaceAll('<symbol id="', `<symbol id="${ICON_ID_PREFIX}`)
      .replace("<svg ", '<svg aria-hidden="true" focusable="false" width="0" height="0" ')
  : (globalThis.document?.querySelector(".sw-icon-sprite")?.innerHTML ?? "");

/** Every icon symbol, inline once per page, so `<use>` references resolve with the HTML. */
export function IconSprite() {
  return <div class="sw-icon-sprite" innerHTML={SPRITE_MARKUP} />;
}
