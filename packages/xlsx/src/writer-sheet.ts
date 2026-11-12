import type {
  ConditionalFormatRule,
  DataValidationRule,
  SheetSnapshot,
  WorkbookSnapshot,
} from "@sheetwrite/core";
import { cellA1, rangeA1 } from "@sheetwrite/core";

import { areaA1 } from "./cell-reference.js";
import {
  chartDrawingParts,
  freePartName,
  type PivotChartData,
  writeCharts,
} from "./chart-write.js";
import { DRAWING_REL } from "./chart-xml.js";
import { columnWidthCharacters, MAIN_NS, RELATIONSHIPS_NS } from "./format.js";
import { type ContentTypeOverride, relationshipsXml } from "./opc.js";
import { QUERY_TABLE_REL, queryTableXml } from "./query-table.js";
import {
  assertResource,
  boundedErrorText,
  checkAbort,
  emitWarning,
  type XlsxCodecContext,
} from "./resources.js";
import { StylesRegistry } from "./styles.js";
import { quotedSheet, cellXml, hyperlinkStyledRows } from "./writer-cells.js";
import { appendTableRule, sortStateFits, tableXml } from "./writer-tables.js";
import type { AbsoluteCell, WorkbookWriteHook, ExtraRelationship } from "./writer.js";
import { encodeXstring, escapeXml, XmlBuffer } from "./xml.js";
import { type ZipPart } from "./zip.js";

export interface SheetWriteResult {
  readonly relationships?: Uint8Array;
  readonly comments?: Uint8Array;
  readonly vml?: Uint8Array;
  readonly chartParts?: readonly ZipPart[];
  readonly chartOverrides?: readonly ContentTypeOverride[];
  readonly tables: {
    readonly part: string;
    readonly xml: Uint8Array;
    /** The table's queryTable part and its relationships, when a saved query fills it. */
    readonly queryTable?: {
      readonly part: string;
      readonly xml: Uint8Array;
      readonly rels: Uint8Array;
    };
  }[];
}

const COMMENTS_REL = `${RELATIONSHIPS_NS}/comments`;
const VML_REL = `${RELATIONSHIPS_NS}/vmlDrawing`;
const TABLE_REL = `${RELATIONSHIPS_NS}/table`;
const HYPERLINK_REL = `${RELATIONSHIPS_NS}/hyperlink`;

function commentsXml(sheet: SheetSnapshot, context: XlsxCodecContext): Uint8Array {
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(
    `<comments xmlns="${MAIN_NS}"><authors><author>Sheetwrite</author></authors><commentList>`,
  );
  for (const note of sheet.notes ?? []) {
    xml.append(
      `<comment ref="${cellA1(note.addr.row, note.addr.col)}" authorId="0"><text><r><t xml:space="preserve">`,
    );
    xml.appendText(note.text);
    xml.append("</t></r></text></comment>");
  }
  xml.append("</commentList></comments>");
  return xml.finish();
}

function commentsVml(sheet: SheetSnapshot, context: XlsxCodecContext): Uint8Array {
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8"?>');
  xml.append(
    '<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>',
  );
  for (const [index, note] of (sheet.notes ?? []).entries()) {
    xml.append(
      `<v:shape id="_x0000_s${1025 + index}" type="#_x0000_t202" style="position:absolute;margin-left:80pt;margin-top:5pt;width:108pt;height:59.25pt;z-index:${index + 1};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto"><v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"/></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:AutoFill>False</x:AutoFill><x:Row>${note.addr.row}</x:Row><x:Column>${note.addr.col}</x:Column></x:ClientData></v:shape>`,
    );
  }
  xml.append("</xml>");
  return xml.finish();
}

