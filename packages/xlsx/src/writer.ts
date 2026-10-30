import type {
  CellStyle,
  ConditionalFormatRule,
  DataValidationRule,
  SheetSnapshot,
  SnapshotCell,
  WorkbookSnapshot,
  WorkbookTableXmlElement,
} from "@sheetwrite/core";
import {
  colToA1,
  DEFAULT_MAX_CHANGE,
  DEFAULT_MAX_ITERATIONS,
  labelToCol,
  rangeA1,
  sheetNameKey,
  validateSheetName,
} from "@sheetwrite/core";

import { formulaContainsExternalReference, spillReferencesToXlsx } from "./formula.js";
import { type ContentTypeOverride, contentTypesXml, relationshipsXml } from "./opc.js";
import { preparePivots } from "./pivot.js";
import {
  assertResource,
  checkAbort,
  emitWarning,
  validateCodecSnapshot,
  type XlsxCodecContext,
} from "./resources.js";
import { StylesRegistry } from "./styles.js";
import { encodeXstring, escapeXml, XmlBuffer } from "./xml.js";
import { writeZip, zipChunks, type ZipPart } from "./zip.js";

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const OFFICE_DOCUMENT_REL = `${REL_NS}/officeDocument`;
const WORKSHEET_REL = `${REL_NS}/worksheet`;
const STYLES_REL = `${REL_NS}/styles`;
const COMMENTS_REL = `${REL_NS}/comments`;
const VML_REL = `${REL_NS}/vmlDrawing`;
const TABLE_REL = `${REL_NS}/table`;
const HYPERLINK_REL = `${REL_NS}/hyperlink`;
const WORKBOOK_CONTENT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
const WORKSHEET_CONTENT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const STYLES_CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml";
const COMMENTS_CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml";
const VML_CONTENT = "application/vnd.openxmlformats-officedocument.vmlDrawing";
const TABLE_CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml";
const META_MARKER = "sheetwrite-workbook-metadata-v1";
const META_STEM = "__sheetwrite_meta__";
const META_CHUNK = 30_000;

export interface AbsoluteCell {
  readonly row: number;
  readonly col: number;
  readonly source: SnapshotCell;
}

interface SheetWriteResult {
  readonly relationships?: Uint8Array;
  readonly comments?: Uint8Array;
  readonly vml?: Uint8Array;
  readonly tables: {
    readonly part: string;
    readonly xml: Uint8Array;
  }[];
}

type ExtraRelationship = {
  readonly type: string;
  readonly target: string;
  readonly external?: boolean;
};

export type WorkbookWriteHookResolver = (
  validated: WorkbookSnapshot,
) => WorkbookWriteHook | undefined;

export interface WorkbookWriteHook {
  readonly rootRelationships?: readonly ExtraRelationship[];
  readonly workbookRelationships?: readonly ExtraRelationship[];
  readonly contentTypeOverrides?: readonly ContentTypeOverride[];
  readonly contentTypeDefaults?: readonly { extension: string; contentType: string }[];
  /** `<pivotCache>` elements for `workbookRelationships`; the writer wraps them in `<pivotCaches>`. */
  workbookXml?(ids: readonly string[]): { pivotCaches?: readonly string[] };
  sheet?(
    sheet: SheetSnapshot,
    part: { sheetNumber: number; name: string },
  ):
    | {
        relationships?: readonly ExtraRelationship[];
        beforeLegacyDrawing?(ids: readonly string[]): string;
      }
    | undefined;
  /** Rows are sorted, unique, and consumed only once; used by store-backed table export. */
  cellRows?(sheet: SheetSnapshot): Iterable<{ row: number; cells: readonly AbsoluteCell[] }>;
  parts?(): Iterable<ZipPart>;
}

function quotedSheet(name: string): string {
  return `'${name.replaceAll("'", "''")}'`;
}

