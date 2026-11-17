// Signal 1 of #801, neighbouring formulas: the formulas next to the edited
// cell, moved to it as a fill or paste would move them. When the formulas
// above and below agree, the cell almost surely continues their pattern.

import type { FormulaEdit } from "@sheetwrite/core";

import type { Proposal, Signal } from "../candidates.js";

/** Where a neighbour sits, relative to the edited cell. */
type Side = "above" | "below" | "left" | "right" | "furtherAbove";

/** The neighbours read, nearest first on each side. */
const NEIGHBOURS: readonly { readonly side: Side; readonly dRow: number; readonly dCol: number }[] = [
  { side: "above", dRow: -1, dCol: 0 },
  { side: "above", dRow: -2, dCol: 0 },
  { side: "below", dRow: 1, dCol: 0 },
  { side: "below", dRow: 2, dCol: 0 },
  { side: "left", dRow: 0, dCol: -1 },
  { side: "right", dRow: 0, dCol: 1 },
];

/** Rows searched upward for the nearest formula of the column, when the two above hold none. */
const SEARCH_ABOVE = 12;

/**
 * The situation a moved formula was found in, strongest first: which sides
 * gave it, and whether another neighbour gave a different formula.
 */
function reasonOf(sides: ReadonlySet<Side>, count: number, contradicted: boolean): string {
  let reason: string;
  if (sides.has("above") && sides.has("below")) reason = "aboveAndBelow";
  else if (sides.has("left") && sides.has("right")) reason = "leftAndRight";
  else if (sides.has("above")) reason = count > 1 ? "twoAbove" : "above";
  else if (sides.has("below")) reason = "below";
  else if (sides.has("left")) reason = "left";
  else if (sides.has("right")) reason = "right";
  else reason = "furtherAbove";
  return contradicted ? `${reason}, contradicted` : reason;
}

/** The formulas next to the edited cell, moved to it. */
function neighbourProposals(edit: FormulaEdit): Proposal[] {
  const { cell, reads } = edit;
  const moved = new Map<string, { formula: string; sides: Set<Side>; count: number }>();
  /** Whether the cell holds a formula; one that moves off the sheet is no proposal. */
  const read = (side: Side, row: number, col: number): boolean => {
    if (row < 0 || col < 0) return false;
    const source = reads.formula(cell.sheet, row, col);
    if (source === null) return false;

    const formula = reads.translate(source, cell.row - row, cell.col - col);
    if (formula.includes("#REF!")) return true;
    const key = formula.toUpperCase();
    const entry = moved.get(key) ?? { formula, sides: new Set<Side>(), count: 0 };
    entry.sides.add(side);
    entry.count++;
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

  const contradicted = moved.size > 1;
  return [...moved.values()].map(({ formula, sides, count }) => ({
    formula,
    signal: "neighbours",
    reason: reasonOf(sides, count, contradicted),
  }));
}

/** Open the neighbouring-formulas signal of one edit; it reads the neighbours once. */
export function openNeighbours(edit: FormulaEdit): Signal {
  const proposals = neighbourProposals(edit);
  return { proposals: () => proposals };
}
