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
 * The most steps one text may cost the wildcard matcher, counted in
 * characters searched. A search costs at most the text's length times the
 * pattern's, so cell text (32,767 characters) under a pattern of Excel's 255
 * characters stays within it; a text past it does not match.
 */
const MAX_WILDCARD_STEPS = 1 << 24;

/** The steps a text has left; shared by every search over one text. */
interface StepBudget {
  steps: number;
}

/**
 * A run of a pattern between stars, as regular expressions. Without a star a
 * run matches text of one length, so none of them can backtrack far: each
 * place it is tried costs at most the run's length.
 */
interface Segment {
  /** Finds the run at or after `lastIndex`. */
  readonly search: RegExp;
  /** Matches the run at `lastIndex` only. */
  readonly at: RegExp;
  /** Matches through the run's last place at or after `lastIndex`. */
  readonly last: RegExp;
  /** Finds the run where it ends the text, at or after `lastIndex`. */
  readonly ending: RegExp;
}

/**
 * An Excel wildcard pattern, parsed once and matched against many texts:
 * `*` is any run of characters, `?` exactly one, and `~` makes the next `*`,
 * `?` or `~` literal. Without `matchCase`, letters compare without case, as a
 * regular expression's `i` flag folds them.
 *
 * The pattern is the runs of characters between its stars. A match places the
 * first run at its start, each middle run where it is first found after the one
 * before, and the last run at its end. A star is never backtracked into, so a
 * text costs at most its length times the pattern's: a regular expression of
 * the whole pattern backtracks once per star and can take seconds per cell.
 */
class WildcardPattern {
  private readonly segments: readonly Segment[];
  /** Whether the pattern starts or ends with a star. */
  private readonly leadingRun: boolean;
  private readonly trailingRun: boolean;
  /**
   * The whole-cell match of a pattern with at most one run, as one regular
   * expression: a star at either end backtracks at most once per character.
   * Null when the pattern has more runs.
   */
  private readonly whole: RegExp | null;

  constructor(query: string, matchCase: boolean) {
    const flags = matchCase ? "u" : "iu";
    const characters = Array.from(query);
    const segments: Segment[] = [];
    let source = "";
    let endsWithRun = false;
    let lastSource = "";
    const endSegment = () => {
      if (source === "") return;
      segments.push({
        search: new RegExp(source, `g${flags}`),
        at: new RegExp(source, `y${flags}`),
        last: new RegExp(`[\\s\\S]*(?:${source})`, `y${flags}`),
        ending: new RegExp(`(?:${source})$`, `g${flags}`),
      });
      lastSource = source;
      source = "";
    };
    for (let index = 0; index < characters.length; index++) {
      const character = characters[index]!;
      const next = characters[index + 1];
      endsWithRun = character === "*";
      if (character === "~" && (next === "*" || next === "?" || next === "~")) {
        source += next.replace(REGEX_SYNTAX, "\\$&");
        index++;
      } else if (character === "*") {
        endSegment();
      } else if (character === "?") {
        source += "[\\s\\S]";
      } else {
        source += character.replace(REGEX_SYNTAX, "\\$&");
      }
    }
    endSegment();
    this.segments = segments;
    this.leadingRun = characters[0] === "*";
    this.trailingRun = endsWithRun;
    this.whole =
      segments.length === 1
        ? new RegExp(
            `^(?:${this.leadingRun ? "[\\s\\S]*" : ""}${lastSource}${endsWithRun ? "[\\s\\S]*" : ""})$`,
            flags,
          )
        : null;
  }

  /** A test of whole texts, or with `within` of runs of them, for Find. */
  matcher(within: boolean): (text: string) => boolean {
    const whole = this.whole;
    if (whole && !within) return (text) => whole.test(text);
    const budget = { steps: 0 };
    return (text) => {
      budget.steps = MAX_WILDCARD_STEPS;
      return this.test(text, within, budget);
    };
  }