function validationXml(
  rule: DataValidationRule,
  context: XlsxCodecContext,
  sheet: string,
): string | null {
  const condition = rule.condition;
  let type: string;
  let operator = "";
  let formulas: (string | number)[];
  if (condition.kind === "list" || condition.kind === "checkbox") {
    const values =
      condition.kind === "list"
        ? condition.values
        : [condition.checkedValue ?? true, condition.uncheckedValue ?? false];
    const textValues = values.map((value) =>
      value === null ? "" : typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value),
    );
    if (textValues.some((value) => /[,\r\n]/.test(value))) return null;
    const list = textValues.join(",").replaceAll('"', '""');
    if (Array.from(list).length + 2 > 255) return null;
    type = "list";
    formulas = [`"${list}"`];
  } else {
    type =
      condition.kind === "date"
        ? "date"
        : condition.kind === "textLength"
          ? "textLength"
          : condition.kind === "number" && condition.integer
            ? "whole"
            : "decimal";
    if (condition.comparison) {
      operator = condition.comparison.operator;
      formulas =
        "value" in condition.comparison
          ? [condition.comparison.value]
          : [condition.comparison.min, condition.comparison.max];
    } else {
      formulas = [condition.min, condition.max].filter(
        (value): value is number => value !== undefined,
      );
      if (formulas.length === 0) return null;
      operator =
        condition.min !== undefined && condition.max !== undefined
          ? condition.min === condition.max
            ? "equal"
            : "between"
          : condition.min !== undefined
            ? "greaterThanOrEqual"
            : "lessThanOrEqual";
      if (operator === "equal" && condition.min !== undefined) formulas = [condition.min];
    }
  }
  let helpText = rule.helpText;
  if (helpText && Array.from(helpText).length > 255) {
    emitWarning(context, {
      code: "validation-loss",
      message: `Validation rule "${rule.id}" prompt/error exceeded 255 characters and was omitted from native XLSX`,
      sheet,
    });
    helpText = undefined;
  }
  const attributes = [
    `type="${type}"`,
    ...(operator ? [`operator="${operator}"`] : []),
    `sqref="${areaA1(rule.range)}"`,
    `allowBlank="${rule.allowBlank === false ? 0 : 1}"`,
    `showInputMessage="${helpText ? 1 : 0}"`,
    `showErrorMessage="${rule.policy === "allow" ? 0 : 1}"`,
    ...(rule.policy !== "allow"
      ? [`errorStyle="${rule.policy === "reject" ? "stop" : "warning"}"`]
      : []),
    ...(helpText
      ? [
          `prompt="${escapeXml(encodeXstring(helpText))}"`,
          `error="${escapeXml(encodeXstring(helpText))}"`,
        ]
      : []),
  ].join(" ");
  return `<dataValidation ${attributes}>${formulas.map((formula, index) => `<formula${index + 1}>${escapeXml(encodeXstring(String(formula)))}</formula${index + 1}>`).join("")}</dataValidation>`;
}

function conditionalScalar(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string") return `"${encodeXstring(value).replaceAll('"', '""')}"`;
  return null;
}

function conditionalFormatXml(
  rule: ConditionalFormatRule,
  dxfId: number,
  priority: number,
): string | null {
  const startCol = Math.min(rule.range.start.col, rule.range.end.col);
  const startRow = Math.min(rule.range.start.row, rule.range.end.row);
  const range = areaA1(rule.range);
  const stopIfTrue = rule.stopIfTrue ? ' stopIfTrue="1"' : "";
  if (rule.when.kind === "formula") {
    const source = rule.when.source.startsWith("=") ? rule.when.source.slice(1) : rule.when.source;
    return `<conditionalFormatting sqref="${range}"><cfRule type="expression" dxfId="${dxfId}" priority="${priority}"${stopIfTrue}><formula>${escapeXml(encodeXstring(source))}</formula></cfRule></conditionalFormatting>`;
  }
  if (rule.when.kind === "contains") {
    const text = rule.when.text;
    const formulaText = text.replaceAll('"', '""');
    const anchor = cellA1(startRow, startCol);
    if (rule.when.matchCase) {
      return `<conditionalFormatting sqref="${range}"><cfRule type="expression" dxfId="${dxfId}" priority="${priority}"${stopIfTrue}><formula>ISNUMBER(FIND("${escapeXml(encodeXstring(formulaText))}",${anchor}))</formula></cfRule></conditionalFormatting>`;
    }
    return `<conditionalFormatting sqref="${range}"><cfRule type="containsText" dxfId="${dxfId}" priority="${priority}"${stopIfTrue} operator="containsText" text="${escapeXml(encodeXstring(text))}"><formula>NOT(ISERROR(SEARCH("${escapeXml(encodeXstring(formulaText))}",${anchor})))</formula></cfRule></conditionalFormatting>`;
  }
  if (rule.when.kind === "equal" && rule.when.value === null) {
    const anchor = cellA1(startRow, startCol);
    return `<conditionalFormatting sqref="${range}"><cfRule type="containsBlanks" dxfId="${dxfId}" priority="${priority}"${stopIfTrue}><formula>LEN(TRIM(${anchor}))=0</formula></cfRule></conditionalFormatting>`;
  }
  const formula = conditionalScalar(rule.when.value);
  if (formula === null) return null;
  const operator =
    rule.when.kind === "greaterThan"
      ? "greaterThan"
      : rule.when.kind === "lessThan"
        ? "lessThan"
        : "equal";
  return `<conditionalFormatting sqref="${range}"><cfRule type="cellIs" dxfId="${dxfId}" priority="${priority}"${stopIfTrue} operator="${operator}"><formula>${escapeXml(formula)}</formula></cfRule></conditionalFormatting>`;
}

