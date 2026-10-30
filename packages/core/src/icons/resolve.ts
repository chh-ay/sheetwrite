import { sheetIcon } from "../command-icons.js";
import type { IconOverrides, ToolbarIcon } from "../types/grid.js";
import type { IconName } from "./icon-names.js";

/**
 * The node for host-supplied icon content. Strings stay text (never HTML);
 * nodes are cloned so one override can serve every toolbar, ribbon and menu
 * that shows it.
 */
export function iconContentNode(content: ToolbarIcon): Node {
  if (typeof content === "string") return document.createTextNode(content);
  return typeof content === "function" ? content() : content.cloneNode(true);
}

/** The icon for one glyph: the host's override when it has one, else the sheet glyph. */
export function iconNode(name: IconName, overrides?: IconOverrides): Node {
  const override = overrides?.[name];
  return override === undefined ? sheetIcon(name) : iconContentNode(override);
}
