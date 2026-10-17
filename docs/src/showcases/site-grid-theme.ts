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
  const resolveColor = (value: string): string => {
    probe.style.color = value;
    return getComputedStyle(probe).color;
  };
  const token = (name: string): string => resolveColor(`var(${name})`);
  const mix = (name: string, amount: number): string =>
    resolveColor(`color-mix(in srgb, var(${name}) ${amount}%, transparent)`);
  probe.style.font = "500 13px var(--sw-font-body)";
  const font = getComputedStyle(probe).font;
  const theme: Partial<Theme> = {
    bg: token("--sw-surface-1"),
    fg: token("--sw-fg"),
    gridLine: token("--sw-border"),
    headerBg: token("--sw-surface-2"),
    headerFg: token("--sw-accent-strong"),
    selection: mix("--sw-accent", 14),
    selectionBorder: token("--sw-accent"),
    searchMatch: mix("--sw-demo-warn", 25),
    searchActiveMatch: token("--sw-demo-warn"),
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