function indexSheetRows(sheet: SheetSnapshot) {
  const byRow = new Map<number, AbsoluteCell[]>();
  for (const block of sheet.cells) {
    for (const source of block.cells) {
      const row = block.startRow + source.rowOffset;
      const col = block.startCol + source.colOffset;
      if (row < 0 || row >= sheet.rowCount || col < 0 || col >= sheet.columns.length) continue;
      const rowCells = byRow.get(row) ?? [];
      rowCells.push({ row, col, source });
      byRow.set(row, rowCells);
    }
  }
  return byRow;
}

interface WorksheetOutlines {
  readonly outlineLevels: ReadonlyMap<number, number>;
  readonly collapsedOutlineRows: ReadonlySet<number>;
  readonly collapsedSummaries: ReadonlySet<number>;
}

function sheetOutlines(sheet: SheetSnapshot, context: XlsxCodecContext): WorksheetOutlines {
  const outlineLevels = new Map<number, number>();
  const collapsedOutlineRows = new Set<number>();
  const collapsedSummaries = new Set<number>();
  const outlineSpan = (sheet.rowGroups ?? []).reduce(
    (total, group) => total + (group.end - group.start + 1),
    0,
  );
  assertResource(context, "maxEntryUncompressedBytes", outlineSpan * 24);
  for (const group of sheet.rowGroups ?? []) {
    for (let row = group.start; row <= group.end; row++) {
      outlineLevels.set(row, Math.min(7, (outlineLevels.get(row) ?? 0) + 1));
      if (group.collapsed) collapsedOutlineRows.add(row);
    }
    if (group.collapsed && group.end + 1 < sheet.rowCount) {
      collapsedSummaries.add(group.end + 1);
    }
  }
  return { outlineLevels, collapsedOutlineRows, collapsedSummaries };
}

function appendSheetHeader(xml: XmlBuffer, sheet: SheetSnapshot, styles: StylesRegistry): void {
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(`<worksheet xmlns="${MAIN_NS}" xmlns:r="${RELATIONSHIPS_NS}">`);
  if (sheet.rowGroups?.length) xml.append('<sheetPr><outlinePr summaryBelow="1"/></sheetPr>');
  const maxRow = Math.max(1, sheet.rowCount);
  const maxCol = Math.max(0, sheet.columns.length - 1);
  xml.append(`<dimension ref="A1:${cellA1(maxRow - 1, maxCol)}"/>`);
  xml.append('<sheetViews><sheetView workbookViewId="0">');
  if ((sheet.frozenRows ?? 0) > 0 || (sheet.frozenCols ?? 0) > 0) {
    const topLeft = cellA1(sheet.frozenRows ?? 0, sheet.frozenCols ?? 0);
    const activePane =
      sheet.frozenRows && sheet.frozenCols
        ? "bottomRight"
        : sheet.frozenRows
          ? "bottomLeft"
          : "topRight";
    xml.append(
      `<pane${sheet.frozenCols ? ` xSplit="${sheet.frozenCols}"` : ""}${sheet.frozenRows ? ` ySplit="${sheet.frozenRows}"` : ""} topLeftCell="${topLeft}" activePane="${activePane}" state="frozen"/>`,
    );
  }
  xml.append('</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>');
  if (sheet.columns.length > 0) {
    xml.append("<cols>");
    for (const [index, column] of sheet.columns.entries()) {
      // The stored character width includes OOXML's five-pixel padding.
      const width = columnWidthCharacters(column.width);
      const styleId = styles.register(
        column.cellStyle,
        column.cellStyle?.numberFormat ?? column.numberFormat,
      );
      xml.append(
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"${column.visible === false ? ' hidden="1"' : ""}${styleId ? ` style="${styleId}"` : ""}/>`,
      );
    }
    xml.append("</cols>");
  }
}

