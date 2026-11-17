/**
 * What a data-validation rule accepts, and the text Excel shows when it does
 * not. The store's mutation policy and the grid's error alert both decide
 * with {@link validationAccepts}, so a value the alert lets through is a value
 * the store keeps.
 */

import { rangeContains } from "./store/ranges.js";
import type { CellScalar } from "./types/cell.js";
import type { CellAddress } from "./types/coordinates.js";
import type {
  DataValidationComparison,
  DataValidationRule,
  ValidationErrorStyle,
} from "./types/document.js";

/** Excel's error alert text for a rule without its own message. */
export const DEFAULT_VALIDATION_ERROR =
  "This value doesn't match the data validation restrictions defined for this cell.";

/** The error alert's title for a rule without its own title. */
export const DEFAULT_VALIDATION_TITLE = "Data Validation";

/** The alert style of `rule`, from its policy when the rule names none. */
export function validationErrorStyle(rule: DataValidationRule): ValidationErrorStyle {
  return rule.errorStyle ?? (rule.policy === "warn" ? "warning" : "stop");
}

/** Whether `rule` shows an input message when one of its cells is selected. */
export function hasInputMessage(rule: DataValidationRule): boolean {
  return rule.showInputMessage !== false && Boolean(rule.inputTitle || rule.inputMessage);
}

function comparisonAccepts(comparison: DataValidationComparison, value: number): boolean {
  switch (comparison.operator) {
    case "between":
      return value >= comparison.min && value <= comparison.max;
    case "notBetween":
      return value < comparison.min || value > comparison.max;
    case "equal":
      return value === comparison.value;
    case "notEqual":
      return value !== comparison.value;
    case "greaterThan":
      return value > comparison.value;
    case "lessThan":
      return value < comparison.value;
    case "greaterThanOrEqual":
      return value >= comparison.value;
    case "lessThanOrEqual":
      return value <= comparison.value;
  }
}

/** Whether `value` in a cell of `rule` passes the rule's condition. */
export function validationAccepts(rule: DataValidationRule, value: CellScalar): boolean {
  if (value === null && (rule.allowBlank ?? true)) return true;
  const condition = rule.condition;
  if (condition.kind === "list") {
    return (
      condition.allowCustom === true || condition.values.some((item) => Object.is(item, value))
    );
  }
  if (condition.kind === "checkbox") {
    const checked = condition.checkedValue ?? true;
    const unchecked = condition.uncheckedValue ?? false;
    return Object.is(value, checked) || Object.is(value, unchecked);
  }
  if (condition.kind === "textLength") {
    if (typeof value !== "string") return false;
    if (condition.comparison) return comparisonAccepts(condition.comparison, value.length);
    return (
      (condition.min === undefined || value.length >= condition.min) &&
      (condition.max === undefined || value.length <= condition.max)
    );
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (condition.kind === "number" && condition.integer && !Number.isInteger(value)) return false;
  if (condition.comparison) return comparisonAccepts(condition.comparison, value);
  return (
    (condition.min === undefined || value >= condition.min) &&
    (condition.max === undefined || value <= condition.max)
  );
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
): DataValidationRule | undefined {
  let broken: DataValidationRule | undefined;
  for (const rule of rules) {
    if (
      rule.policy === "allow" ||
      !rangeContains(rule.range, addr) ||
      validationAccepts(rule, value)
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
  switch (rule.condition.kind) {
    case "list":
      return "Value must match one of the allowed options";
    case "number":
      return rule.condition.comparison
        ? comparisonMessage("Value", rule.condition.comparison)
        : "Value must be within the allowed numeric range";
    case "date":
      return rule.condition.comparison
        ? comparisonMessage("Date", rule.condition.comparison)
        : "Date must be within the allowed range";
    case "textLength":
      return rule.condition.comparison
        ? comparisonMessage("Text length", rule.condition.comparison)
        : "Text length is outside the allowed range";
    case "checkbox":
      return "Value must be a valid checkbox state";
  }
}
