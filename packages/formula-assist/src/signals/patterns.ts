// Signal 4 of #801, patterns the workbook already uses: text the formula
// being typed repeats, as in `IF(A2>0,A2*B2,A2*C2)` or
// `IFERROR(VLOOKUP(…),VLOOKUP(…))`. When the end of the typed text appeared
// earlier in the formula, what followed it then likely follows it again, up
// to the end of that argument.

import type { FormulaAnalysis, FormulaToken } from "@sheetwrite/core/functions";

import type { Proposal, Signal } from "../candidates.js";

/** The repeated text must be at least this long to count. */
const MIN_REPEAT = 4;
/** Longest repeated text searched for, in characters. */
const MAX_REPEAT = 40;

/** The end of the argument that starts at `from`: after its `,` or its call's `)`. */
function argumentEnd(tokens: readonly FormulaToken[], text: string, from: number): number | null {
  let depth = 0;
  for (const token of tokens) {
    if (token.from < from) continue;
    const symbol = text.slice(token.from, token.to);
    if (symbol === "(" || symbol === "{") depth++;
    else if (symbol === ")" || symbol === "}") {
      if (depth === 0) return token.to;
      depth--;
    } else if (symbol === "," && depth === 0) return token.to;
  }
  return null;
}

class Patterns implements Signal {
  proposals(text: string, analysis: FormulaAnalysis): Proposal[] {
    const starts = new Set(analysis.tokens.map((token) => token.from));
    const longest = Math.min(MAX_REPEAT, Math.floor((text.length - 1) / 2));
    for (let length = longest; length >= MIN_REPEAT; length--) {
      const from = text.length - length;
      if (!starts.has(from)) continue;

      const earlier = text.lastIndexOf(text.slice(from), from - 1);
      if (earlier < 1) continue;
      const end = argumentEnd(analysis.tokens, text, earlier + length);
      if (end === null || end > from) continue;

      const formula = text + text.slice(earlier + length, end);
      return [{ formula, signal: "patterns", reason: "repeatInFormula" }];
    }
    return [];
  }
}

/** Open the workbook-patterns signal of one edit. */
export function openPatterns(): Signal {
  return new Patterns();
}
