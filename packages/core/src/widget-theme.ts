import type { Theme } from "./types/render.js";

/**
 * The UI type scale, in CSS pixels: the sizes the docs site's text tokens
 * use (`--sw-text-eyebrow` 12 px, `--sw-text-caption` 13 px,
 * `--sw-text-small` 14 px, …).
 */
const TYPE_SCALE_PX = [11, 12, 13, 14, 16, 17, 20, 24, 30, 36] as const;
const FONT_PX = /(\d+(?:\.\d+)?)px/;

/**
 * The sheet-tab bar's font: the theme's cell font, one step up the type
 * scale, so the tab names, the status text and the bar's icons read a touch
 * larger than the cells (13 px cells give a 14 px bar). A font without a
 * pixel size is used as it is.
 *
 * @param font - The theme's CSS font shorthand, such as `13px system-ui`.
 * @returns The same shorthand with the next size up.
 */
export function tabBarFont(font: string): string {
  const match = FONT_PX.exec(font);
  if (!match) return font;
  const px = Number(match[1]);
  const next = TYPE_SCALE_PX.find((size) => size > px) ?? Math.round(px * 1.2);
  return `${font.slice(0, match.index)}${next}px${font.slice(match.index + match[0].length)}`;
}

/**
 * Custom properties the built-in widgets (find bar, toolbar, context menu) read
 * for their cosmetic styling. They are declared in `styles.css` via `var(...)`
 * and seeded here from the resolved {@link Theme} so the default look is
 * identical to the old hardcoded inline styles while remaining fully
 * restylable by host CSS.
 */
const WIDGET_THEME_VARS = {
  "--sheetwrite-widget-font": (t: Theme) => t.font,
  "--sheetwrite-widget-bg": (t: Theme) => t.bg,
  "--sheetwrite-widget-fg": (t: Theme) => t.fg,
  "--sheetwrite-widget-border": (t: Theme) => t.gridLine,
  "--sheetwrite-widget-accent": (t: Theme) => t.headerFg,
  "--sheetwrite-widget-selection": (t: Theme) => t.selection,
  "--sheetwrite-toolbar-bg": (t: Theme) => t.headerBg,
  "--sheetwrite-toolbar-fg": (t: Theme) => t.headerFg,
  "--sheetwrite-menu-hover": (t: Theme) => t.gridLine,
  // The shell's bottom row (sheet tabs and status) reads it, as the grid's own tab bar does.
  "--sheetwrite-tab-font": (t: Theme) => tabBarFont(t.font),
} as const;

/**
 * Seeds the widget custom properties from `theme` onto the grid *root* — the
 * shared host element that parents every built-in widget.
 *
 * They are declared on the ancestor (not each widget element) on purpose: an
 * inline custom property set on the widget element itself would outrank any
 * author rule, but an *inherited* value is overridden by a rule matching the
 * widget directly. That is what lets a host `.sheetwrite-find { --sheetwrite-
 * widget-bg: … }` (or a bare cosmetic override like `background: …`, which now
 * lives in the stylesheet rather than inline) win without `!important`.
 *
 * Idempotent: every widget seeds the same theme-derived values, so calling it
 * from each constructor on the shared root simply reasserts them.
 */
export function seedWidgetTheme(root: HTMLElement, theme: Theme): void {
  for (const [name, pick] of Object.entries(WIDGET_THEME_VARS)) {
    root.style.setProperty(name, String(pick(theme)));
  }
}
