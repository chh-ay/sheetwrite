// The workbook reads a data validation rule needs (`ValidationReads` in
// validation-rule.ts), over one store engine: formula results, with a
// trial value for a custom formula, and the cells of a list's source.

import { formulaNameKey } from "../name-key.js";
import { parseRangeText } from "../panels/range-text.js";
import type { CellScalar } from "../types/cell.js";
import type { CellAddress, Range } from "../types/coordinates.js";
import type { Workbook } from "../types/document.js";
import type { ResolvedCell } from "../types/store.js";
import type { ValidationReads } from "../validation-rule.js";
import type { FormulaPreview, FormulaPreviewValue } from "./formula-preview-result.js";

/** The most items Excel's dropdown takes from a source range. */
const MAX_LIST_ITEMS = 32_767;

/** What the reads use from the store engine. */
export interface ValidationReadSource {
  readonly workbook: Workbook;
  getCell(addr: CellAddress): ResolvedCell;
  previewFormula(cell: CellAddress, text: string): FormulaPreview;
  previewFormulaWith(cell: CellAddress, text: string, trial: CellScalar): FormulaPreview;
}

function previewResult(preview: FormulaPreview): FormulaPreviewValue | undefined {
  if (preview.status === "value") return preview.value;
  return preview.status === "array" ? preview.first : undefined;
}

/** Validation reads over `source`. */
export function storeValidationReads(source: ValidationReadSource): ValidationReads {
  const cells = (range: Range): CellScalar[] => {
    const items: CellScalar[] = [];
    for (let row = range.start.row; row <= range.end.row; row++) {
      for (let col = range.start.col; col <= range.end.col; col++) {
        if (items.length === MAX_LIST_ITEMS) return items;
        items.push(source.getCell({ sheet: range.sheet, row, col }).resolved);
      }
    }
    return items;
  };
  const parse = (reference: string, sheet: string): Range | undefined => {
    const parsed = parseRangeText(reference, source.workbook.sheets, sheet);
    return "range" in parsed ? parsed.range : undefined;
  };

  return {
    formula(formula, addr, trial) {
      return previewResult(
        trial === undefined
          ? source.previewFormula(addr, formula)
          : source.previewFormulaWith(addr, formula, trial),
      );
    },
    range(reference, addr) {
      // A defined name first, the sheet's own before the workbook's, as Excel resolves it.
      const key = formulaNameKey(reference.trim());
      const named = (source.workbook.namedRanges ?? [])
        .filter((candidate) => formulaNameKey(candidate.name) === key)
        .sort((a, b) => Number(b.scope === addr.sheet) - Number(a.scope === addr.sheet))
        .find((candidate) => candidate.scope === undefined || candidate.scope === addr.sheet);
      if (named?.range) return cells(named.range);
      const range = parse(named?.formula?.replace(/^=/, "") ?? reference, addr.sheet);
      return range ? cells(range) : undefined;
    },
  };
}
