// Signal 1 of #801, neighbouring formulas: the formulas next to the edited
// cell, moved to it as a fill or paste would move them. When the formulas
// above and below agree, the cell almost surely continues their pattern.

import type { FormulaEdit } from "@sheetwrite/core";

import type { Candidate, Signal } from "../candidates.js";

/** Where a neighbour sits, relative to the edited cell. */
type Side = "above" | "below" | "left" | "right";

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

/** Measured on the development sets (see bench/README.md). */
const CONFIDENCE = {
  /** The formulas above and below, moved here, are the same. */
  aboveAndBelow: 0.97,
  /** The two formulas above, moved here, are the same. */
  twoAbove: 0.95,
  /** The formulas left and right, moved here, are the same. */
  leftAndRight: 0.93,
  above: 0.9,
  below: 0.86,
  /** The nearest formula higher up the column, past empty or literal cells. */
  furtherAbove: 0.8,
  left: 0.8,
  right: 0.75,
} as const;
/** A candidate that another neighbour contradicts keeps this share of its confidence. */
const CONTRADICTED = 0.8;

/** The moved formulas, each with the sides that gave it. */
type Moved = Map<string, { formula: string; sides: Set<Side | "furtherAbove">; count: number }>;

function confidence(sides: ReadonlySet<Side | "furtherAbove">, count: number): number {
  if (sides.has("above") && sides.has("below")) return CONFIDENCE.aboveAndBelow;
  if (sides.has("left") && sides.has("right")) return CONFIDENCE.leftAndRight;
  if (sides.has("above")) return count > 1 ? CONFIDENCE.twoAbove : CONFIDENCE.above;
  if (sides.has("below")) return CONFIDENCE.below;
  if (sides.has("left")) return CONFIDENCE.left;
  if (sides.has("right")) return CONFIDENCE.right;
  return CONFIDENCE.furtherAbove;
}

/** The formulas next to the edited cell, moved to it, with their confidence. */
function neighbourCandidates(edit: FormulaEdit): Candidate[] {
  const { cell, reads } = edit;
  const moved: Moved = new Map();
  const add = (side: Side | "furtherAbove", row: number, col: number): boolean => {
    if (row < 0 || col < 0) return false;
    const source = reads.formula(cell.sheet, row, col);
    if (source === null) return false;

    const formula = reads.translate(source, cell.row - row, cell.col - col);
    if (formula.includes("#REF!")) return true;
    const key = formula.toUpperCase();
    const entry = moved.get(key) ?? { formula, sides: new Set(), count: 0 };
    entry.sides.add(side);
    entry.count++;
    moved.set(key, entry);
    return true;
  };

  let aboveFound = false;
  for (const { side, dRow, dCol } of NEIGHBOURS) {
    const found = add(side, cell.row + dRow, cell.col + dCol);
    if (side === "above") aboveFound ||= found;
  }
  for (let distance = 3; !aboveFound && distance <= SEARCH_ABOVE; distance++) {
    aboveFound = add("furtherAbove", cell.row - distance, cell.col);
  }

  const contradicted = moved.size > 1;
  return [...moved.values()].map(({ formula, sides, count }) => ({
    formula,
    confidence: confidence(sides, count) * (contradicted ? CONTRADICTED : 1),
    signal: "neighbours",
  }));
}

/** Open the neighbouring-formulas signal of one edit; it reads the neighbours once. */
export function openNeighbours(edit: FormulaEdit): Signal {
  const candidates = neighbourCandidates(edit);
  return { candidates: () => candidates };
}
