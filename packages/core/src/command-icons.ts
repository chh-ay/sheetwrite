import { ICON_NAMES, type IconName } from "./icons/icon-names.js";

/**
 * A fresh icon element for one glyph on the command icon sheet. The glyph is a
 * CSS crop of one shared mask (styles.css), painted in `currentColor`, so it
 * follows hover, disabled and theme colours with no per-icon colour code.
 */
function sheetIcon(name: IconName): () => HTMLSpanElement {
  return () => {
    const icon = document.createElement("span");
    icon.className = "sheetwrite-icon";
    icon.dataset.icon = name;
    icon.setAttribute("aria-hidden", "true");
    return icon;
  };
}

/** Shared icons for flat-toolbar and ribbon commands, keyed by glyph name. */
export const COMMAND_ICONS = Object.fromEntries(
  ICON_NAMES.map((name) => [name, sheetIcon(name)]),
) as Record<IconName, () => HTMLSpanElement>;
