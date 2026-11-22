import type { Theme } from "@sheetwrite/core";

/**
 * A grid theme read from the site's live CSS tokens, so a showcase grid
 * matches the page in both color schemes. Canvas painting needs resolved
 * colors, so each token is resolved through a hidden probe element.
 */
function siteGridTheme(parent: HTMLElement = document.body): Partial<Theme> {
  const probe = document.createElement("span");
  probe.ariaHidden = "true";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  parent.append(probe);
  const resolve_color = (value: string): string => {
    probe.style.color = value;
    return getComputedStyle(probe).color;
  };
  const token = (name: string): string => resolve_color(`var(${name})`);
  const mix = (name: string, amount: number): string =>
    resolve_color(`color-mix(in srgb, var(${name}) ${amount}%, transparent)`);
  probe.style.font = "500 13px var(--sw-font-body)";
  // Built from longhands: Chromium returns "" for the `font` shorthand when a
  // longhand cannot be serialized (forced-colors mode), which left the grid
  // and the ribbon's font boxes without a font.
  const probe_style = getComputedStyle(probe);
  const font = `${probe_style.fontWeight} ${probe_style.fontSize} ${probe_style.fontFamily}`;
  const theme: Partial<Theme> = {
    bg: token("--sw-surface-1"),
    fg: token("--sw-fg"),
    gridLine: token("--sw-border"),
    headerBg: token("--sw-surface-2"),
    headerFg: token("--sw-accent-strong"),
    selection: mix("--sw-accent", 14),
    selectionBorder: token("--sw-accent"),
    searchMatch: mix("--sw-warning", 25),
    searchActiveMatch: token("--sw-warning"),
    highlight: mix("--sw-accent", 20),
    font,
  };
  probe.remove();
  return theme;
}

/** The site's color scheme, for hosts that style their frame around the grid. */
function siteColorScheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export { siteColorScheme, siteGridTheme };
