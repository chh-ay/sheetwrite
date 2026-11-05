import type { IconName } from "./icon-names.ts";
import spriteUrl from "./sprite.svg?url";

/**
 * The `<use href>` of one icon. The sprite is one hashed, cached file, so a
 * page downloads every icon once and the markup carries only references.
 * React, Vue and Svelte icons all read it from here.
 */
export function iconHref(name: IconName): string {
  return `${spriteUrl}#${name}`;
}
