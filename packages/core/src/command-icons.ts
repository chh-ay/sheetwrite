import type { IconName } from "./icons/icon-names.js";

/**
 * A fresh icon element for one glyph on the command icon sheet. The glyph is a
 * CSS crop of one shared mask (styles.css), painted in `currentColor`, so it
 * follows hover, disabled and theme colours with no per-icon colour code.
 */
export function sheetIcon(name: IconName): HTMLSpanElement {
  const icon = document.createElement("span");
  icon.className = "sheetwrite-icon";
  icon.dataset.icon = name;
  icon.setAttribute("aria-hidden", "true");
  return icon;
}
