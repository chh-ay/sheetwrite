import type { ConditionalFormatRule } from "./types/cell.js";
import type { Sheet } from "./types/document.js";

/** Maximum ordered conditional-format rules admitted per worksheet and encoded in one u32 match mask. */
export const MAX_CONDITIONAL_FORMAT_RULES = 32;

/** Maximum serialized formula predicate source; parsing/evaluation stays bounded per visible cell. */
export const MAX_CONDITIONAL_FORMAT_FORMULA_LENGTH = 8_192;

/** Validate bounded, sheet-local renderer rules without allocating normalized range objects. */
export function validConditionalRules(
  sheet: Sheet,
  rules: readonly ConditionalFormatRule[],
): boolean {
  if (rules.length > MAX_CONDITIONAL_FORMAT_RULES) return false;
  return rules.every((rule) => {
    const formula_source = rule.when?.kind === "formula" ? rule.when.source : undefined;
    if (
      rule.range.sheet !== sheet.id ||
      (rule.stopIfTrue !== undefined && typeof rule.stopIfTrue !== "boolean") ||
      (rule.when?.kind === "formula" &&
        (typeof formula_source !== "string" ||
          !formula_source.startsWith("=") ||
          formula_source.length > MAX_CONDITIONAL_FORMAT_FORMULA_LENGTH))
    ) {
      return false;
    }
    const start_row = Math.min(rule.range.start.row, rule.range.end.row);
    const start_col = Math.min(rule.range.start.col, rule.range.end.col);
    const end_row = Math.max(rule.range.start.row, rule.range.end.row);
    const end_col = Math.max(rule.range.start.col, rule.range.end.col);
    return (
      Number.isInteger(start_row) &&
      start_row >= 0 &&
      Number.isInteger(start_col) &&
      start_col >= 0 &&
      Number.isInteger(end_row) &&
      end_row < sheet.rowCount &&
      Number.isInteger(end_col) &&
      end_col < sheet.columns.length
    );
  });
}
