/**
 * A page's critical CSS: the rules of its stylesheets that can match its
 * markup, inlined by the page-scripts build step so the first paint waits for
 * no stylesheet.
 *
 * A style rule stays when one of its selectors names only classes the page's
 * markup uses. Classes inside functional pseudo-classes (`:not()`, `:is()`,
 * `:where()`, `:has()`) and attribute selectors are conditions, not
 * requirements, so they never drop a rule. Group rules (`@media`, `@supports`,
 * `@layer`, `@container`) keep the rules inside them that stay and are dropped
 * when none do. Every other at-rule (`@font-face`, `@keyframes`, `@property`)
 * stays whole.
 *
 * The input is Lightning CSS's minified output, so braces outside strings and
 * comments only open and close blocks.
 */

/** A parsed stylesheet, ready to filter for any page. */
export type ParsedCss = readonly CssNode[];

type CssNode =
  | {
      readonly kind: "style";
      readonly selectors: readonly (readonly string[])[];
      readonly text: string;
    }
  | { readonly kind: "group"; readonly prelude: string; readonly children: ParsedCss }
  | { readonly kind: "other"; readonly text: string };

const GROUP_AT_RULE = /^@(?:media|supports|layer|container)\b/;
const COMMENT = /\/\*[\s\S]*?\*\//g;
const CLASS_NAME = /\.(-?[_a-zA-Z][\w-]*)/g;
/** A parenthesised or bracketed part without nested ones, and quoted strings. */
const CONDITION = /\([^()]*\)|\[[^[\]]*\]/g;
const QUOTED = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;

/** The index of the quote that closes the string opening at `start`. */
function stringEnd(css: string, start: number): number {
  const quote = css[start];
  for (let index = start + 1; index < css.length; index++) {
    if (css[index] === "\\") index += 1;
    else if (css[index] === quote) return index;
  }
  throw new Error(`Unterminated string at ${start}`);
}

/** The next `{` or `;` outside strings from `start`, or the end of the text. */
function preludeEnd(css: string, start: number): number {
  for (let index = start; index < css.length; index++) {
    const character = css[index];
    if (character === '"' || character === "'") index = stringEnd(css, index);
    else if (character === "{" || character === ";") return index;
  }
  return css.length;
}

/** The index just past the block whose `{` is at `open`. */
function blockEnd(css: string, open: number): number {
  let depth = 0;
  for (let index = open; index < css.length; index++) {
    const character = css[index];
    if (character === '"' || character === "'") index = stringEnd(css, index);
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  throw new Error(`Unclosed block at ${open}`);
}

/** Each selector of a selector list, as the classes it requires. */
function requiredClasses(selectorList: string): string[][] {
  const selectors: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selectorList.length; index++) {
    const character = selectorList[index];
    if (character === '"' || character === "'") index = stringEnd(selectorList, index);
    else if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth -= 1;
    else if (character === "," && depth === 0) {
      selectors.push(selectorList.slice(start, index));
      start = index + 1;
    }
  }
  selectors.push(selectorList.slice(start));
  return selectors.map((selector) => {
    let required = selector.replace(QUOTED, "");
    // Innermost parts first, until no condition is left.
    for (let previous = ""; previous !== required;) {
      previous = required;
      required = required.replace(CONDITION, "");
    }
    return Array.from(required.matchAll(CLASS_NAME), ([, name]) => name ?? "");
  });
}

function parseBlock(css: string): CssNode[] {
  const nodes: CssNode[] = [];
  let index = 0;
  while (index < css.length) {
    const end = preludeEnd(css, index);
    const prelude = css.slice(index, end).trim();
    if (end === css.length || css[end] === ";") {
      // A statement at-rule (`@layer a, b;`, `@import`) stays as written.
      if (prelude !== "") nodes.push({ kind: "other", text: `${prelude};` });
      index = end + 1;
      continue;
    }
    const close = blockEnd(css, end);
    if (GROUP_AT_RULE.test(prelude)) {
      nodes.push({ kind: "group", prelude, children: parseBlock(css.slice(end + 1, close - 1)) });
    } else if (prelude.startsWith("@")) {
      nodes.push({ kind: "other", text: `${prelude}${css.slice(end, close)}` });
    } else {
      nodes.push({
        kind: "style",
        selectors: requiredClasses(prelude),
        text: `${prelude}${css.slice(end, close)}`,
      });
    }
    index = close;
  }
  return nodes;
}

export function parseCss(css: string): ParsedCss {
  return parseBlock(css.replace(COMMENT, ""));
}

/** The rules of `css` that can match markup using `classes`, minified as given. */
export function criticalCss(css: ParsedCss, classes: ReadonlySet<string>): string {
  let critical = "";
  for (const node of css) {
    if (node.kind === "other") {
      critical += node.text;
    } else if (node.kind === "style") {
      if (node.selectors.some((required) => required.every((name) => classes.has(name)))) {
        critical += node.text;
      }
    } else {
      const inner = criticalCss(node.children, classes);
      if (inner !== "") critical += `${node.prelude}{${inner}}`;
    }
  }
  return critical;
}
