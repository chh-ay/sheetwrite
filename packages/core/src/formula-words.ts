// Where Ctrl+→ stops in a formula suggestion. A word is one token of the
// engine's lexer, except that a whole reference (with its sheet and range) is
// one word, and a function name takes its `(` along.

import type { FormulaAnalysis } from "./formula-analysis.js";

/**
 * The ends of the words of a suggestion, as lengths into it, ascending; the
 * last is the suggestion's length. `analysis` reads the text followed by the
 * suggestion, which spans `from` to `end` in it. A suggestion that starts
 * inside a token (the rest of a name) ends its first word with that token.
 */
export function suggestionWordEnds(
  analysis: Pick<FormulaAnalysis, "tokens" | "references">,
  from: number,
  end: number,
): number[] {
  const { tokens, references } = analysis;
  const ends: number[] = [];
  let at = from;
  let index = tokens.findIndex((token) => token.to > from);

  while (index >= 0 && index < tokens.length && at < end) {
    const token = tokens[index];
    if (token === undefined) break;

    const reference = references.find((entry) => entry.from <= token.from && token.from < entry.to);
    const next = tokens[index + 1];
    let to = reference?.to ?? token.to;
    if (token.kind === "function" && next?.kind === "paren" && next.from === token.to) to = next.to;

    at = Math.min(Math.max(to, at + 1), end);
    ends.push(at - from);
    while (index < tokens.length && (tokens[index]?.to ?? end) <= at) index++;
  }

  // Text the lexer leaves out, such as trailing spaces, is the last word.
  if (ends.at(-1) !== end - from) ends.push(end - from);
  return ends;
}
