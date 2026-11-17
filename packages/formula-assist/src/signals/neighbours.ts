// Signal 1 of #801, neighbouring formulas: the formulas next to the edited
// cell, moved to it as a fill or paste would move them. When the formulas
// above and below agree, the cell almost surely continues their pattern.

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

/** What else the neighbours said: nothing, one other formula, or another formula two of them agree on. */
type Contradiction = "none" | "single" | "pair";

/**
 * A number written in the formula itself, outside references: the `31` of
 * `=D11*31`. Neighbours copied across days or months often differ in it.
 */
const LITERAL_NUMBER = /(?<![A-Za-z$\d.:])\d+(?:\.\d+)?(?![\d.]*[A-Za-z(])/;

function hasLiteralNumber(formula: string): boolean {
  return LITERAL_NUMBER.test(formula.replace(/"[^"]*"/g, '""'));
}

/**
 * The situation a moved formula was found in, strongest first: which sides
 * gave it and whether both neighbours on a side did, what the other
 * neighbours said, and whether it holds numbers of its own.
 */
function reasonOf(moved: Moved, contradiction: Contradiction): string {
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
  return hasLiteralNumber(formula) ? `${reason}, with numbers` : reason;
}

/** The formulas next to the edited cell, moved to it. */
function neighbourProposals(edit: FormulaEdit): Proposal[] {
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

  let aboveFound = false;
  for (const { side, dRow, dCol } of NEIGHBOURS) {
    const found = read(side, cell.row + dRow, cell.col + dCol);
    if (side === "above") aboveFound ||= found;
  }
  for (let distance = 3; !aboveFound && distance <= SEARCH_ABOVE; distance++) {
    aboveFound = read("furtherAbove", cell.row - distance, cell.col);
  }

  const all = [...moved.values()];
  const support = (entry: Moved): number =>
    [...entry.sides.values()].reduce((sum, count) => sum + count, 0);
  return all.map((entry) => {
    const others = all.filter((other) => other !== entry);
    const contradiction: Contradiction =
      others.length === 0 ? "none" : others.some((other) => support(other) > 1) ? "pair" : "single";
    return { formula: entry.formula, signal: "neighbours", reason: reasonOf(entry, contradiction) };
  });
}

/** Open the neighbouring-formulas signal of one edit; it reads the neighbours once. */
export function openNeighbours(edit: FormulaEdit): Signal {
  const proposals = neighbourProposals(edit);
  return { proposals: () => proposals };
}
