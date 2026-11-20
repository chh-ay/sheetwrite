// The workbook reads a data validation rule needs (`ValidationReads` in
// validation-rule.ts), over one store engine: formula results, with a
// trial value for a custom formula, and the items of a list's source.

import { formulaNameKey } from "../name-key.js";
import { parseRangeText } from "../panels/range-text.js";
import type { CellScalar } from "../types/cell.js";
import type { CellAddress, Range, SheetId } from "../types/coordinates.js";
import type { Workbook } from "../types/document.js";
import {
  ValidationBudgetError,
  type ValidationList,
  type ValidationReads,
  validationList,
} from "../validation-rule.js";
import type { FormulaPreview, FormulaPreviewValue } from "./formula-preview-result.js";
import { normalizedRange } from "./ranges.js";

/** The most items Excel's dropdown takes from a source range. */
const MAX_LIST_ITEMS = 32_767;

/**
 * What one check may cost: a rule's test of one value costs 1, each cell a
 * list's source reads costs 1, and each formula result costs
 * {@link FORMULA_COST}. A check that needs more stops with
 * {@link ValidationBudgetError}.
 */
const VALIDATION_BUDGET = 20_000_000;

/** What one formula result costs against the budget; each preview is bounded on its own. */
const FORMULA_COST = 100;

/** What the reads use from the store engine. */
export interface ValidationReadSource {
  workbook(): Workbook;
  /** The resolved values of `cols` in the data rows `[rows.start, rows.end)`, row by row. */
  values(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): ArrayLike<CellScalar>;
  previewFormula(cell: CellAddress, text: string): FormulaPreview;
  previewFormulaWith(cell: CellAddress, text: string, trial: CellScalar): FormulaPreview;
}

/** Validation reads over a store, which the store tells when its cells change. */
export interface StoreValidationReads extends ValidationReads {
  /** Forget the lists a check has read: the workbook changed under it. */
  invalidate(): void;
}

/** What one check has resolved, and what it may still spend. */
interface CheckScope {
  /** Each reference, by sheet and text, as the range it names. */
  readonly ranges: Map<string, Range | undefined>;
  /** Each source range's list, by sheet and range. */
  readonly lists: Map<string, ValidationList>;
  spent: number;
}

function previewResult(preview: FormulaPreview): FormulaPreviewValue | undefined {
  if (preview.status === "value") return preview.value;
  return preview.status === "array" ? preview.first : undefined;
}

/** Validation reads over `source`; a check may cost up to `budget`. */
export function storeValidationReads(
  source: ValidationReadSource,
  budget = VALIDATION_BUDGET,
): StoreValidationReads {
  let scope: CheckScope | undefined;
  const charge = (units: number): void => {
    if (!scope) return;
    scope.spent += units;
    if (scope.spent > budget) throw new ValidationBudgetError(budget, scope.spent);
  };
  // One window read of the source, up to the dropdown's item limit and the sheet's edges.
  const read = (input: Range): ValidationList => {
    const range = normalizedRange(input);
    const sheet = source.workbook().sheets.find((candidate) => candidate.id === range.sheet);
    if (!sheet) return validationList([]);
    const cols: number[] = [];
    for (
      let col = range.start.col;
      col <= Math.min(range.end.col, sheet.columns.length - 1);
      col++
    ) {
      cols.push(col);
    }
    if (cols.length === 0) return validationList([]);
    const rows = Math.min(
      range.end.row + 1,
      sheet.rowCount,
      range.start.row + Math.ceil(MAX_LIST_ITEMS / cols.length),
    );
    if (rows <= range.start.row) return validationList([]);
    charge((rows - range.start.row) * cols.length);
    const values = source.values(range.sheet, { start: range.start.row, end: rows }, cols);
    const count = Math.min(values.length, MAX_LIST_ITEMS);
    const items: CellScalar[] = new Array<CellScalar>(count);
    for (let index = 0; index < count; index++) items[index] = values[index] ?? null;
    return validationList(items);
  };
  const resolve = (reference: string, addr: Readonly<CellAddress>): Range | undefined => {
    // A defined name first, the sheet's own before the workbook's, as Excel resolves it.
    const key = formulaNameKey(reference.trim());
    const named = (source.workbook().namedRanges ?? [])
      .filter((candidate) => formulaNameKey(candidate.name) === key)
      .sort((a, b) => Number(b.scope === addr.sheet) - Number(a.scope === addr.sheet))
      .find((candidate) => candidate.scope === undefined || candidate.scope === addr.sheet);
    if (named?.range) return named.range;
    const text = named?.formula?.replace(/^=/, "") ?? reference;
    const parsed = parseRangeText(text, source.workbook().sheets, addr.sheet);
    return "range" in parsed ? parsed.range : undefined;
  };

  return {
    formula(formula, addr, trial) {
      charge(FORMULA_COST);
      return previewResult(
        trial === undefined
          ? source.previewFormula(addr, formula)
          : source.previewFormulaWith(addr, formula, trial),
      );
    },
    list(reference, addr) {
      if (!scope) {
        const range = resolve(reference, addr);
        return range ? read(range) : undefined;
      }
      const referenceKey = `${addr.sheet}\u0000${reference}`;
      let range = scope.ranges.get(referenceKey);
      if (range === undefined && !scope.ranges.has(referenceKey)) {
        range = resolve(reference, addr);
        scope.ranges.set(referenceKey, range);
      }
      if (!range) return undefined;
      const { start, end } = range;
      const listKey = `${range.sheet}\u0000${start.row}:${start.col}:${end.row}:${end.col}`;
      let list = scope.lists.get(listKey);
      if (!list) {
        list = read(range);
        scope.lists.set(listKey, list);
      }
      return list;
    },
    check(run) {
      if (scope) return run();
      scope = { ranges: new Map(), lists: new Map(), spent: 0 };
      try {
        return run();
      } finally {
        scope = undefined;
      }
    },
    charge,
    invalidate() {
      scope?.ranges.clear();
      scope?.lists.clear();
    },
  };
}
