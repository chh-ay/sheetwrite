import { readFileSync } from "node:fs";

/**
 * Build-time reader for `src/styles/tokens.css`. The stylesheet is the single
 * source of the site's colours; the code theme and the contrast test read the
 * same declarations from it instead of repeating hex values.
 */

/** The two colour themes the site ships. */
export type SiteTheme = "light" | "dark";

const TOKENS_CSS_URL = new URL("../styles/tokens.css", import.meta.url);
const LIGHT_SELECTOR = ":root";
const DARK_SELECTOR = ':root[data-theme="dark"]';

/** The custom properties declared in one rule body, in source order. */
function declarations(body: string): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  for (const match of body.matchAll(/(--sw-[a-z0-9-]+):\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) found.push([name, value.trim()]);
  }
  return found;
}

/** Bodies of the top-level rules whose selector list includes `selector`. */
function ruleBodies(css: string, selector: string): string[] {
  const bodies: string[] = [];
  // Top-level rules start a line; at-rules and nested blocks are not token rules.
  for (const match of css.matchAll(/(?:^|\n)([^@\s/{}][^{}]*?)\s*\{([^{}]*)\}/g)) {
    const selectors = (match[1] ?? "").split(",").map((part) => part.trim());
    if (selectors.includes(selector)) bodies.push(match[2] ?? "");
  }
  return bodies;
}

/**
 * Every `--sw-*` declaration in effect for a theme: the dark rule overrides
 * the light `:root` rules, which cover everything the dark rule leaves out.
 */
export function themeTokens(
  theme: SiteTheme,
  css: string = readFileSync(TOKENS_CSS_URL, "utf8"),
): Map<string, string> {
  const tokens = new Map<string, string>();
  const selectors = theme === "dark" ? [LIGHT_SELECTOR, DARK_SELECTOR] : [LIGHT_SELECTOR];
  for (const selector of selectors) {
    for (const body of ruleBodies(css, selector)) {
      for (const [name, value] of declarations(body)) tokens.set(name, value);
    }
  }
  return tokens;
}

/** A token's six-digit hex colour, following `var(--sw-*)` aliases. */
export function tokenColour(tokens: ReadonlyMap<string, string>, name: string): string {
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`${name} is not declared in tokens.css`);
  const alias = /^var\((--sw-[a-z0-9-]+)\)$/.exec(value);
  if (alias?.[1] !== undefined) return tokenColour(tokens, alias[1]);
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} is not a six-digit hex colour`);
  return value.toLowerCase();
}
