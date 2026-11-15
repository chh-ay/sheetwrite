import type {
  CellScalar,
  CellStyle,
  ConditionalFormatPredicate,
  ConditionalFormatRule,
  DataValidationComparison,
  DataValidationCondition,
  DataValidationRule,
} from "@sheetwrite/core";
import {
  MAX_CONDITIONAL_FORMAT_FORMULA_LENGTH,
  MAX_CONDITIONAL_FORMAT_RULES,
} from "@sheetwrite/core";
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
  let condition: DataValidationCondition | undefined;
  if (type === "list" && formula1?.startsWith('"') && formula1.endsWith('"')) {
    const body = formula1.slice(1, -1);
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
    condition = { kind: "list", values };
  } else if (type === "decimal" || type === "whole" || type === "date" || type === "textLength") {
    let first = formula1 === undefined ? undefined : Number(formula1);
    let second = formula2 === undefined ? undefined : Number(formula2);
    if (
      (first !== undefined && !Number.isFinite(first)) ||
      (second !== undefined && !Number.isFinite(second))
    ) {
      emitWarning(context, {
        code: "validation-loss",
        message: "Formula-based Excel validation was dropped",
        sheet,
      });
      return [];
    }
    if (type === "date" && date1904) {
      if (first !== undefined) first += 1462;
      if (second !== undefined) second += 1462;
    }
    const operator = xmlAttribute(element, "operator") ?? "between";
    const bounds: { min?: number; max?: number } = {};
    let comparison: DataValidationComparison | undefined;
    if (operator === "between" && first !== undefined && second !== undefined && first <= second) {
      bounds.min = first;
      bounds.max = second;
    } else if (
      operator === "notBetween" &&
      first !== undefined &&
      second !== undefined &&
      first <= second
    ) {
      comparison = { operator, min: first, max: second };
    } else if (operator === "equal" && first !== undefined) {
      bounds.min = first;
      bounds.max = first;
    } else if (operator === "greaterThanOrEqual" && first !== undefined) {
      bounds.min = first;
    } else if (operator === "lessThanOrEqual" && first !== undefined) {
      bounds.max = first;
    } else if (
      (operator === "notEqual" || operator === "greaterThan" || operator === "lessThan") &&
      first !== undefined
    ) {
      comparison = { operator, value: first };
    } else {
      emitWarning(context, {
        code: "validation-loss",
        message: `Excel validation operator ${operator} could not be represented without broadening and was dropped`,
        sheet,
      });
      return [];
    }
    const textLengthOperandValid =
      comparison === undefined
        ? (bounds.min === undefined || (Number.isSafeInteger(bounds.min) && bounds.min >= 0)) &&
          (bounds.max === undefined || (Number.isSafeInteger(bounds.max) && bounds.max >= 0))
        : "value" in comparison
          ? Number.isSafeInteger(comparison.value) && comparison.value >= 0
          : Number.isSafeInteger(comparison.min) &&
            comparison.min >= 0 &&
            Number.isSafeInteger(comparison.max) &&
            comparison.max >= 0;
    if (type === "textLength" && !textLengthOperandValid) {
      emitWarning(context, {
        code: "validation-loss",
        message: "Non-integer or negative text-length validation was dropped",
        sheet,
      });
      return [];
    }
    const comparisonFields = comparison === undefined ? bounds : { comparison };
    condition =
      type === "date"
        ? { kind: "date", ...comparisonFields }
        : type === "textLength"
          ? { kind: "textLength", ...comparisonFields }
          : {
              kind: "number",
              ...comparisonFields,
              ...(type === "whole" ? { integer: true } : {}),
            };
  }
  if (!condition || ranges.length === 0) {
    emitWarning(context, {
      code: "validation-loss",
      message: `Excel validation type ${type} was dropped`,
      sheet,
    });
    return [];
  }
  const showError = xmlBoolean(xmlAttribute(element, "showErrorMessage"));
  const errorStyle = xmlAttribute(element, "errorStyle") ?? "stop";
  const policy: DataValidationRule["policy"] = !showError
    ? "allow"
    : errorStyle === "stop"
      ? "reject"
      : "warn";
  const prompt = xmlAttribute(element, "prompt");
  const error = xmlAttribute(element, "error");
  let helpText = prompt ?? error;
  if (prompt !== undefined && error !== undefined && prompt !== error) {
    emitWarning(context, {
      code: "validation-loss",
      message: "Distinct Excel validation prompt and error text were reduced to the prompt",
      sheet,
    });
  }
  if (helpText && Array.from(helpText).length > 255) {
    emitWarning(context, {
      code: "validation-loss",
      message: "Excel validation prompt/error exceeded 255 characters and was dropped",
      sheet,
    });
    helpText = undefined;
  }
  return ranges.map((rangeText) => {
    const range = parseRange(rangeText);
    return {
      range: { start: { row: range.r0, col: range.c0 }, end: { row: range.r1, col: range.c1 } },
      condition: structuredClone(condition),
      policy,
      allowBlank: xmlBoolean(xmlAttribute(element, "allowBlank")),
      ...(helpText ? { helpText: decodeXstring(helpText) } : {}),
    };
  });
}

function conditionalScalar(formula: string | undefined): CellScalar | undefined {
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
  let sourceOrder = 0;
  const dropped = (message: string): void =>
    emitWarning(context, { code: "format-loss", message, sheet });
  for (const collection of xmlChildren(root, "conditionalFormatting")) {
    const ranges = (xmlAttribute(collection, "sqref") ?? "").trim().split(/\s+/).filter(Boolean);
    for (const element of xmlChildren(collection, "cfRule")) {
      const order = sourceOrder++;
      const type = xmlAttribute(element, "type") ?? "(missing)";
      if (type === "colorScale" || type === "dataBar" || type === "iconSet") {
        dropped(`Excel conditional-format rule type ${type} is unsupported and was dropped`);
        continue;
      }
      const rawPriority = xmlAttribute(element, "priority");
      const priority = rawPriority === undefined ? Number.MAX_SAFE_INTEGER : Number(rawPriority);
      if (!Number.isSafeInteger(priority) || priority < 0) {
        dropped("Excel conditional-format rule has an invalid priority and was dropped");
        continue;
      }
      const operator = xmlAttribute(element, "operator");
      const rawFormula = xmlChild(element, "formula")?.text;
      const formula = rawFormula === undefined ? undefined : decodeXstring(rawFormula.trim());
      let when: ConditionalFormatPredicate | undefined;
      if (type === "cellIs") {
        const value = conditionalScalar(formula);
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
      const rawDxf = xmlAttribute(element, "dxfId");
      const differential =
        rawDxf !== undefined && /^\d+$/.test(rawDxf)
          ? styles.differentialAt(Number(rawDxf))
          : undefined;
      if (rawDxf !== undefined && !differential) {
        dropped(
          `Excel conditional-format rule type ${type} has an invalid differential style and was dropped`,
        );
        continue;
      }
      const style: CellStyle = differential ?? {};
      for (const rangeText of ranges) {
        const range = parseRange(rangeText);
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
