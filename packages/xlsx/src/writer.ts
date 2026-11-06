import type {
  CellStyle,
  ConditionalFormatRule,
  DataValidationRule,
  SheetSnapshot,
  SnapshotCell,
  WorkbookSnapshot,
  WorkbookTableXmlElement,
  WorkbookTable,
} from "@sheetwrite/core";
import {
  cellA1,
  colToA1,
  DEFAULT_MAX_CHANGE,
  DEFAULT_MAX_ITERATIONS,
  labelToCol,
  rangeA1,
  sheetNameKey,
  validateSheetName,
} from "@sheetwrite/core";

import { areaA1 } from "./cell-reference.js";
import { chartDrawingParts, type DrawingChart, freePartName, writeCharts } from "./chart-write.js";
import { DRAWING_REL } from "./chart-xml.js";
import {
  columnWidthCharacters,
  MAIN_NS,
  META_MARKER,
  META_STEM,
  RELATIONSHIPS_NS,
} from "./format.js";
import { convertWorkbookFormulas, formulaContainsExternalReference } from "./formula.js";
import { type ContentTypeOverride, contentTypesXml, relationshipsXml } from "./opc.js";
import { preparePivots } from "./pivot.js";
import {
  QUERY_TABLE_CONTENT,
  QUERY_TABLE_REL,
  type QueryTableBinding,
  queryTableXml,
} from "./query-table.js";
import {
  assertResource,
  boundedErrorText,
  checkAbort,
  emitWarning,
  validateCodecSnapshot,
  type XlsxCodecContext,
} from "./resources.js";
import { StylesRegistry } from "./styles.js";
import { encodeXstring, escapeXml, XmlBuffer } from "./xml.js";
import { writeZip, zipChunks, type ZipPart } from "./zip.js";

const OFFICE_DOCUMENT_REL = `${RELATIONSHIPS_NS}/officeDocument`;
const WORKSHEET_REL = `${RELATIONSHIPS_NS}/worksheet`;
const STYLES_REL = `${RELATIONSHIPS_NS}/styles`;
const COMMENTS_REL = `${RELATIONSHIPS_NS}/comments`;
const VML_REL = `${RELATIONSHIPS_NS}/vmlDrawing`;
const TABLE_REL = `${RELATIONSHIPS_NS}/table`;
const HYPERLINK_REL = `${RELATIONSHIPS_NS}/hyperlink`;
const WORKBOOK_CONTENT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
const WORKSHEET_CONTENT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const STYLES_CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml";
const COMMENTS_CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml";
const VML_CONTENT = "application/vnd.openxmlformats-officedocument.vmlDrawing";
const TABLE_CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml";
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
  /**
   * Add charts to the sheet's kept drawing and return true. A worksheet has at
   * most one `<drawing>`, so charts join a kept drawing instead of a new one.
   */
  appendCharts?(sheet: SheetSnapshot, charts: readonly DrawingChart[]): boolean;
  parts?(): Iterable<ZipPart>;
  /** Connection of the saved query that fills `table`, if it is written as a query table. */
  queryTable?(table: WorkbookTable): QueryTableBinding | undefined;
}

function quoted_sheet(name: string): string {
  return `'${name.replaceAll("'", "''")}'`;
}

function formula_for_reference(snapshot: WorkbookSnapshot, source: SnapshotCell["value"]): string {
  if (source.kind !== "ref") throw new TypeError("Sheetwrite: expected reference cell");
  const target = snapshot.sheets.find((sheet) => sheet.id === source.target.sheet);
  if (!target) return "#REF!";
  return `${quoted_sheet(target.name)}!${cellA1(source.target.row, source.target.col)}`;
}

function canonical_json_value(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical_json_value);
  if (value === null || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    output[key] = canonical_json_value((value as Record<string, unknown>)[key]);
  }
  return output;
}

function has_exact_border_width(style: CellStyle | undefined): boolean {
  return Object.values(style?.border ?? {}).some(
    (border) => border.width !== undefined && border.width !== 1 && border.width !== 2,
  );
}

/**
 * Workbook metadata for the hidden sheet. The saved output of a native pivot
 * is left out: the worksheet holds it as the pivot's rendered cells.
 */
function metadata_snapshot(
  snapshot: WorkbookSnapshot,
  native_pivots: ReadonlySet<string>,
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
              if (!pivot.savedOutput || !native_pivots.has(pivot.id)) return pivot;
              const { savedOutput: _saved, ...definition } = pivot;
              return definition;
            }),
          }
        : {}),
      cells: sheet.cells.flatMap((block) => {
        const preserved = block.cells
          .filter((cell) => cell.value.kind === "ref" || has_exact_border_width(cell.style))
          .map((cell) => ({
            rowOffset: cell.rowOffset,
            colOffset: cell.colOffset,
            value:
              cell.value.kind === "ref"
                ? structuredClone(cell.value)
                : ({ kind: "literal", value: null } as const),
            ...(has_exact_border_width(cell.style) ? { style: structuredClone(cell.style) } : {}),
          }));
        return preserved.length > 0 ? [{ ...block, cells: preserved }] : [];
      }),
    })),
  };
}