  /** Whether the pattern matches all of `text`, or with `within` some run of it. */
  test(text: string, within: boolean, budget: StepBudget): boolean {
    if (this.whole && !within) return this.whole.test(text);
    const segments = this.segments;
    const count = segments.length;
    if (count === 0) return true;
    const startFree = within || this.leadingRun;
    const endFree = within || this.trailingRun;
    let position = 0;
    let index = 0;
    if (!startFree) {
      position = run(segments[0]!.at, text, 0, budget);
      if (position < 0) return false;
      if (count === 1 && !endFree) return position === text.length;
      index = 1;
    }
    const middle = endFree ? count : count - 1;
    for (; index < middle; index++) {
      position = run(segments[index]!.search, text, position, budget);
      if (position < 0) return false;
    }
    return endFree || run(segments[count - 1]!.ending, text, position, budget) >= 0;
  }

  /**
   * The leftmost longest non-empty run of `text`, at or after `from`, that the
   * pattern matches, as `[start, end]`; or null when none does or the budget
   * runs out. When the first run's first place leaves the rest unmatched, no
   * later place can match: the rest has less text to search.
   */
  span(text: string, from: number, budget: StepBudget): [start: number, end: number] | null {
    const segments = this.segments;
    const count = segments.length;
    if (count === 0) return from < text.length ? [from, text.length] : null;
    let start = from;
    let position = from;
    let index = 0;
    if (!this.leadingRun) {
      const search = segments[0]!.search;
      search.lastIndex = from;
      const found = search.exec(text);
      budget.steps -= text.length - from;
      if (!found || budget.steps < 0) return null;
      start = found.index;
      position = search.lastIndex;
      if (count === 1 && !this.trailingRun) return [start, position];
      index = 1;
    }
    const middle = this.trailingRun ? count : count - 1;
    for (; index < middle; index++) {
      position = run(segments[index]!.search, text, position, budget);
      if (position < 0) return null;
    }
    const end = this.trailingRun
      ? text.length
      : run(segments[count - 1]!.last, text, position, budget);
    return end > start ? [start, end] : null;
  }
}

/** Run `pattern` on `text` from `from`: where its match ends, or -1 when none does. */
function run(pattern: RegExp, text: string, from: number, budget: StepBudget): number {
  budget.steps -= text.length - from;
  if (budget.steps < 0) return -1;
  pattern.lastIndex = from;
  return pattern.test(text) ? pattern.lastIndex : -1;
}

/** The pattern of the last query, which Replace all matches against every cell. */
let lastPattern: { query: string; matchCase: boolean; pattern: WildcardPattern } | undefined;

function wildcardPattern(query: string, matchCase: boolean): WildcardPattern {
  if (lastPattern?.query !== query || lastPattern.matchCase !== matchCase) {
    lastPattern = { query, matchCase, pattern: new WildcardPattern(query, matchCase) };
  }
  return lastPattern.pattern;
}

/**
 * A test for cell text with Find's rules: Excel's wildcards, `matchCase` and
 * `wholeCell`. Text without wildcards matches as a plain substring.
 */
export function findMatcher(query: string, opts: ReplaceOptions = {}): (text: string) => boolean {
  if (hasWildcards(query)) {
    return new WildcardPattern(query, opts.matchCase === true).matcher(opts.wholeCell !== true);
  }
  if (opts.matchCase) {
    return opts.wholeCell ? (text) => text === query : (text) => text.includes(query);
  }

  const needle = query.toLowerCase();
  return opts.wholeCell
    ? (text) => text.toLowerCase() === needle
    : (text) => text.toLowerCase().includes(needle);
}

/**
 * Replace each leftmost longest non-empty run a wildcard pattern matches, or
 * return null when none does.
 */
function replaceWildcards(
  text: string,
  query: string,
  replacement: string,
  opts: ReplaceOptions,
): string | null {
  const pattern = wildcardPattern(query, opts.matchCase === true);
  const budget = { steps: MAX_WILDCARD_STEPS };
  if (opts.wholeCell) return pattern.test(text, false, budget) ? replacement : null;

  let result = "";
  let end = 0;
  for (;;) {
    const match = pattern.span(text, end, budget);
    if (budget.steps < 0) return null;
    if (!match) break;
    result += text.slice(end, match[0]) + replacement;
    end = match[1];
  }
  // A match is never empty, so it moves `end` on.
  return end === 0 ? null : result + text.slice(end);
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
