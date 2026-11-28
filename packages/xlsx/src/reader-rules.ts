import type {
  CellScalar,
  CellStyle,
  ConditionalFormatPredicate,
  ConditionalFormatRule,
  DataValidationComparison,
  DataValidationCondition,
  DataValidationOperand,
  DataValidationRule,
  ValidationErrorStyle,
} from "@sheetwrite/core";
import {
  MAX_CONDITIONAL_FORMAT_FORMULA_LENGTH,
  MAX_CONDITIONAL_FORMAT_RULES,
  MAX_VALIDATION_FORMULA_LENGTH,
} from "@sheetwrite/core/codec";
import { formulaContainsExternalReference } from "@sheetwrite/core/external-links";

import type { ParsedValidation } from "./reader-types.js";
import { parseRange } from "./reader-values.js";
import { emitWarning, type XlsxCodecContext } from "./resources.js";
import { ParsedStyles } from "./styles.js";
import {
  decodeXstring,
  type XmlElement,
  xmlAttribute,
  xmlBoolean,
  xmlChild,
  xmlChildren,
  xmlLocalName,
} from "./xml.js";

export function parseValidation(
  element: XmlElement,
  context: XlsxCodecContext,
  sheet: string,
  date1904: boolean,
): ParsedValidation[] {
  const type = xmlAttribute(element, "type") ?? "none";
  const ranges = (xmlAttribute(element, "sqref") ?? "").trim().split(/\s+/).filter(Boolean);
  const formula1 = xmlChild(element, "formula1")?.text;
  const formula2 = xmlChild(element, "formula2")?.text;
  // Snapshot validation refuses a formula longer than Excel's limit, which
  // would fail the whole import, so such a rule is dropped instead.
  let formula_too_long = false;
  const formula_text = (formula: string): string => {
    const text = `=${decodeXstring(formula)}`;
    if (text.length > MAX_VALIDATION_FORMULA_LENGTH) formula_too_long = true;
    return text;
  };
  let condition: DataValidationCondition | undefined;
  if (type === "none") {
    condition = { kind: "any" };
  } else if (type === "list" && formula1 !== undefined) {
    condition =
      formula1.startsWith('"') && formula1.endsWith('"')
        ? { kind: "list", values: quoted_list_values(formula1.slice(1, -1)) }
        : { kind: "list", source: formula_text(formula1) };
  } else if (type === "custom" && formula1 !== undefined) {
    condition = { kind: "custom", formula: formula_text(formula1) };
  } else if (
    type === "decimal" ||
    type === "whole" ||
    type === "date" ||
    type === "time" ||
    type === "textLength"
  ) {
    const serial_shift = type === "date" && date1904 ? DATE_1904_OFFSET : 0;
    const operand = (formula: string | undefined): DataValidationOperand | undefined => {
      if (formula === undefined) return undefined;
      const number = Number(formula);
      return formula.trim() !== "" && Number.isFinite(number)
        ? number + serial_shift
        : formula_text(formula);
    };
    const operator = xmlAttribute(element, "operator") ?? "between";
    const comparison = validation_comparison(operator, operand(formula1), operand(formula2));
    if (!comparison) {
      emitWarning(context, {
        code: "validation-loss",
        message: `Excel validation operator ${operator} could not be represented without broadening and was dropped`,
        sheet,
      });
      return [];
    }
    const operands = "value" in comparison ? [comparison.value] : [comparison.min, comparison.max];
    if (
      type === "textLength" &&
      operands.some(
        (value) => typeof value === "number" && !(Number.isSafeInteger(value) && value >= 0),
      )
    ) {
      emitWarning(context, {
        code: "validation-loss",
        message: "Non-integer or negative text-length validation was dropped",
        sheet,
      });
      return [];
    }
    const bounds = comparison_bounds(comparison);
    condition =
      type === "date" || type === "time" || type === "textLength"
        ? { kind: type, ...bounds }
        : { kind: "number", ...bounds, ...(type === "whole" ? { integer: true } : {}) };
  }
  if (formula_too_long) {
    emitWarning(context, {
      code: "validation-loss",
      message: `Excel validation formula exceeds ${MAX_VALIDATION_FORMULA_LENGTH} characters and was dropped`,
      sheet,
    });
    return [];
  }
  if (!condition || ranges.length === 0) {
    emitWarning(context, {
      code: "validation-loss",
      message: `Excel validation type ${type} was dropped`,
      sheet,
    });
    return [];
  }
  const show_error = xmlBoolean(xmlAttribute(element, "showErrorMessage"));
  const style_attribute = xmlAttribute(element, "errorStyle");
  const error_style: ValidationErrorStyle =
    style_attribute === "warning" || style_attribute === "information" ? style_attribute : "stop";
  const policy: DataValidationRule["policy"] = !show_error
    ? "allow"
    : error_style === "stop"
      ? "reject"
      : "warn";
  // A rule keeps only the style its policy does not imply: information for
  // `warn`, and the style Excel remembers while the alert is off.
  const implied_style = policy === "warn" ? "warning" : "stop";
  const help_text = validation_text(element, "error", 255, context, sheet);
  const error_title = validation_text(element, "errorTitle", 32, context, sheet);
  const input_title = validation_text(element, "promptTitle", 32, context, sheet);
  const input_message = validation_text(element, "prompt", 255, context, sheet);
  const show_input_message = xmlAttribute(element, "showInputMessage");
  const fields = {
    policy,
    ...(type === "list" && xmlBoolean(xmlAttribute(element, "showDropDown"))
      ? { inCellDropdown: false }
      : {}),
    ...(error_style === implied_style ? {} : { errorStyle: error_style }),
    ...(show_input_message !== undefined && !xmlBoolean(show_input_message)
      ? { showInputMessage: false }
      : {}),
    ...(help_text === undefined ? {} : { helpText: help_text }),
    ...(error_title === undefined ? {} : { errorTitle: error_title }),
    ...(input_title === undefined ? {} : { inputTitle: input_title }),
    ...(input_message === undefined ? {} : { inputMessage: input_message }),
  };
  return ranges.map((range_text) => {
    const range = parseRange(range_text);
    return {
      range: { start: { row: range.r0, col: range.c0 }, end: { row: range.r1, col: range.c1 } },
      condition: structuredClone(condition),
      ...fields,
      allowBlank: xmlBoolean(xmlAttribute(element, "allowBlank")),
    };
  });
}

