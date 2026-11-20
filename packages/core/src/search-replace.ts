/** Options that shape substring vs whole-cell matching for Find and Replace. */
export interface ReplaceOptions {
  /** Case-sensitive matching (default false). */
  matchCase?: boolean;
  /** Treat the whole cell as the unit: the entire text is swapped (default false). */
  wholeCell?: boolean;
}

/** Excel's Find wildcards: `*`, `?`, or a `~` that escapes one of `*?~`. */
const WILDCARD = /[*?]/u;

/** Whether `query` uses Excel's wildcards, as the engine's Find reads them. */
function hasWildcards(query: string): boolean {
  return WILDCARD.test(query) || query.includes("~~");
}

/** The token `?`, any one character; the other tokens are code points. */
const ANY_ONE = -1;
/** The token `*`, any run of characters. */
const ANY_RUN = -2;

/**
 * The most steps one text may cost the wildcard matcher. A step is one
 * pattern position at one character, so a search costs at most the text's
 * length times the pattern's. Cell text (32,767 characters) under a pattern of
 * Excel's 255 characters stays within it; a text past it does not match.
 */
const MAX_WILDCARD_STEPS = 1 << 24;

/** Code points outside ASCII without case, found once each. */
const foldedCodePoints = new Map<number, number>();

/** `code` without case: one code point for one, so `?` still counts characters as written. */
function foldCase(code: number): number {
  if (code < 0x80) return code >= 0x41 && code <= 0x5a ? code + 0x20 : code;
  let folded = foldedCodePoints.get(code);
  if (folded === undefined) {
    const lower = String.fromCodePoint(code).toLowerCase();
    const first = lower.codePointAt(0) ?? code;
    folded = lower.length === (first > 0xffff ? 2 : 1) ? first : code;
    foldedCodePoints.set(code, folded);
  }
  return folded;
}

/** The steps a text has left; shared by every search over one text. */
interface StepBudget {
  steps: number;
}

/**
 * An Excel wildcard pattern, parsed once and matched against many texts.
 * `*` is any run of characters, `?` exactly one, and `~` makes the next `*`,
 * `?` or `~` literal. Without `matchCase`, characters compare without case.
 * Neither match backtracks more than the last star, as the engine's
 * `wildcard.rs` does, so a text costs at most its length times the pattern's.
 */
class WildcardPattern {
  private readonly tokens: Int32Array;
  /** Whether the pattern has a star; without one it matches runs of one length. */
  private readonly hasRun: boolean;
  /** For {@link span}: the start of the thread in each pattern position, or -1. */
  private current: Int32Array;
  private next: Int32Array;

  constructor(
    query: string,
    private readonly matchCase: boolean,
  ) {
    const characters = Array.from(query);
    const tokens: number[] = [];
    for (let index = 0; index < characters.length; index++) {
      const character = characters[index]!;
      const next = characters[index + 1];
      if (character === "~" && (next === "*" || next === "?" || next === "~")) {
        tokens.push(this.code(next.codePointAt(0)!));
        index++;
      } else if (character === "*") {
        // A run of stars matches what one star matches.
        if (tokens.at(-1) !== ANY_RUN) tokens.push(ANY_RUN);
      } else if (character === "?") {
        tokens.push(ANY_ONE);
      } else {
        tokens.push(this.code(character.codePointAt(0)!));
      }
    }
    this.tokens = Int32Array.from(tokens);
    this.hasRun = tokens.includes(ANY_RUN);
    this.current = new Int32Array(tokens.length + 1);
    this.next = new Int32Array(tokens.length + 1);
  }

  private code(code: number): number {
    if (this.matchCase) return code;
    return code < 0x80 ? (code >= 0x41 && code <= 0x5a ? code + 0x20 : code) : foldCase(code);
  }

  /**
   * Whether the pattern matches all of `text`, or with `within` some run of
   * it. A star that fails to match further takes one more character, and only
   * the last star does, which is enough when the pattern is read left to right.
   */
  test(text: string, within: boolean, budget: StepBudget): boolean {
    const tokens = this.tokens;
    let token = 0;
    let index = 0;
    // The token after the last star and the text offset that star has reached.
    let starToken = within ? 0 : -1;
    let starEnd = 0;
    for (;;) {
      if (--budget.steps < 0) return false;
      if (token === tokens.length) {
        if (within || index === text.length) return true;
      } else {
        const expected = tokens[token]!;
        if (expected === ANY_RUN) {
          token++;
          starToken = token;
          starEnd = index;
          continue;
        }
        if (index < text.length) {
          const code = text.codePointAt(index)!;
          if (expected === ANY_ONE || expected === this.code(code)) {
            index += code > 0xffff ? 2 : 1;
            token++;
            continue;
          }
        }
      }
      if (starToken < 0 || starEnd >= text.length) return false;
      starEnd += text.codePointAt(starEnd)! > 0xffff ? 2 : 1;
      token = starToken;
      index = starEnd;
    }
  }

