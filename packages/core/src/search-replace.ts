/** Options that shape substring vs whole-cell matching for a replacement. */
export interface ReplaceOptions {
  /** Case-sensitive matching (default false). */
  matchCase?: boolean;
  /** Treat the whole cell as the unit: the entire text is swapped (default false). */
  wholeCell?: boolean;
}

/**
 * Compute the replaced text for a single cell, or `null` when nothing matches
 * (so the caller can skip the write).
 *
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
