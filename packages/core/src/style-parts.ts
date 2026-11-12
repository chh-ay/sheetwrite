/**
 * Development check for the stylesheet parts under `@sheetwrite/core/styles/`.
 * Each part sets `--sheetwrite-<part>-ready` on the elements it styles. A
 * widget whose part is missing renders unstyled, so in development builds the
 * widget warns once instead. Production builds skip the check.
 */

import { isDevelopmentBuild } from "./development-build.js";

/** One stylesheet part; `@sheetwrite/core/styles/<part>.css`. */
export type StylePart =
  | "grid"
  | "formula-help"
  | "find"
  | "ribbon"
  | "panels"
  | "context-menu"
  | "tabs"
  | "charts"
  | "icons"
  | "dashboard";

/** Parts already found or warned about; each part is checked until one of those happens. */
const settledParts = new Set<StylePart>();

/**
 * Warn once when `part` is not loaded for `element`, a connected element that
 * the part styles. `widget` names what the user sees, as in "The ribbon".
 */
export function checkStylePart(element: Element, part: StylePart, widget: string): void {
  if (settledParts.has(part) || !element.isConnected || !isDevelopmentBuild()) return;

  const view = element.ownerDocument.defaultView;
  if (view === null) return;
  settledParts.add(part);
  if (view.getComputedStyle(element).getPropertyValue(`--sheetwrite-${part}-ready`) !== "") return;

  console.warn(
    `Sheetwrite: ${widget} has no styles. Import "@sheetwrite/core/styles/${part}.css" ` +
      `(or your framework adapter's styles/${part}.css), or "@sheetwrite/core/styles.css" for every part.`,
  );
}

/** Warn once when icons.css is not loaded and `root` draws a command icon from the sheet. */
export function checkIconStyles(root: Element, widget: string): void {
  const icon = root.querySelector(".sheetwrite-icon");
  if (icon !== null) checkStylePart(icon, "icons", widget);
}