  /**
   * The leftmost longest non-empty run of `text`, at or after `from`, that
   * the pattern matches, as `[start, end]`; or null when none does or the
   * budget runs out. It runs every pattern position at once over the text
   * (Thompson's construction), so it never backtracks. A position reached
   * from two starts keeps the earlier one, which gives the leftmost match, and
   * the search runs on while that start can still match further.
   */
  span(text: string, from: number, budget: StepBudget): [start: number, end: number] | null {
    if (!this.hasRun) return this.fixedSpan(text, from, budget);
    const tokens = this.tokens;
    const accept = tokens.length;
    let current = this.current;
    let next = this.next;
    current.fill(-1);
    let bestStart = -1;
    let bestEnd = -1;
    let position = from;
    let alive = false;
    for (;;) {
      if (bestStart === -1) {
        // With no thread running, a pattern that begins with a character
        // can start only where that character is.
        if (!alive && tokens[0]! >= 0) {
          position = this.seek(text, position, tokens[0]!, budget);
          if (position < 0) return null;
        }
        alive = this.enter(current, 0, position) || alive;
      }
      const start = current[accept]!;
      if (start !== -1 && position > start && (bestStart === -1 || start <= bestStart)) {
        bestStart = start;
        bestEnd = position;
      }
      if (position >= text.length || !alive) break;

      const code = text.codePointAt(position)!;
      const character = this.code(code);
      next.fill(-1);
      alive = false;
      for (let state = 0; state < accept; state++) {
        const threadStart = current[state]!;
        if (threadStart === -1 || (bestStart !== -1 && threadStart > bestStart)) continue;
        if (--budget.steps < 0) return null;
        const token = tokens[state]!;
        if (token === ANY_RUN) alive = this.enter(next, state, threadStart) || alive;
        else if (token === ANY_ONE || token === character) {
          alive = this.enter(next, state + 1, threadStart) || alive;
        }
      }
      [current, next] = [next, current];
      position += code > 0xffff ? 2 : 1;
    }
    this.current = current;
    this.next = next;
    return bestStart === -1 ? null : [bestStart, bestEnd];
  }

  /**
   * {@link span} for a pattern without a star: every match has its length,
   * so the leftmost is the longest, and each start costs at most the
   * pattern's length.
   */
  private fixedSpan(text: string, from: number, budget: StepBudget): [number, number] | null {
    const tokens = this.tokens;
    for (let start = from; start < text.length;) {
      let position = start;
      let token = 0;
      for (; token < tokens.length && position < text.length; token++) {
        const code = text.codePointAt(position)!;
        const expected = tokens[token]!;
        if (expected !== ANY_ONE && expected !== this.code(code)) break;
        position += code > 0xffff ? 2 : 1;
      }
      budget.steps -= token + 1;
      if (budget.steps < 0) return null;
      if (token === tokens.length) return [start, position];
      start += text.codePointAt(start)! > 0xffff ? 2 : 1;
    }
    return null;
  }

  /** The first offset of `text`, at or after `from`, that holds `expected`; -1 when none does. */
  private seek(text: string, from: number, expected: number, budget: StepBudget): number {
    let position = from;
    while (position < text.length) {
      if (--budget.steps < 0) return -1;
      const code = text.codePointAt(position)!;
      if (this.code(code) === expected) return position;
      position += code > 0xffff ? 2 : 1;
    }
    return -1;
  }

  /** Enter `state`, and every state after a star, for a thread that began at `start`. */
  private enter(states: Int32Array, state: number, start: number): boolean {
    for (;;) {
      const held = states[state]!;
      if (held !== -1 && held <= start) return true;
      states[state] = start;
      if (this.tokens[state] !== ANY_RUN) return true;
      state++;
    }
  }
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
    const pattern = new WildcardPattern(query, opts.matchCase === true);
    const within = opts.wholeCell !== true;
    return (text) => pattern.test(text, within, { steps: MAX_WILDCARD_STEPS });
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
