import type { SheetSnapshot, WorkbookTableXmlElement } from "@sheetwrite/core";
import { cellA1, labelToCol } from "@sheetwrite/core";
import { formulaContainsExternalReference } from "@sheetwrite/core/external-links";

import { areaA1 } from "./cell-reference.js";
import { MAIN_NS } from "./format.js";
import { emitWarning, type XlsxCodecContext } from "./resources.js";
import { StylesRegistry } from "./styles.js";
import { encodeXstring, escapeXml, XmlBuffer } from "./xml.js";

export function appendTableRule(
  xml: XmlBuffer,
  rule: WorkbookTableXmlElement,
  styles: StylesRegistry,
): void {
  xml.append(`<${rule.name}`);
  for (const [name, value] of Object.entries(rule.attributes)) {
    xml.append(` ${name}="${escapeXml(value)}"`);
  }
  if (rule.differentialStyle) {
    xml.append(` dxfId="${styles.registerDifferential(rule.differentialStyle)}"`);
  }
  xml.append(">");
  xml.append(escapeXml(rule.text));
  for (const child of rule.children) appendTableRule(xml, child, styles);
  xml.append(`</${rule.name}>`);
}

type WrittenTable = NonNullable<SheetSnapshot["tables"]>[number];

/** A1 references such as `A2:C9` or `B2`; `$` markers are accepted. */
const A1_REFERENCE = /^\$?([A-Za-z]{1,3})\$?(\d+)(?::\$?([A-Za-z]{1,3})\$?(\d+))?$/u;

/** Whether every `ref` in a kept worksheet `sortState` lies inside the sheet. */
export function sortStateFits(rule: WorkbookTableXmlElement, rows: number, cols: number): boolean {
  const reference = rule.attributes.ref;
  if (reference !== undefined) {
    const match = A1_REFERENCE.exec(reference);
    if (!match) return false;

    const [, startCol = "", startRow, endCol = startCol, endRow = startRow] = match;
    const lastCol = Math.max(labelToCol(startCol.toUpperCase()), labelToCol(endCol.toUpperCase()));
    const lastRow = Math.max(Number(startRow), Number(endRow));
    if (lastCol >= cols || lastRow > rows) return false;
  }
  return rule.children.every((child) => sortStateFits(child, rows, cols));
}

/**
 * Re-anchor stored autofilter and sort references to the table's current
 * rectangle. Row and column edits move `table.range` but not these strings,
 * and Excel repairs a table whose filter or sort ref disagrees with its own.
 * Returns null when a column rule no longer falls inside the table.
 */
function anchoredTableRule(
  rule: WorkbookTableXmlElement,
  table: WrittenTable,
): WorkbookTableXmlElement | null {
  const c0 = table.range.start.col;
  const c1 = table.range.end.col;
  const firstData = table.range.start.row + (table.headerRow ? 1 : 0);
  const lastData = table.range.end.row - (table.totalsRow ? 1 : 0);
  const span = (left: number, right: number, top: number): string =>
    `${cellA1(top, left)}:${cellA1(lastData, right)}`;
  if (rule.name === "autoFilter") {
    const children: WorkbookTableXmlElement[] = [];
    for (const child of rule.children) {
      if (child.name === "filterColumn") {
        const colId = Number(child.attributes.colId);
        if (!Number.isSafeInteger(colId) || colId < 0 || colId > c1 - c0) return null;
        children.push(child);
        continue;
      }
      const anchored = anchoredTableRule(child, table);
      if (!anchored) return null;
      children.push(anchored);
    }
    return {
      ...rule,
      attributes: { ...rule.attributes, ref: span(c0, c1, table.range.start.row) },
      children,
    };
  }
  if (rule.name !== "sortState") return rule;
  if (lastData < firstData) return null;
  const children: WorkbookTableXmlElement[] = [];
  for (const condition of rule.children) {
    const match = /^\$?([A-Za-z]{1,3})\$?\d*(?::\$?([A-Za-z]{1,3})\$?\d*)?$/u.exec(
      condition.attributes.ref ?? "",
    );
    const left = match?.[1];
    if (!left) return null;
    const start = labelToCol(left.toUpperCase());
    const end = labelToCol((match[2] ?? left).toUpperCase());
    if (start < c0 || end > c1 || end < start) return null;
    children.push({
      ...condition,
      attributes: { ...condition.attributes, ref: span(start, end, firstData) },
    });
  }
  return { ...rule, attributes: { ...rule.attributes, ref: span(c0, c1, firstData) }, children };
}

