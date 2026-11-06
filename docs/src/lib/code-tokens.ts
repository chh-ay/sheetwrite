import type { CodeRole } from "./code-roles.ts";

/**
 * Tokenizers for code that only exists at run time: JSON results a demo
 * computes, formulas read from a live workbook, and TypeScript a reader edits
 * in a runnable example. Static code is highlighted at build time by
 * Expressive Code; these small grammars give runtime code the same roles (and
 * so the same colours) without shipping a highlighter.
 */

/** A run of source text and its syntax role; `undefined` is plain text. */
export interface CodeToken {
  readonly text: string;
  readonly role: CodeRole | undefined;
}

/** Languages the runtime tokenizer understands. */
export type RuntimeCodeLanguage = "json" | "formula" | "typescript";

interface TokenRule {
  readonly pattern: RegExp;
  readonly role: (match: RegExpExecArray, source: string) => CodeRole | undefined;
}

const JSON_RULES: readonly TokenRule[] = [
  {
    pattern: /"(?:[^"\\]|\\.)*"/y,
    // A string followed by a colon is an object key.
    role: (match, source) =>
      /^\s*:/.test(source.slice(match.index + match[0].length)) ? "property" : "string",
  },
  { pattern: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y, role: () => "number" },
  { pattern: /\b(?:true|false|null)\b/y, role: () => "keyword" },
  { pattern: /[{}[\],:]/y, role: () => "punctuation" },
];

const CELL_REFERENCE =
  /(?<![A-Za-z0-9_.])(?:\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?#?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d+:\$?\d+)(?![A-Za-z0-9_(])/y;

/** The same rules, in the same order, as `FORMULA_LANGUAGE` in code-theme.ts. */
const FORMULA_RULES: readonly TokenRule[] = [
  { pattern: /"(?:[^"]|"")*"/y, role: () => "string" },
  { pattern: /(?:'[^']+'|[A-Za-z_][A-Za-z0-9_.]*)!/y, role: () => "property" },
  {
    pattern: /#(?:N\/A|REF!|DIV\/0!|VALUE!|NAME\?|NUM!|NULL!|SPILL!|CALC!|GETTING_DATA)/y,
    role: () => "number",
  },
  { pattern: /\b(?:TRUE|FALSE)\b/y, role: () => "number" },
  { pattern: /\b[A-Za-z_][A-Za-z0-9_.]*(?=\()/y, role: () => "function" },
  { pattern: CELL_REFERENCE, role: () => "type" },
  { pattern: /(?<![A-Za-z_])\d+(?:\.\d+)?(?:[eE][+-]?\d+)?%?/y, role: () => "number" },
  { pattern: /<>|<=|>=|[-+*/^&=<>%@:]/y, role: () => "punctuation" },
  { pattern: /[(),;{}]/y, role: () => "punctuation" },
];

const TYPESCRIPT_KEYWORDS =
  /\b(?:as|async|await|break|case|catch|class|const|continue|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|interface|let|new|null|of|return|satisfies|static|switch|this|throw|true|try|type|typeof|undefined|var|void|while|yield)\b/y;

/**
 * Enough of TypeScript to colour a docs example while a reader edits it:
 * comments, strings, numbers, keywords, calls, types (capitalised names) and
 * properties. Template literal substitutions stay string-coloured.
 */
const TYPESCRIPT_RULES: readonly TokenRule[] = [
  { pattern: /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y, role: () => "comment" },
  {
    pattern: /"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\.)*`?/y,
    role: () => "string",
  },
  { pattern: /(?<![\w$])\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?/y, role: () => "number" },
  { pattern: TYPESCRIPT_KEYWORDS, role: () => "keyword" },
  { pattern: /(?<=\.)[A-Za-z_$][\w$]*(?=\s*\()/y, role: () => "function" },
  { pattern: /(?<=\.)[A-Za-z_$][\w$]*/y, role: () => "property" },
  { pattern: /\b[A-Z][\w$]*/y, role: () => "type" },
  { pattern: /[A-Za-z_$][\w$]*(?=\s*\()/y, role: () => "function" },
  // An object key: a name that starts a line or follows `{` or `,`, then a colon.
  { pattern: /(?<=(?:^|\n|[{,])[ \t]*)[A-Za-z_$][\w$]*(?=\??:)/y, role: () => "property" },
  { pattern: /[A-Za-z_$][\w$]*/y, role: () => undefined },
  { pattern: /=>|[{}()[\];,.<>:=+\-*/%!?&|^~]/y, role: () => "punctuation" },
];

const RULES: Readonly<Record<RuntimeCodeLanguage, readonly TokenRule[]>> = {
  json: JSON_RULES,
  formula: FORMULA_RULES,
  typescript: TYPESCRIPT_RULES,
};

/** Splits `source` into role-tagged tokens; text no rule matches stays plain. */
export function tokenizeCode(source: string, language: RuntimeCodeLanguage): CodeToken[] {
  const rules = RULES[language];
  const tokens: CodeToken[] = [];
  let plainStart = 0;
  let index = 0;
  const flushPlain = () => {
    if (index > plainStart) tokens.push({ text: source.slice(plainStart, index), role: undefined });
  };
  while (index < source.length) {
    const matched = matchRule(rules, source, index);
    if (matched === undefined) {
      index += 1;
      continue;
    }
    flushPlain();
    tokens.push({ text: matched.text, role: matched.role });
    index += matched.text.length;
    plainStart = index;
  }
  flushPlain();
  return tokens;
}

function matchRule(
  rules: readonly TokenRule[],
  source: string,
  index: number,
): CodeToken | undefined {
  for (const rule of rules) {
    rule.pattern.lastIndex = index;
    const match = rule.pattern.exec(source);
    if (match !== null && match[0].length > 0) {
      return { text: match[0], role: rule.role(match, source) };
    }
  }
  return undefined;
}