function* writeSheetRows(
  xml: XmlBuffer,
  snapshot: WorkbookSnapshot,
  sheet: SheetSnapshot,
  styles: StylesRegistry,
  context: XlsxCodecContext,
  rows: ReadonlySet<number>,
  byRow: ReadonlyMap<number, AbsoluteCell[]>,
  rowMetadata: ReadonlyMap<number, NonNullable<SheetSnapshot["rowMeta"]>[number][1]>,
  outlines: WorksheetOutlines,
  hook: WorkbookWriteHook | undefined,
): Generator<Uint8Array> {
  const { collapsedOutlineRows, outlineLevels, collapsedSummaries } = outlines;
  xml.append("<sheetData>");
  let processed = 0;
  const sourceRows =
    hook?.cellRows?.(sheet) ??
    [...rows]
      .sort((left, right) => left - right)
      .map((row) => ({
        row,
        cells: (byRow.get(row) ?? []).sort((left, right) => left.col - right.col),
      }));
  const styledRows = sheet.hyperlinks?.length ? hyperlinkStyledRows(sheet, sourceRows) : sourceRows;
  for (const { row, cells } of styledRows) {
    const meta = rowMetadata.get(row);
    const hidden = meta?.hidden || collapsedOutlineRows.has(row);
    const outlineLevel = outlineLevels.get(row);
    xml.append(
      `<row r="${row + 1}"${meta?.height !== undefined ? ` ht="${(meta.height * 72) / 96}" customHeight="1"` : ""}${hidden ? ' hidden="1"' : ""}${outlineLevel ? ` outlineLevel="${outlineLevel}"` : ""}${collapsedSummaries.has(row) ? ' collapsed="1"' : ""}>`,
    );
    for (const cell of cells) {
      processed += 1;
      if ((processed & 4_095) === 0) checkAbort(context);
      xml.append(cellXml(snapshot, sheet, cell, styles, context));
      const chunk = xml.drain();
      if (chunk) yield* chunk;
    }
    xml.append("</row>");
    const chunk = xml.drain();
    if (chunk) yield* chunk;
  }
  xml.append("</sheetData>");
}

function appendSheetFormats(
  xml: XmlBuffer,
  sheet: SheetSnapshot,
  styles: StylesRegistry,
  context: XlsxCodecContext,
): void {
  const maxRow = Math.max(1, sheet.rowCount);
  const maxCol = Math.max(0, sheet.columns.length - 1);
  if (sheet.sortKeys?.length && sheet.rowCount > 0) {
    const reference = `A1:${cellA1(maxRow - 1, maxCol)}`;
    xml.append(`<sortState ref="${reference}">`);
    for (const key of sheet.sortKeys) {
      xml.append(
        `<sortCondition ref="${cellA1(0, key.col)}:${cellA1(maxRow - 1, key.col)}"${key.ascending ? "" : ' descending="1"'}/>`,
      );
    }
    xml.append("</sortState>");
  } else if (sheet.sortState) {
    if (sortStateFits(sheet.sortState, sheet.rowCount, sheet.columns.length)) {
      appendTableRule(xml, sheet.sortState, styles);
    } else {
      emitWarning(context, {
        code: "unsupported-feature",
        message:
          "The imported worksheet sortState refers to cells outside the sheet and was dropped",
        sheet: sheet.name,
      });
    }
  }
  if (sheet.merges?.length) {
    xml.append(`<mergeCells count="${sheet.merges.length}">`);
    for (const merge of sheet.merges) {
      xml.append(`<mergeCell ref="${cellA1(merge.r0, merge.c0)}:${cellA1(merge.r1, merge.c1)}"/>`);
    }
    xml.append("</mergeCells>");
  }
  if (sheet.conditionalFormats?.length) {
    for (const [index, rule] of sheet.conditionalFormats.entries()) {
      const encoded = conditionalFormatXml(
        rule,
        styles.registerDifferential(rule.style),
        index + 1,
      );
      if (encoded) xml.append(encoded);
      else
        emitWarning(context, {
          code: "format-loss",
          message:
            "Case-sensitive contains conditional formatting has no equivalent SpreadsheetML rule and remains in Sheetwrite metadata",
          sheet: sheet.name,
        });
    }
  }
  if (sheet.validationRules?.length) {
    const validations: string[] = [];
    for (const rule of sheet.validationRules) {
      const encoded = validationXml(rule, context, sheet.name);
      if (encoded) validations.push(encoded);
      else
        emitWarning(context, {
          code: "validation-loss",
          message: `Validation rule "${rule.id}" is preserved in Sheetwrite metadata but cannot be encoded as an unambiguous 255-character inline validation`,
          sheet: sheet.name,
        });
    }
    if (validations.length > 0)
      xml.append(
        `<dataValidations count="${validations.length}">${validations.join("")}</dataValidations>`,
      );
  }
  if (sheet.protectedRanges?.length) {
    emitWarning(context, {
      code: "unsupported-feature",
      message:
        "Host-resolved protected ranges are authorization callbacks, while Excel locked cells are static editing hints; emitting sheetProtection would falsely deny or grant access, so ranges remain in Sheetwrite metadata",
      sheet: sheet.name,
    });
  }
  if (sheet.filters?.length) {
    emitWarning(context, {
      code: "unsupported-feature",
      message:
        "Excel autoFilter always excludes a header row, but Sheetwrite filters every data row; native emission would change which row is filtered, so filters remain in Sheetwrite metadata",
      sheet: sheet.name,
    });
  }
}