function formulaForReference(snapshot: WorkbookSnapshot, source: SnapshotCell["value"]): string {
  if (source.kind !== "ref") throw new TypeError("Sheetwrite: expected reference cell");
  const target = snapshot.sheets.find((sheet) => sheet.id === source.target.sheet);
  if (!target) return "#REF!";
  return `${quotedSheet(target.name)}!${colToA1(source.target.col)}${source.target.row + 1}`;
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value === null || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    output[key] = canonicalJsonValue((value as Record<string, unknown>)[key]);
  }
  return output;
}

function hasExactBorderWidth(style: CellStyle | undefined): boolean {
  return Object.values(style?.border ?? {}).some(
    (border) => border.width !== undefined && border.width !== 1 && border.width !== 2,
  );
}

/**
 * Workbook metadata for the hidden sheet. The saved output of a native pivot
 * is left out: the worksheet holds it as the pivot's rendered cells.
 */
function metadataSnapshot(
  snapshot: WorkbookSnapshot,
  nativePivots: ReadonlySet<string>,
): WorkbookSnapshot {
  const { xlsxSource: _source, ...workbook } = snapshot.workbook;
  return {
    ...snapshot,
    workbook,
    sheets: snapshot.sheets.map((sheet) => ({
      ...sheet,
      columns: sheet.columns.map((column) => ({ ...column })),
      ...(sheet.pivots
        ? {
            pivots: sheet.pivots.map((pivot) => {
              if (!pivot.savedOutput || !nativePivots.has(pivot.id)) return pivot;
              const { savedOutput: _saved, ...definition } = pivot;
              return definition;
            }),
          }
        : {}),
      cells: sheet.cells.flatMap((block) => {
        const preserved = block.cells
          .filter((cell) => cell.value.kind === "ref" || hasExactBorderWidth(cell.style))
          .map((cell) => ({
            rowOffset: cell.rowOffset,
            colOffset: cell.colOffset,
            value:
              cell.value.kind === "ref"
                ? structuredClone(cell.value)
                : ({ kind: "literal", value: null } as const),
            ...(hasExactBorderWidth(cell.style) ? { style: structuredClone(cell.style) } : {}),
          }));
        return preserved.length > 0 ? [{ ...block, cells: preserved }] : [];
      }),
    })),
  };
}

function metadataSheetName(snapshot: WorkbookSnapshot): string {
  const names = new Set(snapshot.sheets.map((sheet) => sheetNameKey(sheet.name)));
  let name = META_STEM;
  let suffix = 2;
  while (names.has(sheetNameKey(name))) {
    name = `${META_STEM.slice(0, 27)}_${suffix++}`;
  }
  return name;
}

function validateNames(snapshot: WorkbookSnapshot): void {
  const names: string[] = [];
  for (const sheet of snapshot.sheets) {
    const validated = validateSheetName(sheet.name, names);
    if (!validated.ok) {
      const prefix =
        validated.code === "duplicate"
          ? "duplicate case-insensitive XLSX sheet name"
          : "invalid XLSX sheet name";
      throw new RangeError(`Sheetwrite: ${prefix}: ${sheet.name} (${validated.code})`);
    }
    if (validated.name !== sheet.name) {
      throw new RangeError(`Sheetwrite: non-canonical NFC XLSX sheet name: ${sheet.name}`);
    }
    names.push(validated.name);
  }
  if (
    snapshot.sheets.every(
      (sheet) => sheet.visibility === "hidden" || sheet.visibility === "veryHidden",
    )
  ) {
    throw new RangeError("Sheetwrite: XLSX export requires at least one visible worksheet");
  }
}

function preflightSnapshot(snapshot: WorkbookSnapshot, context: XlsxCodecContext): void {
  assertResource(context, "maxSheets", snapshot.sheets.length);
  let cells = 0;
  let merges = 0;
  for (const sheet of snapshot.sheets) {
    assertResource(context, "maxRowsPerSheet", sheet.rowCount);
    assertResource(context, "maxColumnsPerSheet", sheet.columns.length);
    merges += sheet.merges?.length ?? 0;
    assertResource(context, "maxMerges", merges);
    for (const block of sheet.cells) {
      cells += block.cells.length;
      assertResource(context, "maxCells", cells);
    }
  }
}

