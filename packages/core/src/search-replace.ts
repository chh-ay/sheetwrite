/** Options that shape substring vs whole-cell matching for Find and Replace. */
export interface ReplaceOptions {
  /** Case-sensitive matching (default false). */
  matchCase?: boolean;
  /** Treat the whole cell as the unit: the entire text is swapped (default false). */
  wholeCell?: boolean;
}

/** Excel's Find wildcards: `*`, `?`, or a `~` that escapes one of `*?~`. */
const WILDCARD = /[*?]/u;
/** Characters a regular expression with the `u` flag needs escaped. */
const REGEX_SYNTAX = /[\\^$.*+?()[\]{}|/]/gu;

/** Whether `query` uses Excel's wildcards, as the engine's Find reads them. */
function hasWildcards(query: string): boolean {
  return WILDCARD.test(query) || query.includes("~~");
}

/**
 * A regular expression for an Excel wildcard pattern: `*` is any run of
 * characters, `?` exactly one, and `~` makes the next `*`, `?` or `~` literal.
 */
function wildcardPattern(query: string, opts: ReplaceOptions, global: boolean): RegExp {
  const characters = Array.from(query);
  let source = "";
  for (let index = 0; index < characters.length; index++) {
    const character = characters[index]!;
    const next = characters[index + 1];
    if (character === "~" && (next === "*" || next === "?" || next === "~")) {
      source += next.replace(REGEX_SYNTAX, "\\$&");
      index++;
    } else if (character === "*") {
      source += "[\\s\\S]*";
    } else if (character === "?") {
      source += "[\\s\\S]";
    } else {
      source += character.replace(REGEX_SYNTAX, "\\$&");
    }
  }

  const flags = `u${opts.matchCase ? "" : "i"}${global ? "g" : ""}`;
  return new RegExp(opts.wholeCell ? `^(?:${source})$` : source, flags);
}

/**
 * A test for cell text with Find's rules: Excel's wildcards, `matchCase` and
 * `wholeCell`. Text without wildcards matches as a plain substring.
 */
export function findMatcher(query: string, opts: ReplaceOptions = {}): (text: string) => boolean {
  if (hasWildcards(query)) {
    const pattern = wildcardPattern(query, opts, false);
    return (text) => pattern.test(text);
  }
  if (opts.matchCase) {
    return opts.wholeCell ? (text) => text === query : (text) => text.includes(query);
  }

  const needle = query.toLowerCase();
  return opts.wholeCell
    ? (text) => text.toLowerCase() === needle
    : (text) => text.toLowerCase().includes(needle);
}

/** Replace every non-empty run a wildcard pattern matches, or null when none does. */
function replaceWildcards(
  text: string,
  query: string,
  replacement: string,
  opts: ReplaceOptions,
): string | null {
  if (opts.wholeCell) return wildcardPattern(query, opts, false).test(text) ? replacement : null;

  let replaced = false;
  const next = text.replace(wildcardPattern(query, opts, true), (match) => {
    if (match === "") return match;
    replaced = true;
    return replacement;
  });
  return replaced ? next : null;
}

/**
 * Compute the replaced text for a single cell, or `null` when nothing matches
 * (so the caller can skip the write).
 *
 * - Excel's wildcards (`*`, `?`, `~`) match as in Find; `*` takes the longest
 *   run it can.
 * - `wholeCell`: the cell text is swapped wholesale for `replacement` when it
 *   equals `query` (honoring `matchCase`).
 * - substring (default): every non-overlapping occurrence of `query` in `text`
 *   is replaced, honoring `matchCase`; the surrounding text is preserved
 *   verbatim (the original casing of non-matched spans is never altered).
 *
 * Pure and DOM-free: the grid layer coerces the result back into a cell value
 * via `parseCellInput`, so numbers stay numbers.
 */
export function replaceInText(
  text: string,
  query: string,
  replacement: string,
  opts: ReplaceOptions = {},
): string | null {
  if (query === "") return null;
  if (hasWildcards(query)) return replaceWildcards(text, query, replacement, opts);

  if (opts.wholeCell) {
    const equal = opts.matchCase ? text === query : text.toLowerCase() === query.toLowerCase();
    return equal ? replacement : null;
  }

  if (opts.matchCase) {
    if (!text.includes(query)) return null;
    return text.split(query).join(replacement);
  }

  // Case-insensitive substring pass: scan on lowered copies, splice from the
  // original so untouched spans keep their casing.
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  if (haystack.length !== text.length || needle.length !== query.length) {
    let result = "";
    let previousEnd = 0;
    for (let offset = 0; offset <= text.length - query.length; offset++) {
      if (text.slice(offset, offset + query.length).toLowerCase() !== needle) continue;

      result += text.slice(previousEnd, offset) + replacement;
      previousEnd = offset + query.length;
      offset = previousEnd - 1;
    }

    return previousEnd === 0 ? null : result + text.slice(previousEnd);
  }
  let idx = haystack.indexOf(needle);
  if (idx < 0) return null;

  let out = "";
  let pos = 0;
  while (idx >= 0) {
    out += text.slice(pos, idx) + replacement;
    pos = idx + query.length;
    idx = haystack.indexOf(needle, pos);
  }
  return out + text.slice(pos);
}