function appendSheetRelationships(
  xml: XmlBuffer,
  snapshot: WorkbookSnapshot,
  sheet: SheetSnapshot,
  styles: StylesRegistry,
  context: XlsxCodecContext,
  sheetNumber: number,
  tableStartId: number,
  hook: WorkbookWriteHook | undefined,
  pivotRelationships: readonly ExtraRelationship[],
  pivotCharts: ReadonlyMap<string, PivotChartData> | undefined,
): SheetWriteResult {
  let comments: Uint8Array | undefined;
  let vml: Uint8Array | undefined;
  const relationshipEntries: {
    id: string;
    type: string;
    target: string;
    external?: boolean;
  }[] = [];
  let nextRelationshipId = 1;
  let legacyDrawingId: string | undefined;
  if (sheet.notes?.length) {
    const commentsId = `rId${nextRelationshipId++}`;
    legacyDrawingId = `rId${nextRelationshipId++}`;
    relationshipEntries.push(
      { id: commentsId, type: COMMENTS_REL, target: `../comments${sheetNumber}.xml` },
      {
        id: legacyDrawingId,
        type: VML_REL,
        target: `../drawings/vmlDrawing${sheetNumber}.vml`,
      },
    );
    comments = commentsXml(sheet, context);
    vml = commentsVml(sheet, context);
  }
  const hyperlinkElements: string[] = [];
  for (const hyperlink of sheet.hyperlinks ?? []) {
    const source = rangeA1(hyperlink.range.start, hyperlink.range.end);
    const display =
      hyperlink.display === undefined
        ? ""
        : ` display="${escapeXml(encodeXstring(hyperlink.display))}"`;
    if (hyperlink.target.kind === "external") {
      const relationshipId = `rId${nextRelationshipId++}`;
      relationshipEntries.push({
        id: relationshipId,
        type: HYPERLINK_REL,
        target: hyperlink.target.url,
        external: true,
      });
      hyperlinkElements.push(`<hyperlink ref="${source}" r:id="${relationshipId}"${display}/>`);
      continue;
    }
    const internalTarget = hyperlink.target;
    const targetSheet = snapshot.sheets.find(
      (candidate) => candidate.id === internalTarget.range.sheet,
    );
    if (!targetSheet) {
      throw new TypeError(
        boundedErrorText(
          `Sheetwrite: hyperlink ${hyperlink.id} references missing sheet ${internalTarget.range.sheet}`,
        ),
      );
    }
    const location = `${quotedSheet(targetSheet.name)}!${rangeA1(internalTarget.range.start, internalTarget.range.end)}`;
    hyperlinkElements.push(
      `<hyperlink ref="${source}" location="${escapeXml(encodeXstring(location))}"${display}/>`,
    );
  }
  if (hyperlinkElements.length > 0) {
    xml.append(`<hyperlinks>${hyperlinkElements.join("")}</hyperlinks>`);
  }
  const sheetHook = hook?.sheet?.(sheet, {
    sheetNumber,
    name: `xl/worksheets/sheet${sheetNumber}.xml`,
  });
  const extraIds = (sheetHook?.relationships ?? []).map((relationship) => {
    const id = `rId${nextRelationshipId++}`;
    relationshipEntries.push({ ...relationship, id });
    return id;
  });
  // Pivot tables have no worksheet element; Excel finds them through relationships.
  for (const relationship of pivotRelationships) {
    relationshipEntries.push({ ...relationship, id: `rId${nextRelationshipId++}` });
  }
  // Kept parts may use any name, including the ones generated for charts here.
  const keptParts = new Set(
    sheet.charts?.length
      ? (hook?.contentTypeOverrides ?? []).map((override) => override.part.toLowerCase())
      : [],
  );
  const charts = writeCharts(snapshot, sheet, sheetNumber, keptParts, context, pivotCharts);
  const chartParts: ZipPart[] = charts?.parts ?? [];
  const chartOverrides: ContentTypeOverride[] = charts?.overrides ?? [];
  if (charts && !hook?.appendCharts?.(sheet, charts.charts)) {
    const drawingPart = freePartName(`xl/drawings/sheetwrite-drawing${sheetNumber}`, keptParts);
    const drawing = chartDrawingParts(drawingPart, charts.charts, context);
    chartParts.push(...drawing.parts);
    chartOverrides.push(drawing.override);
    const id = `rId${nextRelationshipId++}`;
    relationshipEntries.push({ id, type: DRAWING_REL, target: `/${drawingPart}` });
    // CT_Worksheet places `<drawing>` after `<hyperlinks>` and before `<legacyDrawing>`.
    xml.append(`<drawing r:id="${id}"/>`);
  }
  xml.append(sheetHook?.beforeLegacyDrawing?.(extraIds) ?? "");
  if (legacyDrawingId) xml.append(`<legacyDrawing r:id="${legacyDrawingId}"/>`);
  nextRelationshipId = Math.max(nextRelationshipId, 3);
  const tableRelationshipIds: string[] = [];
  const tables = (sheet.tables ?? []).map((table, index) => {
    const nativeId = tableStartId + index;
    const relationshipId = `rId${nextRelationshipId++}`;
    tableRelationshipIds.push(relationshipId);
    relationshipEntries.push({
      id: relationshipId,
      type: TABLE_REL,
      target: `../tables/table${nativeId}.xml`,
    });
    const binding = hook?.queryTable?.(table);
    return {
      part: `xl/tables/table${nativeId}.xml`,
      xml: tableXml(table, nativeId, sheet.name, context, styles, binding !== undefined),
      ...(binding
        ? {
            queryTable: {
              part: `xl/queryTables/queryTable${nativeId}.xml`,
              xml: queryTableXml(table, nativeId, binding),
              rels: relationshipsXml(
                [
                  {
                    id: "rId1",
                    type: QUERY_TABLE_REL,
                    target: `../queryTables/queryTable${nativeId}.xml`,
                  },
                ],
                context,
              ),
            },
          }
        : {}),
    };
  });
  if (tables.length > 0) {
    xml.append(`<tableParts count="${tables.length}">`);
    for (const relationshipId of tableRelationshipIds) {
      xml.append(`<tablePart r:id="${relationshipId}"/>`);
    }
    xml.append("</tableParts>");
  }
  const relationships =
    relationshipEntries.length > 0 ? relationshipsXml(relationshipEntries, context) : undefined;
  return { relationships, comments, vml, tables, chartParts, chartOverrides };
}