function validationRange(rule: DataValidationRule): string {
  const row0 = Math.min(rule.range.start.row, rule.range.end.row);
  const row1 = Math.max(rule.range.start.row, rule.range.end.row);
  const col0 = Math.min(rule.range.start.col, rule.range.end.col);
  const col1 = Math.max(rule.range.start.col, rule.range.end.col);
  return `${colToA1(col0)}${row0 + 1}:${colToA1(col1)}${row1 + 1}`;
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
      if (operator === "equal") formulas = [condition.min!];
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
    `sqref="${validationRange(rule)}"`,
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
  const range = `${colToA1(startCol)}${startRow + 1}:${colToA1(Math.max(rule.range.start.col, rule.range.end.col))}${Math.max(rule.range.start.row, rule.range.end.row) + 1}`;
  const stopIfTrue = rule.stopIfTrue ? ' stopIfTrue="1"' : "";
  if (rule.when.kind === "formula") {
    const source = rule.when.source.startsWith("=") ? rule.when.source.slice(1) : rule.when.source;
    return `<conditionalFormatting sqref="${range}"><cfRule type="expression" dxfId="${dxfId}" priority="${priority}"${stopIfTrue}><formula>${escapeXml(encodeXstring(source))}</formula></cfRule></conditionalFormatting>`;
  }
  if (rule.when.kind === "contains") {
    const text = rule.when.text;
    const formulaText = text.replaceAll('"', '""');
    const anchor = `${colToA1(startCol)}${startRow + 1}`;
    if (rule.when.matchCase) {
      return `<conditionalFormatting sqref="${range}"><cfRule type="expression" dxfId="${dxfId}" priority="${priority}"${stopIfTrue}><formula>ISNUMBER(FIND("${escapeXml(encodeXstring(formulaText))}",${anchor}))</formula></cfRule></conditionalFormatting>`;
    }
    return `<conditionalFormatting sqref="${range}"><cfRule type="containsText" dxfId="${dxfId}" priority="${priority}"${stopIfTrue} operator="containsText" text="${escapeXml(encodeXstring(text))}"><formula>NOT(ISERROR(SEARCH("${escapeXml(encodeXstring(formulaText))}",${anchor})))</formula></cfRule></conditionalFormatting>`;
  }
  if (rule.when.kind === "equal" && rule.when.value === null) {
    const anchor = `${colToA1(startCol)}${startRow + 1}`;
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

function cellXml(
  snapshot: WorkbookSnapshot,
  sheet: SheetSnapshot,
  cell: AbsoluteCell,
  styles: StylesRegistry,
  context: XlsxCodecContext,
): string {
  const column = sheet.columns[cell.col]!;
  const mergedStyle: CellStyle = { ...column.cellStyle, ...cell.source.style };
  const styleId = styles.register(
    Object.keys(mergedStyle).length > 0 ? mergedStyle : undefined,
    mergedStyle.numberFormat ?? column.numberFormat,
  );
  const reference = `${colToA1(cell.col)}${cell.row + 1}`;
  const styleAttribute = styleId ? ` s="${styleId}"` : "";
  const value = cell.source.value;
  if (value.kind === "formula" || value.kind === "ref") {
    const formula =
      value.kind === "formula"
        ? value.src.startsWith("=")
          ? value.src.slice(1)
          : value.src
        : formulaForReference(snapshot, value);
    if (formulaContainsExternalReference(formula)) {
      emitWarning(context, {
        code: "external-formula",
        message: "External-data formula was neutralized as inert text on export",
        sheet: sheet.name,
        cell: reference,
      });
      return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(encodeXstring(`=${formula}`))}</t></is></c>`;
    }
    return `<c r="${reference}"${styleAttribute}><f>${escapeXml(encodeXstring(spillReferencesToXlsx(formula)))}</f></c>`;
  }
  if (value.value === null) return `<c r="${reference}"${styleAttribute}/>`;
  if (typeof value.value === "string") {
    return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(encodeXstring(value.value))}</t></is></c>`;
  }
  if (typeof value.value === "boolean") {
    return `<c r="${reference}"${styleAttribute} t="b"><v>${value.value ? 1 : 0}</v></c>`;
  }
  return `<c r="${reference}"${styleAttribute}><v>${value.value}</v></c>`;
}

function commentsXml(sheet: SheetSnapshot, context: XlsxCodecContext): Uint8Array {
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(
    `<comments xmlns="${MAIN_NS}"><authors><author>Sheetwrite</author></authors><commentList>`,
  );
  for (const note of sheet.notes ?? []) {
    xml.append(
      `<comment ref="${colToA1(note.addr.col)}${note.addr.row + 1}" authorId="0"><text><r><t xml:space="preserve">`,
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
  for (let index = 0; index < (sheet.notes?.length ?? 0); index++) {
    const note = sheet.notes![index]!;
    xml.append(
      `<v:shape id="_x0000_s${1025 + index}" type="#_x0000_t202" style="position:absolute;margin-left:80pt;margin-top:5pt;width:108pt;height:59.25pt;z-index:${index + 1};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto"><v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"/></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:AutoFill>False</x:AutoFill><x:Row>${note.addr.row}</x:Row><x:Column>${note.addr.col}</x:Column></x:ClientData></v:shape>`,
    );
  }
  xml.append("</xml>");
  return xml.finish();
}

function appendTableRule(
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
  const rows = (from: number): string => `${from + 1}`;
  const span = (left: number, right: number, top: number): string =>
    `${colToA1(left)}${rows(top)}:${colToA1(right)}${rows(lastData)}`;
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

function tableXml(
  table: NonNullable<SheetSnapshot["tables"]>[number],
  nativeId: number,
  sheetName: string,
  context: XlsxCodecContext,
  styles: StylesRegistry,
): Uint8Array {
  const ref = `${colToA1(table.range.start.col)}${table.range.start.row + 1}:${colToA1(table.range.end.col)}${table.range.end.row + 1}`;
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(
    `<table xmlns="${MAIN_NS}" id="${nativeId}" name="${escapeXml(encodeXstring(table.name))}" displayName="${escapeXml(encodeXstring(table.name))}" ref="${ref}" headerRowCount="${table.headerRow ? 1 : 0}" totalsRowCount="${table.totalsRow ? 1 : 0}">`,
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
      `<tableColumn id="${index + 1}" name="${escapeXml(encodeXstring(column.name))}"${column.totalsRowLabel !== undefined ? ` totalsRowLabel="${escapeXml(encodeXstring(column.totalsRowLabel))}"` : ""}${column.totalsRowFunction !== undefined && !externalTotals ? ` totalsRowFunction="${escapeXml(column.totalsRowFunction)}"` : ""}>`,
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

function hyperlinkRowStyles(
  sheet: SheetSnapshot,
): (row: number, cells: readonly AbsoluteCell[]) => readonly AbsoluteCell[] {
  const pending = (sheet.hyperlinks ?? [])
    .map((hyperlink, index) => ({
      hyperlink,
      index,
      style: hyperlink.style,
    }))
    .sort((left, right) => left.hyperlink.range.start.row - right.hyperlink.range.start.row);
  let next = 0;
  let active: typeof pending = [];
  return (row, cells) => {
    active = active.filter(({ hyperlink }) => hyperlink.range.end.row >= row);
    let added = false;
    while (next < pending.length) {
      const entry = pending[next];
      if (!entry || entry.hyperlink.range.start.row > row) break;
      next += 1;
      if (entry.hyperlink.range.end.row < row) continue;
      active.push(entry);
      added = true;
    }
    // Preserve the same last-link-wins overlay order as the workbook renderer.
    if (added) active.sort((left, right) => left.index - right.index);
    if (active.length === 0 || cells.length === 0) return cells;
    const overlays = new Map<number, AbsoluteCell>();
    for (const { hyperlink, style } of active) {
      let low = 0;
      let high = cells.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        const cell = cells[middle];
        if (cell && cell.col < hyperlink.range.start.col) low = middle + 1;
        else high = middle;
      }
      for (let index = low; index < cells.length; index++) {
        const cell = overlays.get(index) ?? cells[index];
        if (!cell || cell.col > hyperlink.range.end.col) break;
        overlays.set(index, {
          ...cell,
          source: {
            ...cell.source,
            style: {
              color: "#0563C1",
              underline: true,
              ...sheet.columns[cell.col]?.cellStyle,
              ...cell.source.style,
              ...style,
            },
          },
        });
      }
    }
    return overlays.size === 0 ? cells : cells.map((cell, index) => overlays.get(index) ?? cell);
  };
}

function* hyperlinkStyledRows(
  sheet: SheetSnapshot,
  rows: Iterable<{ row: number; cells: readonly AbsoluteCell[] }>,
): Generator<{ row: number; cells: readonly AbsoluteCell[] }> {
  const applyStyles = hyperlinkRowStyles(sheet);
  for (const { row, cells } of rows) yield { row, cells: applyStyles(row, cells) };
}

const MAXIMUM_DIGIT_WIDTH_PX = 7;
const COLUMN_WIDTH_FRACTIONS = 256;

function* writeSheet(
  snapshot: WorkbookSnapshot,
  sheet: SheetSnapshot,
  styles: StylesRegistry,
  context: XlsxCodecContext,
  sheetNumber: number,
  tableStartId: number,
  hook?: WorkbookWriteHook,
  pivotRelationships: readonly ExtraRelationship[] = [],
): Generator<Uint8Array, SheetWriteResult> {
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
  const rowMetadata = new Map(sheet.rowMeta ?? []);
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
  const rows = new Set([
    ...byRow.keys(),
    ...rowMetadata.keys(),
    ...outlineLevels.keys(),
    ...collapsedSummaries,
  ]);
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(`<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">`);
  if (sheet.rowGroups?.length) xml.append('<sheetPr><outlinePr summaryBelow="1"/></sheetPr>');
  const maxRow = Math.max(1, sheet.rowCount);
  const maxCol = Math.max(0, sheet.columns.length - 1);
  xml.append(`<dimension ref="A1:${colToA1(maxCol)}${maxRow}"/>`);
  xml.append('<sheetViews><sheetView workbookViewId="0">');
  if ((sheet.frozenRows ?? 0) > 0 || (sheet.frozenCols ?? 0) > 0) {
    const topLeft = `${colToA1(sheet.frozenCols ?? 0)}${(sheet.frozenRows ?? 0) + 1}`;
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
    for (let index = 0; index < sheet.columns.length; index++) {
      const column = sheet.columns[index]!;
      // The stored character width includes OOXML's five-pixel padding.
      const width =
        Math.floor((column.width / MAXIMUM_DIGIT_WIDTH_PX) * COLUMN_WIDTH_FRACTIONS) /
        COLUMN_WIDTH_FRACTIONS;
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
  if (sheet.sortKeys?.length && sheet.rowCount > 0) {
    const reference = `A1:${colToA1(maxCol)}${maxRow}`;
    xml.append(`<sortState ref="${reference}">`);
    for (const key of sheet.sortKeys) {
      xml.append(
        `<sortCondition ref="${colToA1(key.col)}1:${colToA1(key.col)}${maxRow}"${key.ascending ? "" : ' descending="1"'}/>`,
      );
    }
    xml.append("</sortState>");
  }
  if (sheet.merges?.length) {
    xml.append(`<mergeCells count="${sheet.merges.length}">`);
    for (const merge of sheet.merges) {
      xml.append(
        `<mergeCell ref="${colToA1(merge.c0)}${merge.r0 + 1}:${colToA1(merge.c1)}${merge.r1 + 1}"/>`,
      );
    }
    xml.append("</mergeCells>");
  }
  if (sheet.conditionalFormats?.length) {
    for (let index = 0; index < sheet.conditionalFormats.length; index++) {
      const rule = sheet.conditionalFormats[index]!;
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
        `Sheetwrite: hyperlink ${hyperlink.id} references missing sheet ${internalTarget.range.sheet}`,
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
    return {
      part: `xl/tables/table${nativeId}.xml`,
      xml: tableXml(table, nativeId, sheet.name, context, styles),
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
  xml.append("</worksheet>");
  const chunk = xml.drain(true);
  if (chunk) yield* chunk;
  return { relationships, comments, vml, tables };
}

function metadataSheetXml(
  snapshot: WorkbookSnapshot,
  nativePivots: ReadonlySet<string>,
  context: XlsxCodecContext,
): Uint8Array {
  const json = JSON.stringify(canonicalJsonValue(metadataSnapshot(snapshot, nativePivots)));
  const chunks = [META_MARKER];
  let chunkParts: string[] = [];
  let chunkBytes = 0;
  for (const character of json) {
    const encoded = encodeXstring(character);
    const codePoint = character.codePointAt(0)!;
    const bytes =
      encoded.length !== character.length
        ? encoded.length
        : codePoint <= 0x7f
          ? 1
          : codePoint <= 0x7ff
            ? 2
            : codePoint <= 0xffff
              ? 3
              : 4;
    if (chunkBytes + bytes > META_CHUNK && chunkParts.length > 0) {
      chunks.push(chunkParts.join(""));
      chunkParts = [];
      chunkBytes = 0;
    }
    chunkParts.push(character);
    chunkBytes += bytes;
  }
  if (chunkParts.length > 0) chunks.push(chunkParts.join(""));
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(
    `<worksheet xmlns="${MAIN_NS}"><dimension ref="A1:A${chunks.length}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>`,
  );
  for (let index = 0; index < chunks.length; index++) {
    xml.append(
      `<row r="${index + 1}"><c r="A${index + 1}" t="inlineStr"><is><t xml:space="preserve">`,
    );
    xml.appendText(chunks[index]!);
    xml.append("</t></is></c></row>");
  }
  xml.append("</sheetData></worksheet>");
  return xml.finish();
}

function workbookXml(
  snapshot: WorkbookSnapshot,
  ordered: readonly SheetSnapshot[],
  metadataName: string,
  context: XlsxCodecContext,
  pivotCaches: readonly string[],
): Uint8Array {
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  const requestedActive = ordered.findIndex((sheet) => sheet.id === snapshot.workbook.activeSheet);
  const activeSheet = ordered[requestedActive];
  const activeTab =
    activeSheet?.visibility === "hidden" || activeSheet?.visibility === "veryHidden"
      ? ordered.findIndex(
          (sheet) => sheet.visibility !== "hidden" && sheet.visibility !== "veryHidden",
        )
      : Math.max(0, requestedActive);
  if (activeTab !== requestedActive) {
    emitWarning(context, {
      code: "unsupported-feature",
      message:
        "A hidden active sheet was preserved, but native Excel activation moved to the first visible sheet",
      sheet: activeSheet?.name,
    });
  }
  xml.append(
    `<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><bookViews><workbookView activeTab="${activeTab}"/></bookViews><sheets>`,
  );
  for (let index = 0; index < ordered.length; index++) {
    const sheet = ordered[index]!;
    const state =
      sheet.visibility === "hidden" || sheet.visibility === "veryHidden"
        ? ` state="${sheet.visibility}"`
        : "";
    xml.append(
      `<sheet name="${escapeXml(encodeXstring(sheet.name))}" sheetId="${index + 1}"${state} r:id="rId${index + 1}"/>`,
    );
  }
  xml.append(
    `<sheet name="${escapeXml(encodeXstring(metadataName))}" sheetId="${ordered.length + 1}" state="veryHidden" r:id="rId${ordered.length + 1}"/></sheets>`,
  );
  if (snapshot.workbook.namedRanges?.length) {
    xml.append("<definedNames>");
    for (const named of snapshot.workbook.namedRanges) {
      const sheet = snapshot.sheets.find((candidate) => candidate.id === named.range.sheet);
      if (!sheet) continue;
      const scopeIndex =
        named.scope === undefined
          ? undefined
          : ordered.findIndex((candidate) => candidate.id === named.scope);
      const range = named.range;
      xml.append(
        `<definedName name="${escapeXml(encodeXstring(named.name))}"${scopeIndex !== undefined && scopeIndex >= 0 ? ` localSheetId="${scopeIndex}"` : ""}>${escapeXml(encodeXstring(`${quotedSheet(sheet.name)}!$${colToA1(range.start.col)}$${range.start.row + 1}:$${colToA1(range.end.col)}$${range.end.row + 1}`))}</definedName>`,
      );
    }
    xml.append("</definedNames>");
  }
  xml.append(`<calcPr fullCalcOnLoad="1"${iterationAttributes(snapshot)} forceFullCalc="1"/>`);
  // CT_Workbook places `<pivotCaches>` directly after `<calcPr>`.
  if (pivotCaches.length > 0) xml.append(`<pivotCaches>${pivotCaches.join("")}</pivotCaches>`);
  xml.append("</workbook>");
  return xml.finish();
}

/**
 * `<calcPr>` iteration attributes. Limits are written even while iteration is
 * off so a later "Enable iterative calculation" in Excel keeps them; default
 * workbooks write none, which Excel reads as the same defaults.
 */
function iterationAttributes(snapshot: WorkbookSnapshot): string {
  const calculation = snapshot.workbook.calculation;
  if (
    !calculation ||
    (!calculation.iterate &&
      calculation.maxIterations === DEFAULT_MAX_ITERATIONS &&
      calculation.maxChange === DEFAULT_MAX_CHANGE)
  ) {
    return "";
  }
  return `${calculation.iterate ? ' iterate="1"' : ""} iterateCount="${calculation.maxIterations}" iterateDelta="${calculation.maxChange}"`;
}

/** Yield worksheet data before constructing later parts, bounded by the XML/ZIP chunk windows. */
function* writeWorkbookParts(
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
  resolveHook?: WorkbookWriteHookResolver,
): Generator<ZipPart> {
  preflightSnapshot(snapshot, context);
  if (snapshot.sheets.length === 0)
    throw new RangeError("Sheetwrite: XLSX export requires at least one sheet");
  validateNames(snapshot);
  const checked = validateCodecSnapshot(snapshot, context);
  if (!checked.ok) {
    throw new TypeError(
      `Sheetwrite: invalid workbook snapshot: ${checked.errors[0]?.message ?? "unknown error"}`,
    );
  }
  snapshot = checked.value;
  const hook = resolveHook?.(snapshot);
  const ordered = [...snapshot.sheets].sort((left, right) => left.order - right.order);
  const pivots = preparePivots(snapshot, ordered, context);
  const metadataName = metadataSheetName(snapshot);
  const styles = new StylesRegistry(context);
  const overrides: ContentTypeOverride[] = [
    { part: "xl/workbook.xml", contentType: WORKBOOK_CONTENT },
    { part: "xl/styles.xml", contentType: STYLES_CONTENT },
  ];
  const workbookRelationships = [];
  let nextTableId = 1;
  for (let index = 0; index < ordered.length; index++) {
    checkAbort(context);
    const number = index + 1;
    const part = `xl/worksheets/sheet${number}.xml`;
    const sheet = ordered[index];
    if (!sheet) throw new TypeError("Sheetwrite: missing ordered export worksheet");
    let result: SheetWriteResult | undefined;
    const sheetTableId = nextTableId;
    function* chunks(exportSheet: SheetSnapshot): Generator<Uint8Array> {
      result = yield* writeSheet(
        snapshot,
        exportSheet,
        styles,
        context,
        number,
        sheetTableId,
        hook,
        pivots?.sheetRelationships(exportSheet.id),
      );
    }
    yield { name: part, data: chunks(pivots ? pivots.withSavedOutput(sheet) : sheet) };
    if (!result) throw new Error(`Sheetwrite: worksheet ${part} was not consumed before advancing`);
    overrides.push({ part, contentType: WORKSHEET_CONTENT });
    workbookRelationships.push({
      id: `rId${number}`,
      type: WORKSHEET_REL,
      target: `worksheets/sheet${number}.xml`,
    });
    if (result.relationships) {
      yield { name: `xl/worksheets/_rels/sheet${number}.xml.rels`, data: result.relationships };
    }
    if (result.comments && result.vml) {
      yield { name: `xl/comments${number}.xml`, data: result.comments };
      yield { name: `xl/drawings/vmlDrawing${number}.vml`, data: result.vml };
      overrides.push({ part: `xl/comments${number}.xml`, contentType: COMMENTS_CONTENT });
      overrides.push({ part: `xl/drawings/vmlDrawing${number}.vml`, contentType: VML_CONTENT });
    }
    for (const table of result.tables) {
      yield { name: table.part, data: table.xml };
      overrides.push({ part: table.part, contentType: TABLE_CONTENT });
    }
    nextTableId += result.tables.length;
  }
  for (const part of pivots?.parts ?? []) yield part;
  overrides.push(...(pivots?.overrides ?? []));
  const metadataNumber = ordered.length + 1;
  const metadataPart = `xl/worksheets/sheet${metadataNumber}.xml`;
  yield {
    name: metadataPart,
    data: metadataSheetXml(snapshot, pivots?.nativeIds ?? new Set(), context),
  };
  overrides.push({ part: metadataPart, contentType: WORKSHEET_CONTENT });
  workbookRelationships.push({
    id: `rId${metadataNumber}`,
    type: WORKSHEET_REL,
    target: `worksheets/sheet${metadataNumber}.xml`,
  });
  workbookRelationships.push({
    id: `rId${metadataNumber + 1}`,
    type: STYLES_REL,
    target: "styles.xml",
  });
  const extraIds = (hook?.workbookRelationships ?? []).map((relationship, index) => {
    const id = `rId${metadataNumber + 2 + index}`;
    workbookRelationships.push({ ...relationship, id });
    return id;
  });
  const pivotIds = (pivots?.workbookRelationships ?? []).map((relationship, index) => {
    const id = `rId${metadataNumber + 2 + extraIds.length + index}`;
    workbookRelationships.push({ ...relationship, id });
    return id;
  });
  const pivotCaches = [
    ...(hook?.workbookXml?.(extraIds).pivotCaches ?? []),
    ...(pivots?.pivotCaches(pivotIds) ?? []),
  ];
  yield { name: "xl/styles.xml", data: styles.toXml() };
  yield {
    name: "xl/workbook.xml",
    data: workbookXml(snapshot, ordered, metadataName, context, pivotCaches),
  };
  yield {
    name: "xl/_rels/workbook.xml.rels",
    data: relationshipsXml(workbookRelationships, context),
  };
  yield {
    name: "_rels/.rels",
    data: relationshipsXml(
      [
        { id: "rId1", type: OFFICE_DOCUMENT_REL, target: "xl/workbook.xml" },
        ...(hook?.rootRelationships ?? []).map((relationship, index) => ({
          ...relationship,
          id: `rId${index + 2}`,
        })),
      ],
      context,
    ),
  };
  const overrideMap = new Map(overrides.map((override) => [override.part, override]));
  for (const override of hook?.contentTypeOverrides ?? []) overrideMap.set(override.part, override);
  yield {
    name: "[Content_Types].xml",
    data: contentTypesXml([...overrideMap.values()], context, hook?.contentTypeDefaults),
  };
  yield* hook?.parts?.() ?? [];
}

export function writeWorkbook(
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
  hook?: WorkbookWriteHookResolver,
): Uint8Array {
  return writeZip(writeWorkbookParts(snapshot, context, hook), context);
}

export function streamWorkbook(
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
  hook?: WorkbookWriteHookResolver,
): Generator<Uint8Array> {
  return zipChunks(writeWorkbookParts(snapshot, context, hook), context);
}
