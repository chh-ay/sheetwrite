import type { Theme } from "./types/render.js";

/**
 * Custom properties the built-in widgets (find bar, toolbar, menus, panels,
 * dashboard) read for their cosmetic styling. They are declared in
 * `styles.css` and `shell.css` via `var(...)` and seeded here from the
 * resolved {@link Theme}, so every widget follows the theme, light or dark,
 * and stays restylable by host CSS.
 */
const WIDGET_THEME_VARS = {
  "--sheetwrite-widget-font": (t: Theme) => t.font,
  "--sheetwrite-widget-bg": (t: Theme) => t.bg,
  "--sheetwrite-widget-fg": (t: Theme) => t.fg,
  "--sheetwrite-widget-border": (t: Theme) => t.gridLine,
  "--sheetwrite-widget-accent": (t: Theme) => t.headerFg,
  "--sheetwrite-widget-selection": (t: Theme) => t.selection,
  // Secondary text: the foreground faded toward the background, 4.5:1 or more
  // on the background in the light and dark themes.
  "--sheetwrite-widget-muted": (t: Theme) => `color-mix(in srgb, ${t.fg} 62%, ${t.bg})`,
  // The surface under the dashboard's cards: one step from the background
  // toward the foreground, as a canvas sits behind its cards.
  "--sheetwrite-widget-muted-bg": (t: Theme) => `color-mix(in srgb, ${t.fg} 4%, ${t.bg})`,
  // Error text and outlines: red pulled toward the foreground, so it is
  // darker on a light background and lighter on a dark one.
  "--sheetwrite-widget-error": (t: Theme) => `color-mix(in srgb, #d92d20 80%, ${t.fg})`,
  "--sheetwrite-toolbar-bg": (t: Theme) => t.headerBg,
  "--sheetwrite-toolbar-fg": (t: Theme) => t.headerFg,
  "--sheetwrite-menu-hover": (t: Theme) => t.gridLine,
  "--sheetwrite-menu-shadow": () => "0 6px 20px rgb(0 0 0 / 18%)",
  "--sheetwrite-menu-disabled-opacity": () => "0.45",
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