/** Days from 1900-01-00 to 1904-01-01: a 1904 workbook's serial plus this is a 1900 serial. */
const DATE_1904_OFFSET = 1462;

/** The items of a typed list, the text between the quotes of `"North,South"`. */
function quoted_list_values(body: string): CellScalar[] {
  const values: CellScalar[] = [];
  let value = "";
  for (let index = 0; index <= body.length; index++) {
    const character = body[index];
    if (character === '"' && body[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === "," || index === body.length) {
      const decoded = decodeXstring(value);
      values.push(decoded === "TRUE" ? true : decoded === "FALSE" ? false : decoded);
      value = "";
    } else {
      value += character ?? "";
    }
  }
  return values;
}

const SINGLE_OPERATORS = new Set([
  "equal",
  "notEqual",
  "greaterThan",
  "lessThan",
  "greaterThanOrEqual",
  "lessThanOrEqual",
] as const);

function is_single_operator(
  operator: string,
): operator is Extract<DataValidationComparison, { value: unknown }>["operator"] {
  return (SINGLE_OPERATORS as ReadonlySet<string>).has(operator);
}

/** Excel's operator and operands as a comparison; undefined when they make none. */
function validation_comparison(
  operator: string,
  first: DataValidationOperand | undefined,
  second: DataValidationOperand | undefined,
): DataValidationComparison | undefined {
  if (operator === "between" || operator === "notBetween") {
    if (first === undefined || second === undefined) return undefined;
    if (typeof first === "number" && typeof second === "number" && first > second) {
      return undefined;
    }
    return { operator, min: first, max: second };
  }
  return is_single_operator(operator) && first !== undefined
    ? { operator, value: first }
    : undefined;
}

/**
 * A comparison as the condition keeps it: number bounds that an inclusive
 * minimum and maximum say exactly stay `min` and `max`; the rest, and every
 * formula bound, stay a `comparison`.
 */
function comparison_bounds(
  comparison: DataValidationComparison,
): { min?: number; max?: number } | { comparison: DataValidationComparison } {
  if ("value" in comparison) {
    const { operator, value } = comparison;
    if (typeof value !== "number") return { comparison };
    if (operator === "equal") return { min: value, max: value };
    if (operator === "greaterThanOrEqual") return { min: value };
    if (operator === "lessThanOrEqual") return { max: value };
    return { comparison };
  }
  const { operator, min, max } = comparison;
  return operator === "between" && typeof min === "number" && typeof max === "number"
    ? { min, max }
    : { comparison };
}

/** A validation title or message attribute; one longer than Excel allows is dropped with a warning. */
function validation_text(
  element: XmlElement,
  attribute: "error" | "errorTitle" | "prompt" | "promptTitle",
  max_length: number,
  context: XlsxCodecContext,
  sheet: string,
): string | undefined {
  const raw = xmlAttribute(element, attribute);
  if (!raw) return undefined;
  const text = decodeXstring(raw);
  if (Array.from(text).length <= max_length) return text;
  emitWarning(context, {
    code: "validation-loss",
    message: `Excel validation ${attribute} exceeded ${max_length} characters and was dropped`,
    sheet,
  });
  return undefined;
}

function conditional_scalar(formula: string | undefined): CellScalar | undefined {
  if (formula === undefined) return undefined;
  const value = formula.trim();
  if (/^TRUE$/i.test(value)) return true;
  if (/^FALSE$/i.test(value)) return false;
  if (value.startsWith('"') && value.endsWith('"')) {
    return decodeXstring(value.slice(1, -1).replaceAll('""', '"'));
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function parseConditionalFormats(
  root: XmlElement,
  styles: ParsedStyles,
  sheet: string,
  context: XlsxCodecContext,
): ConditionalFormatRule[] {
  const parsed: { priority: number; order: number; rule: ConditionalFormatRule }[] = [];
  let source_order = 0;
  const dropped = (message: string): void =>
    emitWarning(context, { code: "format-loss", message, sheet });
  for (const collection of xmlChildren(root, "conditionalFormatting")) {
    const ranges = (xmlAttribute(collection, "sqref") ?? "").trim().split(/\s+/).filter(Boolean);
    for (const element of xmlChildren(collection, "cfRule")) {
      const order = source_order++;
      const type = xmlAttribute(element, "type") ?? "(missing)";
      if (type === "colorScale" || type === "dataBar" || type === "iconSet") {
        dropped(`Excel conditional-format rule type ${type} is unsupported and was dropped`);
        continue;
      }
      const raw_priority = xmlAttribute(element, "priority");
      const priority = raw_priority === undefined ? Number.MAX_SAFE_INTEGER : Number(raw_priority);
      if (!Number.isSafeInteger(priority) || priority < 0) {
        dropped("Excel conditional-format rule has an invalid priority and was dropped");
        continue;
      }
      const operator = xmlAttribute(element, "operator");
      const raw_formula = xmlChild(element, "formula")?.text;
      const formula = raw_formula === undefined ? undefined : decodeXstring(raw_formula.trim());
      let when: ConditionalFormatPredicate | undefined;
      if (type === "cellIs") {
        const value = conditional_scalar(formula);
        if (value !== undefined) {
          when =
            operator === "greaterThan" && typeof value === "number"
              ? { kind: "greaterThan", value }
              : operator === "lessThan" && typeof value === "number"
                ? { kind: "lessThan", value }
                : operator === "equal"
                  ? { kind: "equal", value }
                  : undefined;
        }
      } else if (type === "containsBlanks") {
        when = { kind: "equal", value: null };
      } else if (type === "containsText") {
        const text = xmlAttribute(element, "text");
        if (text !== undefined) when = { kind: "contains", text: decodeXstring(text) };
      } else if (type === "expression" && formula) {
        const match = /^ISNUMBER\(FIND\("((?:[^"]|"")*)",[^)]+\)\)$/i.exec(formula);
        const text = match?.[1];
        when =
          text !== undefined
            ? {
                kind: "contains",
                text: decodeXstring(text.replaceAll('""', '"')),
                matchCase: true,
              }
            : { kind: "formula", source: formula.startsWith("=") ? formula : `=${formula}` };
      }
      if (!when || ranges.length === 0) {
        dropped(`Excel conditional-format rule type ${type} is unsupported and was dropped`);
        continue;
      }
      if (when.kind === "formula" && when.source.length > MAX_CONDITIONAL_FORMAT_FORMULA_LENGTH) {
        dropped(
          `Excel conditional-format formula exceeds ${MAX_CONDITIONAL_FORMAT_FORMULA_LENGTH} characters and was dropped`,
        );
        continue;
      }
      if (when.kind === "formula" && formulaContainsExternalReference(when.source)) {
        dropped("External-data conditional-format formula was dropped");
        continue;
      }
      const raw_dxf = xmlAttribute(element, "dxfId");
      const differential =
        raw_dxf !== undefined && /^\d+$/.test(raw_dxf)
          ? styles.differentialAt(Number(raw_dxf))
          : undefined;
      if (raw_dxf !== undefined && !differential) {
        dropped(
          `Excel conditional-format rule type ${type} has an invalid differential style and was dropped`,
        );
        continue;
      }
      const style: CellStyle = differential ?? {};
      for (const range_text of ranges) {
        const range = parseRange(range_text);
        parsed.push({
          priority,
          order,
          rule: {
            range: {
              sheet,
              start: { row: range.r0, col: range.c0 },
              end: { row: range.r1, col: range.c1 },
            },
            when: structuredClone(when),
            style: structuredClone(style),
            ...(xmlBoolean(xmlAttribute(element, "stopIfTrue")) ? { stopIfTrue: true } : {}),
          },
        });
      }
    }
  }
  parsed.sort((left, right) => left.priority - right.priority || left.order - right.order);
  if (parsed.length > MAX_CONDITIONAL_FORMAT_RULES) {
    dropped(
      `Excel conditional-format rule limit ${MAX_CONDITIONAL_FORMAT_RULES} was exceeded; later rules were dropped`,
    );
    parsed.length = MAX_CONDITIONAL_FORMAT_RULES;
  }
  return parsed.map((entry) => entry.rule);
}

export function xmlHasDescendant(element: XmlElement, localName: string): boolean {
  return element.children.some(
    (child) => xmlLocalName(child.name) === localName || xmlHasDescendant(child, localName),
  );
}
