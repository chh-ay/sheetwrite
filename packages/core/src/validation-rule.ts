/**
 * What a data-validation rule accepts, and the text Excel shows when it does
 * not. The store's mutation policy and the grid's error alert both decide
 * with {@link validationAccepts}, so a value the alert lets through is a value
 * the store keeps.
 */

import { shiftA1Refs } from "./a1.js";
import type { FormulaPreviewValue } from "./store/formula-preview-result.js";
import { normalizedRange, rangeContains } from "./store/ranges.js";
import type { CellScalar } from "./types/cell.js";
import type { CellAddress } from "./types/coordinates.js";
import type {
  DataValidationComparison,
  DataValidationCondition,
  DataValidationOperand,
  DataValidationRule,
  ValidationErrorStyle,
} from "./types/document.js";

/** Excel's error alert text for a rule without its own message. */
export const DEFAULT_VALIDATION_ERROR =
  "This value doesn't match the data validation restrictions defined for this cell.";

/** The error alert's title for a rule without its own title. */
export const DEFAULT_VALIDATION_TITLE = "Data Validation";

/**
 * What checking a rule reads from the workbook: formula results and the
 * cells of a list's source. Without it, the formula parts of a rule pass
 * every value, as do parts the engine cannot evaluate.
 */
export interface ValidationReads {
  /**
   * The result of `formula` (with its leading `=`) in the cell `addr`; with
   * `trial`, as if that cell held it. Undefined when the engine cannot tell.
   */
  formula(
    formula: string,
    addr: Readonly<CellAddress>,
    trial?: CellScalar,
  ): FormulaPreviewValue | undefined;
  /**
   * The cells of `reference` (a range such as `$A$1:$A$9` or `Lists!A1:A9`,
   * or a defined name, without `=`) in reading order, read from the sheet of
   * `addr` unless the reference names one; undefined when it is no range.
   */
  range(reference: string, addr: Readonly<CellAddress>): readonly CellScalar[] | undefined;
}

/** The alert style of `rule`, from its policy when the rule names none. */
export function validationErrorStyle(rule: DataValidationRule): ValidationErrorStyle {
  return rule.errorStyle ?? (rule.policy === "warn" ? "warning" : "stop");
}

/** Whether `rule` shows an input message when one of its cells is selected. */
export function hasInputMessage(rule: DataValidationRule): boolean {
  return rule.showInputMessage !== false && Boolean(rule.inputTitle || rule.inputMessage);
}

/** Whether `rule` is a list with Excel's in-cell dropdown, which shows its arrow and list. */
export function hasListDropdown(rule: DataValidationRule): boolean {
  return rule.condition.kind === "list" && rule.inCellDropdown !== false;
}

/**
 * `condition` with each of its formulas changed by `map`: a list's source, a
 * custom formula and formula operands. Structural edits and sheet copies move
 * them as they move a conditional format's formula.
 */
export function mapValidationFormulas(
  condition: DataValidationCondition,
  map: (formula: string) => string,
): DataValidationCondition {
  const operand = (value: DataValidationOperand): DataValidationOperand =>
    typeof value === "string" ? map(value) : value;
  switch (condition.kind) {
    case "custom":
      return { ...condition, formula: map(condition.formula) };
    case "list":
      return "source" in condition ? { ...condition, source: map(condition.source) } : condition;
    case "number":
    case "date":
    case "time":
    case "textLength": {
      const comparison = condition.comparison;
      if (!comparison) return condition;
      return {
        ...condition,
        comparison:
          "value" in comparison
            ? { ...comparison, value: operand(comparison.value) }
            : { ...comparison, min: operand(comparison.min), max: operand(comparison.max) },
      };
    }
    case "any":
    case "checkbox":
      return condition;
  }
}

/** `formula`, written for the top-left cell of `rule`, as the cell `addr` reads it. */
function formulaAt(rule: DataValidationRule, formula: string, addr: Readonly<CellAddress>): string {
  const origin = normalizedRange(rule.range).start;
  return shiftA1Refs(formula, addr.row - origin.row, addr.col - origin.col);
}

/**
 * The items of a list rule in the cell `addr`: its values, or the cells of
 * its source. A source that names no range has none.
 */
export function validationListItems(
  rule: DataValidationRule,
  addr: Readonly<CellAddress>,
  reads?: ValidationReads,
): readonly CellScalar[] {
  const condition = rule.condition;
  if (condition.kind !== "list") return [];
  if ("values" in condition) return condition.values;
  const reference = formulaAt(rule, condition.source, addr).replace(/^=/, "");
  return reads?.range(reference, addr) ?? [];
}

/** A list item's text as Excel compares it with an entry: without case. */
function itemKey(value: CellScalar): string {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value ?? "").toLocaleUpperCase();
}

function operandValue(
  rule: DataValidationRule,
  operand: DataValidationOperand,
  addr: Readonly<CellAddress> | undefined,
  reads: ValidationReads | undefined,
): number | undefined {
  if (typeof operand === "number") return operand;
  if (!addr || !reads) return undefined;
  const result = reads.formula(formulaAt(rule, operand, addr), addr);
  return typeof result === "number" ? result : undefined;
}