function metadata_sheet_name(snapshot: WorkbookSnapshot): string {
  const names = new Set(snapshot.sheets.map((sheet) => sheetNameKey(sheet.name)));
  let name = META_STEM;
  let suffix = 2;
  while (names.has(sheetNameKey(name))) {
    name = `${META_STEM.slice(0, 27)}_${suffix++}`;
  }
  return name;
}

function validate_names(snapshot: WorkbookSnapshot): void {
  const names: string[] = [];
  for (const sheet of snapshot.sheets) {
    const validated = validateSheetName(sheet.name, names);
    if (!validated.ok) {
      const prefix =
        validated.code === "duplicate"
          ? "duplicate case-insensitive XLSX sheet name"
          : "invalid XLSX sheet name";
      throw new RangeError(
        boundedErrorText(`Sheetwrite: ${prefix}: ${sheet.name} (${validated.code})`),
      );
    }
    if (validated.name !== sheet.name) {
      throw new RangeError(
        boundedErrorText(`Sheetwrite: non-canonical NFC XLSX sheet name: ${sheet.name}`),
      );
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

function preflight_snapshot(snapshot: WorkbookSnapshot, context: XlsxCodecContext): void {
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

function validation_xml(
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
    const text_values = values.map((value) =>
      value === null ? "" : typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value),
    );
    if (text_values.some((value) => /[,\r\n]/.test(value))) return null;
    const list = text_values.join(",").replaceAll('"', '""');
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
  let help_text = rule.helpText;
  if (help_text && Array.from(help_text).length > 255) {
    emitWarning(context, {
      code: "validation-loss",
      message: `Validation rule "${rule.id}" prompt/error exceeded 255 characters and was omitted from native XLSX`,
      sheet,
    });
    help_text = undefined;
  }
  const attributes = [
    `type="${type}"`,
    ...(operator ? [`operator="${operator}"`] : []),
    `sqref="${areaA1(rule.range)}"`,
    `allowBlank="${rule.allowBlank === false ? 0 : 1}"`,
    `showInputMessage="${help_text ? 1 : 0}"`,
    `showErrorMessage="${rule.policy === "allow" ? 0 : 1}"`,
    ...(rule.policy !== "allow"
      ? [`errorStyle="${rule.policy === "reject" ? "stop" : "warning"}"`]
      : []),
    ...(help_text
      ? [
          `prompt="${escapeXml(encodeXstring(help_text))}"`,
          `error="${escapeXml(encodeXstring(help_text))}"`,
        ]
      : []),
  ].join(" ");
  return `<dataValidation ${attributes}>${formulas.map((formula, index) => `<formula${index + 1}>${escapeXml(encodeXstring(String(formula)))}</formula${index + 1}>`).join("")}</dataValidation>`;
}
function conditional_scalar(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string") return `"${encodeXstring(value).replaceAll('"', '""')}"`;
  return null;
}

function conditional_format_xml(
  rule: ConditionalFormatRule,
  dxf_id: number,
  priority: number,
): string | null {
  const start_col = Math.min(rule.range.start.col, rule.range.end.col);
  const start_row = Math.min(rule.range.start.row, rule.range.end.row);
  const range = areaA1(rule.range);
  const stop_if_true = rule.stopIfTrue ? ' stopIfTrue="1"' : "";
  if (rule.when.kind === "formula") {
    const source = rule.when.source.startsWith("=") ? rule.when.source.slice(1) : rule.when.source;
    return `<conditionalFormatting sqref="${range}"><cfRule type="expression" dxfId="${dxf_id}" priority="${priority}"${stop_if_true}><formula>${escapeXml(encodeXstring(source))}</formula></cfRule></conditionalFormatting>`;
  }
  if (rule.when.kind === "contains") {
    const text = rule.when.text;
    const formula_text = text.replaceAll('"', '""');
    const anchor = cellA1(start_row, start_col);
    if (rule.when.matchCase) {
      return `<conditionalFormatting sqref="${range}"><cfRule type="expression" dxfId="${dxf_id}" priority="${priority}"${stop_if_true}><formula>ISNUMBER(FIND("${escapeXml(encodeXstring(formula_text))}",${anchor}))</formula></cfRule></conditionalFormatting>`;
    }
    return `<conditionalFormatting sqref="${range}"><cfRule type="containsText" dxfId="${dxf_id}" priority="${priority}"${stop_if_true} operator="containsText" text="${escapeXml(encodeXstring(text))}"><formula>NOT(ISERROR(SEARCH("${escapeXml(encodeXstring(formula_text))}",${anchor})))</formula></cfRule></conditionalFormatting>`;
  }
  if (rule.when.kind === "equal" && rule.when.value === null) {
    const anchor = cellA1(start_row, start_col);
    return `<conditionalFormatting sqref="${range}"><cfRule type="containsBlanks" dxfId="${dxf_id}" priority="${priority}"${stop_if_true}><formula>LEN(TRIM(${anchor}))=0</formula></cfRule></conditionalFormatting>`;
  }
  const formula = conditional_scalar(rule.when.value);
  if (formula === null) return null;
  const operator =
    rule.when.kind === "greaterThan"
      ? "greaterThan"
      : rule.when.kind === "lessThan"
        ? "lessThan"
        : "equal";
  return `<conditionalFormatting sqref="${range}"><cfRule type="cellIs" dxfId="${dxf_id}" priority="${priority}"${stop_if_true} operator="${operator}"><formula>${escapeXml(formula)}</formula></cfRule></conditionalFormatting>`;
}

function cell_xml(
  snapshot: WorkbookSnapshot,
  sheet: SheetSnapshot,
  cell: AbsoluteCell,
  styles: StylesRegistry,
  context: XlsxCodecContext,
): string {
  const column = sheet.columns[cell.col]!;
  const merged_style: CellStyle = { ...column.cellStyle, ...cell.source.style };
  const style_id = styles.register(
    Object.keys(merged_style).length > 0 ? merged_style : undefined,
    merged_style.numberFormat ?? column.numberFormat,
  );
  const reference = cellA1(cell.row, cell.col);
  const style_attribute = style_id ? ` s="${style_id}"` : "";
  const value = cell.source.value;
  if (value.kind === "formula" || value.kind === "ref") {
    let formula =
      value.kind === "formula"
        ? value.src.startsWith("=")
          ? value.src.slice(1)
          : value.src
        : formula_for_reference(snapshot, value);
    if (formulaContainsExternalReference(formula)) {
      emitWarning(context, {
        code: "external-formula",
        message: "External-data formula was neutralized as inert text on export",
        sheet: sheet.name,
        cell: reference,
      });
      return `<c r="${reference}"${style_attribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(encodeXstring(`=${formula}`))}</t></is></c>`;
    }
    if (value.kind === "formula") {
      const converted = context.formulas?.get(value.src);
      if (converted === undefined) throw new Error("Cell formula was not converted");
      formula = converted.startsWith("=") ? converted.slice(1) : converted;
    }
    return `<c r="${reference}"${style_attribute}><f>${escapeXml(encodeXstring(formula))}</f></c>`;
  }
  if (value.value === null) return `<c r="${reference}"${style_attribute}/>`;
  if (typeof value.value === "string") {
    return `<c r="${reference}"${style_attribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(encodeXstring(value.value))}</t></is></c>`;
  }
  if (typeof value.value === "boolean") {
    return `<c r="${reference}"${style_attribute} t="b"><v>${value.value ? 1 : 0}</v></c>`;
  }
  return `<c r="${reference}"${style_attribute}><v>${value.value}</v></c>`;
}

function comments_xml(sheet: SheetSnapshot, context: XlsxCodecContext): Uint8Array {
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

function comments_vml(sheet: SheetSnapshot, context: XlsxCodecContext): Uint8Array {
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

function append_table_rule(
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
  for (const child of rule.children) append_table_rule(xml, child, styles);
  xml.append(`</${rule.name}>`);
}

type WrittenTable = NonNullable<SheetSnapshot["tables"]>[number];

/** A1 references such as `A2:C9` or `B2`; `$` markers are accepted. */
const A1_REFERENCE = /^\$?([A-Za-z]{1,3})\$?(\d+)(?::\$?([A-Za-z]{1,3})\$?(\d+))?$/u;

/** Whether every `ref` in a kept worksheet `sortState` lies inside the sheet. */
function sort_state_fits(rule: WorkbookTableXmlElement, rows: number, cols: number): boolean {
  const reference = rule.attributes.ref;
  if (reference !== undefined) {
    const match = A1_REFERENCE.exec(reference);
    if (!match) return false;

    const [, start_col = "", start_row, end_col = start_col, end_row = start_row] = match;
    const last_col = Math.max(
      labelToCol(start_col.toUpperCase()),
      labelToCol(end_col.toUpperCase()),
    );
    const last_row = Math.max(Number(start_row), Number(end_row));
    if (last_col >= cols || last_row > rows) return false;
  }
  return rule.children.every((child) => sort_state_fits(child, rows, cols));
}

/**
 * Re-anchor stored autofilter and sort references to the table's current
 * rectangle. Row and column edits move `table.range` but not these strings,
 * and Excel repairs a table whose filter or sort ref disagrees with its own.
 * Returns null when a column rule no longer falls inside the table.
 */
function anchored_table_rule(
  rule: WorkbookTableXmlElement,
  table: WrittenTable,
): WorkbookTableXmlElement | null {
  const c0 = table.range.start.col;
  const c1 = table.range.end.col;
  const first_data = table.range.start.row + (table.headerRow ? 1 : 0);
  const last_data = table.range.end.row - (table.totalsRow ? 1 : 0);
  const span = (left: number, right: number, top: number): string =>
    `${cellA1(top, left)}:${cellA1(last_data, right)}`;
  if (rule.name === "autoFilter") {
    const children: WorkbookTableXmlElement[] = [];
    for (const child of rule.children) {
      if (child.name === "filterColumn") {
        const col_id = Number(child.attributes.colId);
        if (!Number.isSafeInteger(col_id) || col_id < 0 || col_id > c1 - c0) return null;
        children.push(child);
        continue;
      }
      const anchored = anchored_table_rule(child, table);
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
  if (last_data < first_data) return null;
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
      attributes: { ...condition.attributes, ref: span(start, end, first_data) },
    });
  }
  return { ...rule, attributes: { ...rule.attributes, ref: span(c0, c1, first_data) }, children };
}

function append_anchored_table_rule(
  xml: XmlBuffer,
  rule: WorkbookTableXmlElement | undefined,
  table: WrittenTable,
  styles: StylesRegistry,
  warn: (message: string) => void,
): void {
  if (!rule) return;
  const anchored = anchored_table_rule(rule, table);
  if (anchored) append_table_rule(xml, anchored, styles);
  else
    warn(
      `Workbook table ${table.name} ${rule.name} no longer matches the table columns and was not emitted`,
    );
}

function table_xml(
  table: NonNullable<SheetSnapshot["tables"]>[number],
  native_id: number,
  sheet_name: string,
  context: XlsxCodecContext,
  styles: StylesRegistry,
  query_table: boolean,
): Uint8Array {
  const ref = areaA1(table.range);
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(
    `<table xmlns="${MAIN_NS}" id="${native_id}" name="${escapeXml(encodeXstring(table.name))}" displayName="${escapeXml(encodeXstring(table.name))}" ref="${ref}"${query_table ? ' tableType="queryTable"' : ""} headerRowCount="${table.headerRow ? 1 : 0}" totalsRowCount="${table.totalsRow ? 1 : 0}">`,
  );
  const warn_rule_loss = (message: string): void => {
    emitWarning(context, { code: "unsupported-feature", message, sheet: sheet_name });
  };
  append_anchored_table_rule(xml, table.autoFilter, table, styles, warn_rule_loss);
  append_anchored_table_rule(xml, table.sortState, table, styles, warn_rule_loss);
  xml.append(`<tableColumns count="${table.columns.length}">`);
  for (const [index, column] of table.columns.entries()) {
    const external_totals =
      column.totalsRowFormula !== undefined &&
      formulaContainsExternalReference(column.totalsRowFormula.text);
    xml.append(
      `<tableColumn id="${index + 1}"${query_table ? ` queryTableFieldId="${index + 1}"` : ""} name="${escapeXml(encodeXstring(column.name))}"${column.totalsRowLabel !== undefined ? ` totalsRowLabel="${escapeXml(encodeXstring(column.totalsRowLabel))}"` : ""}${column.totalsRowFunction !== undefined && !external_totals ? ` totalsRowFunction="${escapeXml(column.totalsRowFunction)}"` : ""}>`,
    );
    for (const formula of [column.calculatedColumnFormula, column.totalsRowFormula]) {
      if (!formula) continue;
      if (formulaContainsExternalReference(formula.text)) {
        emitWarning(context, {
          code: "external-formula",
          message: `External-data ${formula.name} on table ${table.name} was not emitted`,
          sheet: sheet_name,
        });
      } else {
        append_table_rule(xml, formula, styles);
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
      sheet: sheet_name,
    });
  }
  for (const feature of table.unsupportedFeatures ?? []) {
    emitWarning(context, {
      code: "unsupported-feature",
      message: `Workbook table ${table.name} declares unsupported feature ${feature}; it remains in Sheetwrite metadata and was not emitted`,
      sheet: sheet_name,
    });
  }
  xml.append("</table>");
  return xml.finish();
}

function hyperlink_row_styles(
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

function* hyperlink_styled_rows(
  sheet: SheetSnapshot,
  rows: Iterable<{ row: number; cells: readonly AbsoluteCell[] }>,
): Generator<{ row: number; cells: readonly AbsoluteCell[] }> {
  const apply_styles = hyperlink_row_styles(sheet);
  for (const { row, cells } of rows) yield { row, cells: apply_styles(row, cells) };
}

function* write_sheet(
  snapshot: WorkbookSnapshot,
  sheet: SheetSnapshot,
  styles: StylesRegistry,
  context: XlsxCodecContext,
  sheet_number: number,
  table_start_id: number,
  hook?: WorkbookWriteHook,
  pivot_relationships: readonly ExtraRelationship[] = [],
): Generator<Uint8Array, SheetWriteResult> {
  const by_row = new Map<number, AbsoluteCell[]>();
  for (const block of sheet.cells) {
    for (const source of block.cells) {
      const row = block.startRow + source.rowOffset;
      const col = block.startCol + source.colOffset;
      if (row < 0 || row >= sheet.rowCount || col < 0 || col >= sheet.columns.length) continue;
      const row_cells = by_row.get(row) ?? [];
      row_cells.push({ row, col, source });
      by_row.set(row, row_cells);
    }
  }
  const row_metadata = new Map(sheet.rowMeta ?? []);
  const outline_levels = new Map<number, number>();
  const collapsed_outline_rows = new Set<number>();
  const collapsed_summaries = new Set<number>();
  const outline_span = (sheet.rowGroups ?? []).reduce(
    (total, group) => total + (group.end - group.start + 1),
    0,
  );
  assertResource(context, "maxEntryUncompressedBytes", outline_span * 24);
  for (const group of sheet.rowGroups ?? []) {
    for (let row = group.start; row <= group.end; row++) {
      outline_levels.set(row, Math.min(7, (outline_levels.get(row) ?? 0) + 1));
      if (group.collapsed) collapsed_outline_rows.add(row);
    }
    if (group.collapsed && group.end + 1 < sheet.rowCount) {
      collapsed_summaries.add(group.end + 1);
    }
  }
  const rows = new Set([
    ...by_row.keys(),
    ...row_metadata.keys(),
    ...outline_levels.keys(),
    ...collapsed_summaries,
  ]);
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(`<worksheet xmlns="${MAIN_NS}" xmlns:r="${RELATIONSHIPS_NS}">`);
  if (sheet.rowGroups?.length) xml.append('<sheetPr><outlinePr summaryBelow="1"/></sheetPr>');
  const max_row = Math.max(1, sheet.rowCount);
  const max_col = Math.max(0, sheet.columns.length - 1);
  xml.append(`<dimension ref="A1:${cellA1(max_row - 1, max_col)}"/>`);
  xml.append('<sheetViews><sheetView workbookViewId="0">');
  if ((sheet.frozenRows ?? 0) > 0 || (sheet.frozenCols ?? 0) > 0) {
    const top_left = cellA1(sheet.frozenRows ?? 0, sheet.frozenCols ?? 0);
    const active_pane =
      sheet.frozenRows && sheet.frozenCols
        ? "bottomRight"
        : sheet.frozenRows
          ? "bottomLeft"
          : "topRight";
    xml.append(
      `<pane${sheet.frozenCols ? ` xSplit="${sheet.frozenCols}"` : ""}${sheet.frozenRows ? ` ySplit="${sheet.frozenRows}"` : ""} topLeftCell="${top_left}" activePane="${active_pane}" state="frozen"/>`,
    );
  }
  xml.append('</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>');
  if (sheet.columns.length > 0) {
    xml.append("<cols>");
    for (let index = 0; index < sheet.columns.length; index++) {
      const column = sheet.columns[index]!;
      // The stored character width includes OOXML's five-pixel padding.
      const width = columnWidthCharacters(column.width);
      const style_id = styles.register(
        column.cellStyle,
        column.cellStyle?.numberFormat ?? column.numberFormat,
      );
      xml.append(
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"${column.visible === false ? ' hidden="1"' : ""}${style_id ? ` style="${style_id}"` : ""}/>`,
      );
    }
    xml.append("</cols>");
  }
  xml.append("<sheetData>");
  let processed = 0;
  const source_rows =
    hook?.cellRows?.(sheet) ??
    [...rows]
      .sort((left, right) => left - right)
      .map((row) => ({
        row,
        cells: (by_row.get(row) ?? []).sort((left, right) => left.col - right.col),
      }));
  const styled_rows = sheet.hyperlinks?.length
    ? hyperlink_styled_rows(sheet, source_rows)
    : source_rows;
  for (const { row, cells } of styled_rows) {
    const meta = row_metadata.get(row);
    const hidden = meta?.hidden || collapsed_outline_rows.has(row);
    const outline_level = outline_levels.get(row);
    xml.append(
      `<row r="${row + 1}"${meta?.height !== undefined ? ` ht="${(meta.height * 72) / 96}" customHeight="1"` : ""}${hidden ? ' hidden="1"' : ""}${outline_level ? ` outlineLevel="${outline_level}"` : ""}${collapsed_summaries.has(row) ? ' collapsed="1"' : ""}>`,
    );
    for (const cell of cells) {
      processed += 1;
      if ((processed & 4_095) === 0) checkAbort(context);
      xml.append(cell_xml(snapshot, sheet, cell, styles, context));
      const chunk = xml.drain();
      if (chunk) yield* chunk;
    }
    xml.append("</row>");
    const chunk = xml.drain();
    if (chunk) yield* chunk;
  }
  xml.append("</sheetData>");
  if (sheet.sortKeys?.length && sheet.rowCount > 0) {
    const reference = `A1:${cellA1(max_row - 1, max_col)}`;
    xml.append(`<sortState ref="${reference}">`);
    for (const key of sheet.sortKeys) {
      xml.append(
        `<sortCondition ref="${cellA1(0, key.col)}:${cellA1(max_row - 1, key.col)}"${key.ascending ? "" : ' descending="1"'}/>`,
      );
    }
    xml.append("</sortState>");
  } else if (sheet.sortState) {
    if (sort_state_fits(sheet.sortState, sheet.rowCount, sheet.columns.length)) {
      append_table_rule(xml, sheet.sortState, styles);
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
    for (let index = 0; index < sheet.conditionalFormats.length; index++) {
      const rule = sheet.conditionalFormats[index]!;
      const encoded = conditional_format_xml(
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
      const encoded = validation_xml(rule, context, sheet.name);
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
  const relationship_entries: {
    id: string;
    type: string;
    target: string;
    external?: boolean;
  }[] = [];
  let next_relationship_id = 1;
  let legacy_drawing_id: string | undefined;
  if (sheet.notes?.length) {
    const comments_id = `rId${next_relationship_id++}`;
    legacy_drawing_id = `rId${next_relationship_id++}`;
    relationship_entries.push(
      { id: comments_id, type: COMMENTS_REL, target: `../comments${sheet_number}.xml` },
      {
        id: legacy_drawing_id,
        type: VML_REL,
        target: `../drawings/vmlDrawing${sheet_number}.vml`,
      },
    );
    comments = comments_xml(sheet, context);
    vml = comments_vml(sheet, context);
  }
  const hyperlink_elements: string[] = [];
  for (const hyperlink of sheet.hyperlinks ?? []) {
    const source = rangeA1(hyperlink.range.start, hyperlink.range.end);
    const display =
      hyperlink.display === undefined
        ? ""
        : ` display="${escapeXml(encodeXstring(hyperlink.display))}"`;
    if (hyperlink.target.kind === "external") {
      const relationship_id = `rId${next_relationship_id++}`;
      relationship_entries.push({
        id: relationship_id,
        type: HYPERLINK_REL,
        target: hyperlink.target.url,
        external: true,
      });
      hyperlink_elements.push(`<hyperlink ref="${source}" r:id="${relationship_id}"${display}/>`);
      continue;
    }
    const internal_target = hyperlink.target;
    const target_sheet = snapshot.sheets.find(
      (candidate) => candidate.id === internal_target.range.sheet,
    );
    if (!target_sheet) {
      throw new TypeError(
        boundedErrorText(
          `Sheetwrite: hyperlink ${hyperlink.id} references missing sheet ${internal_target.range.sheet}`,
        ),
      );
    }
    const location = `${quoted_sheet(target_sheet.name)}!${rangeA1(internal_target.range.start, internal_target.range.end)}`;
    hyperlink_elements.push(
      `<hyperlink ref="${source}" location="${escapeXml(encodeXstring(location))}"${display}/>`,
    );
  }
  if (hyperlink_elements.length > 0) {
    xml.append(`<hyperlinks>${hyperlink_elements.join("")}</hyperlinks>`);
  }
  const sheet_hook = hook?.sheet?.(sheet, {
    sheetNumber: sheet_number,
    name: `xl/worksheets/sheet${sheet_number}.xml`,
  });
  const extra_ids = (sheet_hook?.relationships ?? []).map((relationship) => {
    const id = `rId${next_relationship_id++}`;
    relationship_entries.push({ ...relationship, id });
    return id;
  });
  // Pivot tables have no worksheet element; Excel finds them through relationships.
  for (const relationship of pivot_relationships) {
    relationship_entries.push({ ...relationship, id: `rId${next_relationship_id++}` });
  }
  // Kept parts may use any name, including the ones generated for charts here.
  const kept_parts = new Set(
    sheet.charts?.length
      ? (hook?.contentTypeOverrides ?? []).map((override) => override.part.toLowerCase())
      : [],
  );
  const charts = writeCharts(snapshot, sheet, sheet_number, kept_parts, context);
  const chart_parts: ZipPart[] = charts?.parts ?? [];
  const chart_overrides: ContentTypeOverride[] = charts?.overrides ?? [];
  if (charts && !hook?.appendCharts?.(sheet, charts.charts)) {
    const drawing_part = freePartName(`xl/drawings/sheetwrite-drawing${sheet_number}`, kept_parts);
    const drawing = chartDrawingParts(drawing_part, charts.charts, context);
    chart_parts.push(...drawing.parts);
    chart_overrides.push(drawing.override);
    const id = `rId${next_relationship_id++}`;
    relationship_entries.push({ id, type: DRAWING_REL, target: `/${drawing_part}` });
    // CT_Worksheet places `<drawing>` after `<hyperlinks>` and before `<legacyDrawing>`.
    xml.append(`<drawing r:id="${id}"/>`);
  }
  xml.append(sheet_hook?.beforeLegacyDrawing?.(extra_ids) ?? "");
  if (legacy_drawing_id) xml.append(`<legacyDrawing r:id="${legacy_drawing_id}"/>`);
  next_relationship_id = Math.max(next_relationship_id, 3);
  const table_relationship_ids: string[] = [];
  const tables = (sheet.tables ?? []).map((table, index) => {
    const native_id = table_start_id + index;
    const relationship_id = `rId${next_relationship_id++}`;
    table_relationship_ids.push(relationship_id);
    relationship_entries.push({
      id: relationship_id,
      type: TABLE_REL,
      target: `../tables/table${native_id}.xml`,
    });
    const binding = hook?.queryTable?.(table);
    return {
      part: `xl/tables/table${native_id}.xml`,
      xml: table_xml(table, native_id, sheet.name, context, styles, binding !== undefined),
      ...(binding
        ? {
            queryTable: {
              part: `xl/queryTables/queryTable${native_id}.xml`,
              xml: queryTableXml(table, native_id, binding),
              rels: relationshipsXml(
                [
                  {
                    id: "rId1",
                    type: QUERY_TABLE_REL,
                    target: `../queryTables/queryTable${native_id}.xml`,
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
    for (const relationship_id of table_relationship_ids) {
      xml.append(`<tablePart r:id="${relationship_id}"/>`);
    }
    xml.append("</tableParts>");
  }
  const relationships =
    relationship_entries.length > 0 ? relationshipsXml(relationship_entries, context) : undefined;
  xml.append("</worksheet>");
  const chunk = xml.drain(true);
  if (chunk) yield* chunk;
  return {
    relationships,
    comments,
    vml,
    tables,
    chartParts: chart_parts,
    chartOverrides: chart_overrides,
  };
}

function metadata_sheet_xml(
  snapshot: WorkbookSnapshot,
  native_pivots: ReadonlySet<string>,
  context: XlsxCodecContext,
): Uint8Array {
  const json = JSON.stringify(canonical_json_value(metadata_snapshot(snapshot, native_pivots)));
  const chunks = [META_MARKER];
  let chunk_parts: string[] = [];
  let chunk_bytes = 0;
  for (const character of json) {
    const encoded = encodeXstring(character);
    const code_point = character.codePointAt(0)!;
    const bytes =
      encoded.length !== character.length
        ? encoded.length
        : code_point <= 0x7f
          ? 1
          : code_point <= 0x7ff
            ? 2
            : code_point <= 0xffff
              ? 3
              : 4;
    if (chunk_bytes + bytes > META_CHUNK && chunk_parts.length > 0) {
      chunks.push(chunk_parts.join(""));
      chunk_parts = [];
      chunk_bytes = 0;
    }
    chunk_parts.push(character);
    chunk_bytes += bytes;
  }
  if (chunk_parts.length > 0) chunks.push(chunk_parts.join(""));
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

function workbook_xml(
  snapshot: WorkbookSnapshot,
  ordered: readonly SheetSnapshot[],
  metadata_name: string,
  context: XlsxCodecContext,
  pivot_caches: readonly string[],
): Uint8Array {
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  const requested_active = ordered.findIndex((sheet) => sheet.id === snapshot.workbook.activeSheet);
  const active_sheet = ordered[requested_active];
  const active_tab =
    active_sheet?.visibility === "hidden" || active_sheet?.visibility === "veryHidden"
      ? ordered.findIndex(
          (sheet) => sheet.visibility !== "hidden" && sheet.visibility !== "veryHidden",
        )
      : Math.max(0, requested_active);
  if (active_tab !== requested_active) {
    emitWarning(context, {
      code: "unsupported-feature",
      message:
        "A hidden active sheet was preserved, but native Excel activation moved to the first visible sheet",
      sheet: active_sheet?.name,
    });
  }
  xml.append(
    `<workbook xmlns="${MAIN_NS}" xmlns:r="${RELATIONSHIPS_NS}"><bookViews><workbookView activeTab="${active_tab}"/></bookViews><sheets>`,
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
    `<sheet name="${escapeXml(encodeXstring(metadata_name))}" sheetId="${ordered.length + 1}" state="veryHidden" r:id="rId${ordered.length + 1}"/></sheets>`,
  );
  if (snapshot.workbook.namedRanges?.length) {
    xml.append("<definedNames>");
    for (const named of snapshot.workbook.namedRanges) {
      const scope_index =
        named.scope === undefined
          ? undefined
          : ordered.findIndex((candidate) => candidate.id === named.scope);
      let source: string;
      if (named.range === undefined) {
        const converted = context.formulas?.get(named.formula);
        if (converted === undefined) throw new Error("Defined-name formula was not converted");
        source = converted.replace(/^=/, "");
      } else {
        const range = named.range;
        const sheet = snapshot.sheets.find((candidate) => candidate.id === range.sheet);
        if (sheet === undefined) continue;
        source = `${quoted_sheet(sheet.name)}!$${colToA1(range.start.col)}$${range.start.row + 1}:$${colToA1(range.end.col)}$${range.end.row + 1}`;
      }
      xml.append(
        `<definedName name="${escapeXml(encodeXstring(named.name))}"${scope_index !== undefined && scope_index >= 0 ? ` localSheetId="${scope_index}"` : ""}>${escapeXml(encodeXstring(source))}</definedName>`,
      );
    }
    xml.append("</definedNames>");
  }
  xml.append(`<calcPr fullCalcOnLoad="1"${iteration_attributes(snapshot)} forceFullCalc="1"/>`);
  // CT_Workbook places `<pivotCaches>` directly after `<calcPr>`.
  if (pivot_caches.length > 0) xml.append(`<pivotCaches>${pivot_caches.join("")}</pivotCaches>`);
  xml.append("</workbook>");
  return xml.finish();
}

/**
 * `<calcPr>` iteration attributes. Limits are written even while iteration is
 * off so a later "Enable iterative calculation" in Excel keeps them; default
 * workbooks write none, which Excel reads as the same defaults.
 */
function iteration_attributes(snapshot: WorkbookSnapshot): string {
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
function* write_workbook_parts(
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
  resolve_hook?: WorkbookWriteHookResolver,
): Generator<ZipPart> {
  preflight_snapshot(snapshot, context);
  if (snapshot.sheets.length === 0)
    throw new RangeError("Sheetwrite: XLSX export requires at least one sheet");
  validate_names(snapshot);
  const checked = validateCodecSnapshot(snapshot, context);
  if (!checked.ok) {
    throw new TypeError(
      boundedErrorText(
        `Sheetwrite: invalid workbook snapshot: ${checked.errors[0]?.message ?? "unknown error"}`,
      ),
    );
  }
  snapshot = checked.value;
  const hook = resolve_hook?.(snapshot);
  const ordered = [...snapshot.sheets].sort((left, right) => left.order - right.order);
  const styles = new StylesRegistry(context);
  const pivots = preparePivots(snapshot, ordered, styles, context);
  const metadata_name = metadata_sheet_name(snapshot);
  const overrides: ContentTypeOverride[] = [
    { part: "xl/workbook.xml", contentType: WORKBOOK_CONTENT },
    { part: "xl/styles.xml", contentType: STYLES_CONTENT },
  ];
  const workbook_relationships = [];
  let next_table_id = 1;
  for (const [index, sheet] of ordered.entries()) {
    checkAbort(context);
    const number = index + 1;
    const part = `xl/worksheets/sheet${number}.xml`;
    let result: SheetWriteResult | undefined;
    const sheet_table_id = next_table_id;
    function* chunks(export_sheet: SheetSnapshot): Generator<Uint8Array> {
      result = yield* write_sheet(
        snapshot,
        export_sheet,
        styles,
        context,
        number,
        sheet_table_id,
        hook,
        pivots?.sheetRelationships(export_sheet.id),
      );
    }
    yield { name: part, data: chunks(pivots ? pivots.withSavedOutput(sheet) : sheet) };
    if (!result) throw new Error(`Sheetwrite: worksheet ${part} was not consumed before advancing`);
    overrides.push({ part, contentType: WORKSHEET_CONTENT });
    workbook_relationships.push({
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
      if (table.queryTable) {
        const rels = table.part.replace(/^xl\/tables\//u, "xl/tables/_rels/") + ".rels";
        yield { name: rels, data: table.queryTable.rels };
        yield { name: table.queryTable.part, data: table.queryTable.xml };
        overrides.push({ part: table.queryTable.part, contentType: QUERY_TABLE_CONTENT });
      }
    }
    next_table_id += result.tables.length;
    for (const part of result.chartParts ?? []) yield part;
    overrides.push(...(result.chartOverrides ?? []));
  }
  for (const part of pivots?.parts ?? []) yield part;
  overrides.push(...(pivots?.overrides ?? []));
  const metadata_number = ordered.length + 1;
  const metadata_part = `xl/worksheets/sheet${metadata_number}.xml`;
  yield {
    name: metadata_part,
    data: metadata_sheet_xml(snapshot, pivots?.nativeIds ?? new Set(), context),
  };
  overrides.push({ part: metadata_part, contentType: WORKSHEET_CONTENT });
  workbook_relationships.push({
    id: `rId${metadata_number}`,
    type: WORKSHEET_REL,
    target: `worksheets/sheet${metadata_number}.xml`,
  });
  workbook_relationships.push({
    id: `rId${metadata_number + 1}`,
    type: STYLES_REL,
    target: "styles.xml",
  });
  const extra_ids = (hook?.workbookRelationships ?? []).map((relationship, index) => {
    const id = `rId${metadata_number + 2 + index}`;
    workbook_relationships.push({ ...relationship, id });
    return id;
  });
  const pivot_ids = (pivots?.workbookRelationships ?? []).map((relationship, index) => {
    const id = `rId${metadata_number + 2 + extra_ids.length + index}`;
    workbook_relationships.push({ ...relationship, id });
    return id;
  });
  const pivot_caches = [
    ...(hook?.workbookXml?.(extra_ids).pivotCaches ?? []),
    ...(pivots?.pivotCaches(pivot_ids) ?? []),
  ];
  yield { name: "xl/styles.xml", data: styles.toXml() };
  yield {
    name: "xl/workbook.xml",
    data: workbook_xml(snapshot, ordered, metadata_name, context, pivot_caches),
  };
  yield {
    name: "xl/_rels/workbook.xml.rels",
    data: relationshipsXml(workbook_relationships, context),
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
  const override_map = new Map(overrides.map((override) => [override.part, override]));
  for (const override of hook?.contentTypeOverrides ?? [])
    override_map.set(override.part, override);
  yield {
    name: "[Content_Types].xml",
    data: contentTypesXml([...override_map.values()], context, hook?.contentTypeDefaults),
  };
  yield* hook?.parts?.() ?? [];
}

export async function writeWorkbook(
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
  hook?: WorkbookWriteHookResolver,
): Promise<Uint8Array> {
  const formulas = await convertWorkbookFormulas(snapshot, "export");
  return writeZip(write_workbook_parts(snapshot, { ...context, formulas }, hook), context);
}

export async function* streamWorkbook(
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
  hook?: WorkbookWriteHookResolver,
): AsyncGenerator<Uint8Array> {
  const formulas = await convertWorkbookFormulas(snapshot, "export");
  yield* zipChunks(write_workbook_parts(snapshot, { ...context, formulas }, hook), context);
}
