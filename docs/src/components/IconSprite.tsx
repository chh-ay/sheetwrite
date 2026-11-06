import { ICON_ID_PREFIX } from "../icons/icon-href.js";
import spriteSource from "../icons/sprite.svg?raw";

/**
 * The sprite markup: on the server, the sprite file with its symbol ids
 * prefixed; in the browser, whatever the server wrote, so a client render
 * keeps the symbols without shipping them in script.
 */
const SPRITE_MARKUP = import.meta.env.SSR
  ? spriteSource
      .replaceAll('<symbol id="', `<symbol id="${ICON_ID_PREFIX}`)
      .replace("<svg ", '<svg aria-hidden="true" focusable="false" width="0" height="0" ')
  : (globalThis.document?.querySelector(".sw-icon-sprite")?.innerHTML ?? "");

/**
 * Every icon symbol, inline once per page, so `<use>` references resolve
 * with the HTML: no sprite request, and no icon arrives after the text.
 */
export function IconSprite() {
  return (
    <div
      className="sw-icon-sprite"
      dangerouslySetInnerHTML={{ __html: SPRITE_MARKUP }}
      suppressHydrationWarning
    />
  );
}
