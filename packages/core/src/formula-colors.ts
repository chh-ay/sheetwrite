import type { FormulaReference } from "./formula-analysis.js";

/**
 * Reference colours, cycled by `colorIndex`. Text uses the colour; the grid
 * fill adds {@link RANGE_FILL_ALPHA}, so a range reads as the same colour as
 * its reference and the cells under it stay legible.
 */
const REFERENCE_COLORS: readonly string[] = [
  "#4285f4",
  "#ea4335",
  "#f9ab00",
  "#34a853",
  "#a142f4",
  "#00acc1",
];

export const RANGE_FILL_ALPHA = "55";

export function referenceColor(reference: FormulaReference): string {
  return REFERENCE_COLORS[reference.colorIndex % REFERENCE_COLORS.length] ?? "";
}
