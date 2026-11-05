import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { ExpressiveCodeTheme } from "@expressive-code/core";
import type { RehypeExpressiveCodeOptions } from "rehype-expressive-code";

import { CODE_ROLES, type CodeRole } from "./code-roles.ts";
import { type SiteTheme, themeTokens, tokenColour } from "./design-tokens.ts";

type ShikiOptions = Exclude<NonNullable<RehypeExpressiveCodeOptions["shiki"]>, boolean>;
/** One entry of Expressive Code's `shiki.langs`. */
export type ShikiLanguageInput = NonNullable<ShikiOptions["langs"]>[number];

/**
 * The site's code theme, built at build time from the `--sw-code-*` tokens.
 * Light and dark are one theme: each syntax role keeps its hue in both modes
 * and only the lightness changes, so a reader who switches themes sees the
 * same colour for the same kind of token.
 */

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
    "variable.object.property",
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
};

/** TypeScript grammar rules a class or interface body is made of. */
const CLASS_MEMBER_RULES = [
  "comment",
  "decorator",
  "method-declaration",
  "indexer-declaration",
  "field-declaration",
  "string",
  "type-annotation",
  "variable-initializer",
  "access-modifier",
  "property-accessor",
  "async-modifier",
  "expression",
  "punctuation-comma",
  "punctuation-semicolon",
];

const TS_MEMBER_GRAMMAR = {
  name: "ts-member",
  scopeName: "source.ts.member",
  embeddedLangs: ["typescript"],
  patterns: CLASS_MEMBER_RULES.map((rule) => ({ include: `source.ts#${rule}` })),
};

/**
 * The packages between the docs and Shiki's bundled grammars, outermost
 * first. `ts-member` embeds TypeScript, and Shiki registers an embedded
 * language only together with its grammar, so the docs load the exact
 * grammar Expressive Code's own Shiki ships.
 */
const SHIKI_DEPENDENCY_CHAIN = [
  "rehype-expressive-code",
  "expressive-code",
  "@expressive-code/plugin-shiki",
  "shiki",
];

function bundledTypeScriptGrammarUrl(): string {
  let resolved = createRequire(import.meta.url).resolve(SHIKI_DEPENDENCY_CHAIN[0] ?? "");
  for (const next of SHIKI_DEPENDENCY_CHAIN.slice(1)) {
    resolved = createRequire(resolved).resolve(next);
  }
  return pathToFileURL(createRequire(resolved).resolve("@shikijs/langs/typescript")).href;
}

/**
 * TypeScript read as the inside of a class or interface, for API pages that
 * show one member per fence (```ts-member). Plain TypeScript reads a lone
 * `readonly store: Store;` as a labelled statement and leaves it uncoloured;
 * this grammar gives modifiers, properties, methods and types their roles.
 * Loaded with the TypeScript grammar it builds on.
 */
export function tsMemberLanguage(): ShikiLanguageInput {
  const typescriptUrl = bundledTypeScriptGrammarUrl();
  return async () => {
    // The grammar is not a docs dependency; its path is resolved through Shiki at run time.
    const typescript: { default: unknown[] } = await import(typescriptUrl);
    return [...typescript.default, TS_MEMBER_GRAMMAR];
  };
}