/** Whether `value` meets `comparison`; a bound the engine cannot tell lets it pass. */
function comparisonAccepts(
  rule: DataValidationRule,
  comparison: DataValidationComparison,
  value: number,
  addr: Readonly<CellAddress> | undefined,
  reads: ValidationReads | undefined,
): boolean {
  if ("value" in comparison) {
    const bound = operandValue(rule, comparison.value, addr, reads);
    if (bound === undefined) return true;
    switch (comparison.operator) {
      case "equal":
        return value === bound;
      case "notEqual":
        return value !== bound;
      case "greaterThan":
        return value > bound;
      case "lessThan":
        return value < bound;
      case "greaterThanOrEqual":
        return value >= bound;
      case "lessThanOrEqual":
        return value <= bound;
    }
  }
  const min = operandValue(rule, comparison.min, addr, reads);
  const max = operandValue(rule, comparison.max, addr, reads);
  if (min === undefined || max === undefined) return true;
  const inside = value >= min && value <= max;
  return comparison.operator === "between" ? inside : !inside;
}

/**
 * Whether `value` in the cell `addr` of `rule` passes the rule's condition.
 * Formula parts (a list's source, formula bounds, a custom formula) need
 * `addr` and `reads`; without them they pass every value.
 */
export function validationAccepts(
  rule: DataValidationRule,
  value: CellScalar,
  addr?: Readonly<CellAddress>,
  reads?: ValidationReads,
): boolean {
  if (value === null && (rule.allowBlank ?? true)) return true;
  const condition = rule.condition;
  switch (condition.kind) {
    case "any":
      return true;
    case "list": {
      if (condition.allowCustom === true) return true;
      let items: readonly CellScalar[];
      if ("values" in condition) items = condition.values;
      else if (addr && reads) items = validationListItems(rule, addr, reads);
      else return true;
      const key = itemKey(value);
      return items.some((item) => item !== null && itemKey(item) === key);
    }
    case "checkbox": {
      const checked = condition.checkedValue ?? true;
      const unchecked = condition.uncheckedValue ?? false;
      return Object.is(value, checked) || Object.is(value, unchecked);
    }
    case "custom": {
      if (!addr || !reads) return true;
      const result = reads.formula(formulaAt(rule, condition.formula, addr), addr, value);
      if (result === undefined) return true;
      return result === true || (typeof result === "number" && result !== 0);
    }
    case "textLength": {
      // Excel measures a number by the digits it shows unformatted.
      if (typeof value !== "string" && typeof value !== "number") return false;
      const length = String(value).length;
      if (condition.comparison) {
        return comparisonAccepts(rule, condition.comparison, length, addr, reads);
      }
      return (
        (condition.min === undefined || length >= condition.min) &&
        (condition.max === undefined || length <= condition.max)
      );
    }
    case "number":
    case "date":
    case "time": {
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      if (condition.kind === "number" && condition.integer && !Number.isInteger(value)) {
        return false;
      }
      if (condition.comparison) {
        return comparisonAccepts(rule, condition.comparison, value, addr, reads);
      }
      return (
        (condition.min === undefined || value >= condition.min) &&
        (condition.max === undefined || value <= condition.max)
      );
    }
  }
}

/**
 * A rule over `addr` whose check `value` fails: a `reject` rule before a
 * `warn` rule, so the alert the user answers is the one that decides. Rules
 * whose alert is off (`allow`) are skipped, as Excel stores such a value
 * without a word.
 */
export function failingValidationRule(
  rules: readonly DataValidationRule[],
  addr: Readonly<CellAddress>,
  value: CellScalar,
  reads?: ValidationReads,
): DataValidationRule | undefined {
  let broken: DataValidationRule | undefined;
  for (const rule of rules) {
    if (
      rule.policy === "allow" ||
      !rangeContains(rule.range, addr) ||
      validationAccepts(rule, value, addr, reads)
    ) {
      continue;
    }
    if (rule.policy === "reject") return rule;
    broken ??= rule;
  }
  return broken;
}

function comparisonMessage(subject: string, comparison: DataValidationComparison): string {
  switch (comparison.operator) {
    case "between":
      return `${subject} must be between ${comparison.min} and ${comparison.max}, inclusive`;
    case "notBetween":
      return `${subject} must be less than ${comparison.min} or greater than ${comparison.max}`;
    case "equal":
      return `${subject} must equal ${comparison.value}`;
    case "notEqual":
      return `${subject} must not equal ${comparison.value}`;
    case "greaterThan":
      return `${subject} must be greater than ${comparison.value}`;
    case "lessThan":
      return `${subject} must be less than ${comparison.value}`;
    case "greaterThanOrEqual":
      return `${subject} must be greater than or equal to ${comparison.value}`;
    case "lessThanOrEqual":
      return `${subject} must be less than or equal to ${comparison.value}`;
  }
}

/** The `MutationIssue.message` of a value `rule` refuses: its own message, or one built from its condition. */
export function validationIssueMessage(rule: DataValidationRule): string {
  if (rule.helpText) return rule.helpText;
  const condition = rule.condition;
  switch (condition.kind) {
    case "any":
      return "Any value is allowed";
    case "list":
      return "Value must match one of the allowed options";
    case "custom":
      return `Value must make ${condition.formula} true`;
    case "number":
      return condition.comparison
        ? comparisonMessage("Value", condition.comparison)
        : "Value must be within the allowed numeric range";
    case "date":
      return condition.comparison
        ? comparisonMessage("Date", condition.comparison)
        : "Date must be within the allowed range";
    case "time":
      return condition.comparison
        ? comparisonMessage("Time", condition.comparison)
        : "Time must be within the allowed range";
    case "textLength":
      return condition.comparison
        ? comparisonMessage("Text length", condition.comparison)
        : "Text length is outside the allowed range";
    case "checkbox":
      return "Value must be a valid checkbox state";
  }
}
