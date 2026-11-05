import { describe, expect, it } from "bun:test";

import { CODE_ROLES } from "../src/lib/code-roles.ts";
import { themeTokens, tokenColour } from "../src/lib/design-tokens.ts";

/** WCAG 2.2 AA minimum for body text. */
const TEXT_CONTRAST = 4.5;
/** WCAG 2.2 AA minimum for icons, field edges and other non-text marks. */
const UI_CONTRAST = 3;

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a,
  );
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

const PAGE_SURFACES = ["--sw-surface-0", "--sw-surface-1", "--sw-surface-2", "--sw-surface-3"];
const TEXT_ON_SURFACES = [
  "--sw-fg",
  "--sw-fg-strong",
  "--sw-fg-muted",
  "--sw-accent",
  "--sw-accent-strong",
  "--sw-violet",
  "--sw-info",
  "--sw-warning",
  "--sw-danger",
  "--sw-fw-react",
  "--sw-fw-vue",
  "--sw-fw-svelte",
];

interface ColourPair {
  readonly foreground: string;
  readonly background: string;
  readonly minimum: number;
}

/** Every text and icon pairing the stylesheets use, with its WCAG minimum. */
function measuredPairs(): ColourPair[] {
  const pairs: ColourPair[] = [];
  const add = (foreground: string, background: string, minimum = TEXT_CONTRAST) =>
    pairs.push({ foreground, background, minimum });
  for (const background of PAGE_SURFACES) {
    for (const foreground of TEXT_ON_SURFACES) add(foreground, background);
    add("--sw-field-edge", background, UI_CONTRAST);
    add("--sw-icon-accent", background, UI_CONTRAST);
  }
  for (const role of ["accent", "violet", "info", "success", "warning", "danger"]) {
    add(`--sw-${role}`, `--sw-${role}-soft`);
    add("--sw-fg", `--sw-${role}-soft`);
  }
  add("--sw-accent-ink", "--sw-accent");
  add("--sw-accent-ink", "--sw-accent-strong");
  add("--sw-fg-inverse", "--sw-surface-inverse");
  add("--sw-fg-inverse-muted", "--sw-surface-inverse");
  for (const role of ["fg", ...CODE_ROLES]) {
    add(`--sw-code-${role}`, "--sw-code-bg");
    add(`--sw-code-${role}`, "--sw-code-line-highlight");
    add(`--sw-code-${role}`, "--sw-surface-1");
  }
  add("--sw-code-line-marker", "--sw-code-line-highlight", UI_CONTRAST);
  return pairs;
}

describe.each(["light", "dark"] as const)("%s theme colour tokens", (theme) => {
  const tokens = themeTokens(theme);
  it.each(
    measuredPairs().map((pair) => [`${pair.foreground} on ${pair.background}`, pair] as const),
  )("%s meets WCAG AA", (_label, pair) => {
    const ratio = contrastRatio(
      tokenColour(tokens, pair.foreground),
      tokenColour(tokens, pair.background),
    );
    expect(ratio).toBeGreaterThanOrEqual(pair.minimum);
  });
});
