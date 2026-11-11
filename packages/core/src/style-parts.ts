/**
 * Development check for the stylesheet parts under `@sheetwrite/core/styles/`.
 * Each part sets `--sheetwrite-<part>-ready` on the elements it styles. A
 * widget whose part is missing renders unstyled, so in development builds the
 * widget warns once instead. Production builds skip the check.
 */

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

/** Set by bundlers; the core package does not depend on Node's types. */
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/** Parts already found or warned about; each part is checked until one of those happens. */
const settledParts = new Set<StylePart>();

/**
 * True when the bundler built for development. Bundlers replace
 * `process.env.NODE_ENV` with a string; without a bundler `process` does not
 * exist in a browser, and such a page is not a development build.
 */
function isDevelopmentBuild(): boolean {
  try {
    return process.env.NODE_ENV === "development";
  } catch (error) {
    if (error instanceof ReferenceError) return false;
    throw error;
  }
}

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