function appendAnchoredTableRule(
  xml: XmlBuffer,
  rule: WorkbookTableXmlElement | undefined,
  table: WrittenTable,
  styles: StylesRegistry,
  warn: (message: string) => void,
): void {
  if (!rule) return;
  const anchored = anchoredTableRule(rule, table);
  if (anchored) appendTableRule(xml, anchored, styles);
  else
    warn(
      `Workbook table ${table.name} ${rule.name} no longer matches the table columns and was not emitted`,
    );
}

export function tableXml(
  table: NonNullable<SheetSnapshot["tables"]>[number],
  nativeId: number,
  sheetName: string,
  context: XlsxCodecContext,
  styles: StylesRegistry,
  queryTable: boolean,
): Uint8Array {
  const ref = areaA1(table.range);
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(
    `<table xmlns="${MAIN_NS}" id="${nativeId}" name="${escapeXml(encodeXstring(table.name))}" displayName="${escapeXml(encodeXstring(table.name))}" ref="${ref}"${queryTable ? ' tableType="queryTable"' : ""} headerRowCount="${table.headerRow ? 1 : 0}" totalsRowCount="${table.totalsRow ? 1 : 0}">`,
  );
  const warnRuleLoss = (message: string): void => {
    emitWarning(context, { code: "unsupported-feature", message, sheet: sheetName });
  };
  appendAnchoredTableRule(xml, table.autoFilter, table, styles, warnRuleLoss);
  appendAnchoredTableRule(xml, table.sortState, table, styles, warnRuleLoss);
  xml.append(`<tableColumns count="${table.columns.length}">`);
  for (const [index, column] of table.columns.entries()) {
    const externalTotals =
      column.totalsRowFormula !== undefined &&
      formulaContainsExternalReference(column.totalsRowFormula.text);
    xml.append(
      `<tableColumn id="${index + 1}"${queryTable ? ` queryTableFieldId="${index + 1}"` : ""} name="${escapeXml(encodeXstring(column.name))}"${column.totalsRowLabel !== undefined ? ` totalsRowLabel="${escapeXml(encodeXstring(column.totalsRowLabel))}"` : ""}${column.totalsRowFunction !== undefined && !externalTotals ? ` totalsRowFunction="${escapeXml(column.totalsRowFunction)}"` : ""}>`,
    );
    for (const formula of [column.calculatedColumnFormula, column.totalsRowFormula]) {
      if (!formula) continue;
      if (formulaContainsExternalReference(formula.text)) {
        emitWarning(context, {
          code: "external-formula",
          message: `External-data ${formula.name} on table ${table.name} was not emitted`,
          sheet: sheetName,
        });
      } else {
        appendTableRule(xml, formula, styles);
      }
    }
    xml.append("</tableColumn>");
  }
  xml.append("</tableColumns>");
  if (table.style?.name) {
    xml.append(
      `<tableStyleInfo name="${escapeXml(encodeXstring(table.style.name))}" showFirstColumn="${table.style.showFirstColumn ? 1 : 0}" showLastColumn="${table.style.showLastColumn ? 1 : 0}" showRowStripes="${table.style.showRowStripes ? 1 : 0}" showColumnStripes="${table.style.showColumnStripes ? 1 : 0}"/>`,
    );
  } else if (table.style) {
    emitWarning(context, {
      code: "format-loss",
      message: `Workbook table ${table.name} style flags require a named Excel table style and remain only in Sheetwrite metadata`,
      sheet: sheetName,
    });
  }
  for (const feature of table.unsupportedFeatures ?? []) {
    emitWarning(context, {
      code: "unsupported-feature",
      message: `Workbook table ${table.name} declares unsupported feature ${feature}; it remains in Sheetwrite metadata and was not emitted`,
      sheet: sheetName,
    });
  }
  xml.append("</table>");
  return xml.finish();
}
