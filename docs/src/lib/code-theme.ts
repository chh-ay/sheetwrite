import { ExpressiveCodeTheme } from "@expressive-code/core";

import { type SiteTheme, themeTokens, tokenColour } from "./design-tokens.ts";

/**
 * The site's code theme, built at build time from the `--sw-code-*` tokens.
 * Light and dark are one theme: each syntax role keeps its hue in both modes
 * and only the lightness changes, so a reader who switches themes sees the
 * same colour for the same kind of token.
 */

/** Syntax roles; each has a `--sw-code-<role>` token in both themes. */
export const CODE_ROLES = [
  "comment",
  "keyword",
  "function",
  "string",
  "number",
  "type",
  "property",
  "punctuation",
] as const;

/** One syntax role. */
export type CodeRole = (typeof CODE_ROLES)[number];

/**
 * TextMate scopes for each role, covering TS, JS, JSX, Vue, Svelte, shell,
 * JSON, CSS, HTML and the spreadsheet formula grammar below. A more specific
 * scope wins over a shorter one, so `keyword.operator` stays punctuation while
 * `keyword` is a keyword.
 */
const ROLE_SCOPES: Readonly<Record<CodeRole, readonly string[]>> = {
  comment: ["comment", "punctuation.definition.comment"],
  keyword: [
    "keyword",
    "storage",
    "keyword.operator.new",
    "keyword.operator.expression",
    "keyword.operator.logical.python",
    "variable.language",
    "keyword.control.directive",
  ],
  function: [
    "entity.name.function",
    "support.function",
    "meta.function-call entity.name.function",
    "entity.name.command",
    "entity.other.attribute-name.class.css",
    "entity.other.attribute-name.id.css",
    "support.function.formula",
  ],
  string: [
    "string",
    "punctuation.definition.string",
    "support.constant.property-value",
    "markup.inline.raw",
  ],
  number: [
    "constant.numeric",
    "constant.language",
    "constant.character",
    "keyword.other.unit",
    "constant.language.error.formula",
  ],
  type: [
    "entity.name.type",
    "entity.name.class",
    "support.type",
    "support.class",
    "entity.other.inherited-class",
    "entity.name.tag",
    "support.class.component",
    "variable.other.reference.formula",
  ],
  property: [
    "variable.other.property",
    "variable.other.object.property",
    "meta.object-literal.key",
    "support.type.property-name",
    "entity.other.attribute-name",
    "constant.other.option",
    "entity.name.sheet.formula",
  ],
  punctuation: [
    "punctuation",
    "meta.brace",
    "keyword.operator",
    "storage.type.function.arrow",
    "punctuation.definition.tag",
  ],
};

function codeColour(tokens: ReadonlyMap<string, string>, role: string): string {
  return tokenColour(tokens, `--sw-code-${role}`);
}

function buildTheme(theme: SiteTheme): ExpressiveCodeTheme {
  const tokens = themeTokens(theme);
  const background = codeColour(tokens, "bg");
  const foreground = codeColour(tokens, "fg");
  return new ExpressiveCodeTheme({
    name: `sheetwrite-${theme}`,
    type: theme,
    colors: {
      "editor.background": background,
      "editor.foreground": foreground,
      "editor.selectionBackground": codeColour(tokens, "line-highlight"),
    },
    settings: [
      { settings: { foreground, background } },
      ...CODE_ROLES.map((role) => ({
        name: role,
        scope: [...ROLE_SCOPES[role]],
        settings: { foreground: codeColour(tokens, role) },
      })),
    ],
  });
}

/** The light and dark variants of the site's code theme. */
export function siteCodeThemes(): ExpressiveCodeTheme[] {
  return [buildTheme("light"), buildTheme("dark")];
}

/** A cell or range reference: `A1`, `$B$2`, `A1:C9`, `A:A`, `1:1`, `A2#`. */
const CELL_REFERENCE =
  "\\$?[A-Za-z]{1,3}\\$?[0-9]+(?::\\$?[A-Za-z]{1,3}\\$?[0-9]+)?#?|\\$?[A-Za-z]{1,3}:\\$?[A-Za-z]{1,3}|\\$?[0-9]+:\\$?[0-9]+";

/**
 * A TextMate grammar for spreadsheet formulas, as fenced with ```formula in
 * Markdown: functions, cell and range references, sheet prefixes, strings,
 * numbers, booleans, error values and operators. A leading `A1:` cell label
 * reads as a reference, so `A1: =A1+B1` highlights as written in the docs.
 */
export const FORMULA_LANGUAGE = {
  name: "formula",
  scopeName: "source.formula",
  aliases: ["excel"],
  patterns: [
    { include: "#string" },
    { include: "#sheet" },
    { include: "#error" },
    { include: "#boolean" },
    { include: "#function" },
    { include: "#reference" },
    { include: "#number" },
    { include: "#operator" },
    { include: "#punctuation" },
  ],
  repository: {
    string: {
      name: "string.quoted.double.formula",
      begin: '"',
      end: '"(?!")',
      patterns: [{ name: "constant.character.escape.formula", match: '""' }],
    },
    sheet: {
      name: "entity.name.sheet.formula",
      match: "(?:'[^']+'|[A-Za-z_][A-Za-z0-9_.]*)!",
    },
    error: {
      name: "constant.language.error.formula",
      match: "#(?:N/A|REF!|DIV/0!|VALUE!|NAME\\?|NUM!|NULL!|SPILL!|CALC!|GETTING_DATA)",
    },
    boolean: { name: "constant.language.boolean.formula", match: "\\b(?:TRUE|FALSE)\\b" },
    function: {
      name: "support.function.formula",
      match: "\\b[A-Za-z_][A-Za-z0-9_.]*(?=\\()",
    },
    reference: {
      name: "variable.other.reference.formula",
      match: `(?<![A-Za-z0-9_.])(?:${CELL_REFERENCE})(?![A-Za-z0-9_(])`,
    },
    number: {
      name: "constant.numeric.formula",
      match: "(?<![A-Za-z_])[0-9]+(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?%?",
    },
    operator: { name: "keyword.operator.formula", match: "<>|<=|>=|[-+*/^&=<>%@:]" },
    punctuation: { name: "punctuation.separator.formula", match: "[(),;{}]" },
  },
} as const;
