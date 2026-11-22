// Signal 1 of #801, neighbouring formulas: the formulas next to the edited
// cell, moved to it as a fill or paste would move them. Only a formula the
// cells above and below, or left and right, agree on is proposed: then the
// cell almost surely continues their pattern.

import type { FormulaEdit } from "@sheetwrite/core";

import type { Proposal, Signal } from "../candidates.js";

/** Where a neighbour sits, relative to the edited cell. */
type Side = "above" | "below" | "left" | "right" | "furtherAbove";

/** The neighbours read: two on each side, nearest first. */
const NEIGHBOURS: readonly { readonly side: Side; readonly dRow: number; readonly dCol: number }[] =
  [
    { side: "above", dRow: -1, dCol: 0 },
    { side: "above", dRow: -2, dCol: 0 },
    { side: "below", dRow: 1, dCol: 0 },
    { side: "below", dRow: 2, dCol: 0 },
    { side: "left", dRow: 0, dCol: -1 },
    { side: "left", dRow: 0, dCol: -2 },
    { side: "right", dRow: 0, dCol: 1 },
    { side: "right", dRow: 0, dCol: 2 },
  ];

/** Rows searched upward for the nearest formula of the column, when the two above hold none. */
const SEARCH_ABOVE = 12;

/** One moved formula and the neighbours that gave it, counted by side. */
interface Moved {
  readonly formula: string;
  readonly sides: Map<Side, number>;
}

/** The reasons that ship: the neighbours above and below, or left and right, give the same formula. */
const BOTH_SIDES = /^(aboveAndBelow|leftAndRight)\b/;

/** What else the neighbours said: nothing, one other formula, or another formula two of them agree on. */
type Contradiction = "none" | "single" | "pair";

/**
 * A number written in the formula itself, outside references: the `31` of
 * `=D11*31`. Neighbours copied across days or months often differ in it.
 */
function has_literal_number(formula: string): boolean {
  const text = formula.replace(/"[^"]*"/g, '""');
  // One pass over runs of digits and dots, so a long run costs its length once (#219: a
  // backtracking pattern took quadratic time on a long digit run followed by a letter).
  let index = 0;
  while (index < text.length) {
    if (!is_digit(text.charCodeAt(index))) {
      index++;
      continue;
    }
    const start = index;
    while (index < text.length && is_digit_or_dot(text.charCodeAt(index))) index++;
    // A run inside a reference (`D11`, `$D$11`, `1:3`) or followed by a letter or `(` (`1E5`,
    // a name) is not a number of the formula's own.
    if (
      !NOT_BEFORE_NUMBER.test(text.charAt(start - 1)) &&
      !NOT_AFTER_NUMBER.test(text.charAt(index))
    ) {
      return true;
    }
  }
  return false;
}

/** Characters that make a following digit run part of a reference or a name. */
const NOT_BEFORE_NUMBER = /[A-Za-z$.:]/;
/** Characters that make a preceding digit run part of a name or a number in E notation. */
const NOT_AFTER_NUMBER = /[A-Za-z(]/;

function is_digit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function is_digit_or_dot(code: number): boolean {
  return is_digit(code) || code === 46;
}

/**
 * The situation a moved formula was found in, strongest first: which sides
 * gave it and whether both neighbours on a side did, what the other
 * neighbours said, and whether it holds numbers of its own.
 */
function reason_of(moved: Moved, contradiction: Contradiction): string {
  const { sides, formula } = moved;
  const on = (side: Side): number => sides.get(side) ?? 0;
  let reason: string;
  if (on("above") > 0 && on("below") > 0) reason = "aboveAndBelow";
  else if (on("left") > 0 && on("right") > 0) reason = "leftAndRight";
  else {
    const strongest = [...sides].sort((left, right) => right[1] - left[1])[0];
    const [side, count]: [Side, number] = strongest ?? ["furtherAbove", 1];
    reason = count > 1 ? `two ${side}` : side;
  }
  if (contradiction === "single") reason += ", contradicted";
  if (contradiction === "pair") reason += ", contradicted by a pair";
  return has_literal_number(formula) ? `${reason}, with numbers` : reason;
}

/** The formulas next to the edited cell, moved to it. */
function neighbour_proposals(edit: FormulaEdit): Proposal[] {
  const { cell, reads } = edit;
  const moved = new Map<string, Moved>();
  /** Whether the cell holds a formula; one that moves off the sheet is no proposal. */
  const read = (side: Side, row: number, col: number): boolean => {
    if (row < 0 || col < 0) return false;
    const source = reads.formula(cell.sheet, row, col);
    if (source === null) return false;

    const formula = reads.translate(source, cell.row - row, cell.col - col);
    if (formula.includes("#REF!")) return true;
    const key = formula.toUpperCase();
    const entry = moved.get(key) ?? { formula, sides: new Map<Side, number>() };
    entry.sides.set(side, (entry.sides.get(side) ?? 0) + 1);
    moved.set(key, entry);
    return true;
  };

  let above_found = false;
  for (const { side, dRow: d_row, dCol: d_col } of NEIGHBOURS) {
    const found = read(side, cell.row + d_row, cell.col + d_col);
    if (side === "above") above_found ||= found;
  }
  for (let distance = 3; !above_found && distance <= SEARCH_ABOVE; distance++) {
    above_found = read("furtherAbove", cell.row - distance, cell.col);
  }

  const all = [...moved.values()];
  const support = (entry: Moved): number =>
    [...entry.sides.values()].reduce((sum, count) => sum + count, 0);
  const proposals = all.map((entry) => {
    const others = all.filter((other) => other !== entry);
    const contradiction: Contradiction =
      others.length === 0 ? "none" : others.some((other) => support(other) > 1) ? "pair" : "single";
    return {
      formula: entry.formula,
      signal: "neighbours" as const,
      reason: reason_of(entry, contradiction),
    };
  });
  // Only neighbours on both sides of the cell agreeing are strong enough to show (#801 decision):
  // a formula from one side only was wrong too often on the held-out samples.
  return proposals.filter((proposal) => BOTH_SIDES.test(proposal.reason));
}

/** Open the neighbouring-formulas signal of one edit; it reads the neighbours once. */
export function openNeighbours(edit: FormulaEdit): Signal {
  const proposals = neighbour_proposals(edit);
  return { proposals: () => proposals };
}