export function* writeSheet(
  snapshot: WorkbookSnapshot,
  sheet: SheetSnapshot,
  styles: StylesRegistry,
  context: XlsxCodecContext,
  sheetNumber: number,
  tableStartId: number,
  hook?: WorkbookWriteHook,
  pivotRelationships: readonly ExtraRelationship[] = [],
  pivotCharts?: ReadonlyMap<string, PivotChartData>,
): Generator<Uint8Array, SheetWriteResult> {
  const byRow = indexSheetRows(sheet);
  const rowMetadata = new Map(sheet.rowMeta ?? []);

  const outlines = sheetOutlines(sheet, context);
  const rows = new Set([
    ...byRow.keys(),
    ...rowMetadata.keys(),
    ...outlines.outlineLevels.keys(),
    ...outlines.collapsedSummaries,
  ]);

  const xml = new XmlBuffer(context);
  appendSheetHeader(xml, sheet, styles);

  yield* writeSheetRows(
    xml,
    snapshot,
    sheet,
    styles,
    context,
    rows,
    byRow,
    rowMetadata,
    outlines,
    hook,
  );

  appendSheetFormats(xml, sheet, styles, context);

  const result = appendSheetRelationships(
    xml,
    snapshot,
    sheet,
    styles,
    context,
    sheetNumber,
    tableStartId,
    hook,
    pivotRelationships,
    pivotCharts,
  );
  xml.append("</worksheet>");
  const chunk = xml.drain(true);
  if (chunk) yield* chunk;
  return result;
}
