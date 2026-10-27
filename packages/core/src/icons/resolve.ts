import { COMMAND_ICONS } from "../command-icons.js";
import type { IconOverrides } from "../types/grid.js";
import { ICON_NAMES, type IconName } from "./icon-names.js";

const NAMES: ReadonlySet<string> = new Set(ICON_NAMES);

/** Whether `name` is a glyph on the command icon sheet. */
export function isIconName(name: string): name is IconName {
  return NAMES.has(name);
}

/**
 * The icon for one glyph: the host's override when it has one, else the sheet
 * glyph. Strings stay text (never HTML); nodes are cloned so one override can
 * serve every toolbar, ribbon and menu that shows the glyph.
 */
export function iconNode(name: IconName, overrides?: IconOverrides): Node {
  const override = overrides?.[name];
  if (override === undefined) return COMMAND_ICONS[name]();
  if (typeof override === "string") return document.createTextNode(override);
  return typeof override === "function" ? override() : override.cloneNode(true);
}
