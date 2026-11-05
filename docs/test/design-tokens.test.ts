import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

/** WCAG 2.2 AA minimum for body text. */
const TEXT_CONTRAST = 4.5;
/** WCAG 2.2 AA minimum for icons, field edges and other non-text marks. */
const UI_CONTRAST = 3;

const TOKENS_CSS = readFileSync(
  new URL("../src/styles/tokens.css", import.meta.url),
  "utf8",
);

type Theme = "light" | "dark";

/** The custom properties declared in one rule body, resolving `var()` aliases. */
function declarations(body: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const match of body.matchAll(/(--sw-[a-z0-9-]+):\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined)
      values.set(name, value.trim());
  }
  return values;
}

/** Rule bodies whose selector is exactly `selector`. */
function ruleBodies(selector: string): string[] {
  const escaped = selector.replace(/[[\]"]/g, (character) => `\\${character}`);
  const pattern = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "g");
  return [...TOKENS_CSS.matchAll(pattern)].map((match) => match[1] ?? "");
}

/** Every colour token for a theme: dark overrides light, light covers the rest. */
function themeTokens(theme: Theme): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const body of ruleBodies(":root"))
    for (const [k, v] of declarations(body)) tokens.set(k, v);
  if (theme === "dark") {
    for (const body of ruleBodies(':root[data-theme="dark"]')) {
      for (const [k, v] of declarations(body)) tokens.set(k, v);
    }
  }
  return tokens;
}

function resolveHex(tokens: Map<string, string>, name: string): string {
  const value = tokens.get(name);
  if (value === undefined)
    throw new Error(`${name} is not declared in tokens.css`);
  const alias = /^var\((--sw-[a-z0-9-]+)\)$/.exec(value);
  if (alias?.[1] !== undefined) return resolveHex(tokens, alias[1]);
  if (!/^#[0-9a-f]{6}$/i.test(value))
    throw new Error(`${name} is not a six-digit hex colour`);
  return value;
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map(
    (start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255,
  );
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

const PAGE_SURFACES = [
  "--sw-surface-0",
  "--sw-surface-1",
  "--sw-surface-2",
  "--sw-surface-3",
];
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
const CODE_ROLES = [
  "--sw-code-fg",
  "--sw-code-comment",
  "--sw-code-keyword",
  "--sw-code-function",
  "--sw-code-string",
  "--sw-code-number",
  "--sw-code-type",
  "--sw-code-property",
  "--sw-code-punctuation",
];

interface ColourPair {
  readonly foreground: string;
  readonly background: string;
  readonly minimum: number;
}

/** Every text and icon pairing the stylesheets use, with its WCAG minimum. */
function measuredPairs(): ColourPair[] {
  const pairs: ColourPair[] = [];
  const add = (
    foreground: string,
    background: string,
    minimum = TEXT_CONTRAST,
  ) => pairs.push({ foreground, background, minimum });
  for (const background of PAGE_SURFACES) {
    for (const foreground of TEXT_ON_SURFACES) add(foreground, background);
    add("--sw-field-edge", background, UI_CONTRAST);
  }
  for (const role of [
    "accent",
    "violet",
    "info",
    "success",
    "warning",
    "danger",
  ]) {
    add(`--sw-${role}`, `--sw-${role}-soft`);
    add("--sw-fg", `--sw-${role}-soft`);
  }
  add("--sw-accent-ink", "--sw-accent");
  add("--sw-accent-ink", "--sw-accent-strong");
  add("--sw-fg-inverse", "--sw-surface-inverse");
  add("--sw-fg-inverse-muted", "--sw-surface-inverse");
  for (const role of CODE_ROLES) {
    add(role, "--sw-code-bg");
    add(role, "--sw-code-line-highlight");
    add(role, "--sw-surface-1");
  }
  add("--sw-code-line-marker", "--sw-code-line-highlight", UI_CONTRAST);
  return pairs;
}

describe.each(["light", "dark"] as const)("%s theme colour tokens", (theme) => {
  const tokens = themeTokens(theme);
  it.each(
    measuredPairs().map(
      (pair) => [`${pair.foreground} on ${pair.background}`, pair] as const,
    ),
  )("%s meets WCAG AA", (_label, pair) => {
    const ratio = contrastRatio(
      resolveHex(tokens, pair.foreground),
      resolveHex(tokens, pair.background),
    );
    expect(ratio).toBeGreaterThanOrEqual(pair.minimum);
  });
});
