import type {
  ConditionalFormatRule,
  DataValidationOperand,
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
import { autoFilterXml } from "./writer-autofilter.js";
import {
  cellXml,
  hyperlinkStyledRows,
  quotedSheet,
  type SheetDynamicArrays,
  type SpillOutput,
  spillKey,
} from "./writer-cells.js";
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
  /** Whether a cell was written as a dynamic array, which needs `xl/metadata.xml`. */
  readonly dynamicArrays: boolean;
}

const COMMENTS_REL = `${RELATIONSHIPS_NS}/comments`;
const VML_REL = `${RELATIONSHIPS_NS}/vmlDrawing`;
const TABLE_REL = `${RELATIONSHIPS_NS}/table`;
const HYPERLINK_REL = `${RELATIONSHIPS_NS}/hyperlink`;

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
  for (const [index, note] of (sheet.notes ?? []).entries()) {
    xml.append(
      `<v:shape id="_x0000_s${1025 + index}" type="#_x0000_t202" style="position:absolute;margin-left:80pt;margin-top:5pt;width:108pt;height:59.25pt;z-index:${index + 1};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto"><v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"/></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:AutoFill>False</x:AutoFill><x:Row>${note.addr.row}</x:Row><x:Column>${note.addr.col}</x:Column></x:ClientData></v:shape>`,
    );
  }
  xml.append("</xml>");
  return xml.finish();
}

function validation_xml(
  rule: DataValidationRule,
  context: XlsxCodecContext,
  sheet: string,
): string | null {
  const condition = rule.condition;
  // XLSX keeps a validation formula without its leading `=`.
  const formula_text = (formula: string): string => formula.slice(1);
  const operand_text = (operand: DataValidationOperand): string =>
    typeof operand === "number" ? String(operand) : formula_text(operand);
  let type: string;
  let operator = "";
  let formulas: string[];
  if (condition.kind === "any") {
    type = "none";
    formulas = [];
  } else if (condition.kind === "custom") {
    type = "custom";
    formulas = [formula_text(condition.formula)];
  } else if (condition.kind === "list" && "source" in condition) {
    type = "list";
    formulas = [formula_text(condition.source)];
  } else if (condition.kind === "list" || condition.kind === "checkbox") {
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
    type = condition.kind === "number" ? (condition.integer ? "whole" : "decimal") : condition.kind;
    if (condition.comparison) {
      operator = condition.comparison.operator;
      formulas = (
        "value" in condition.comparison
          ? [condition.comparison.value]
          : [condition.comparison.min, condition.comparison.max]
      ).map(operand_text);
    } else {
      const bounds = [condition.min, condition.max].filter(
        (value): value is number => value !== undefined,
      );
      if (bounds.length === 0) return null;
      operator =
        condition.min !== undefined && condition.max !== undefined
          ? condition.min === condition.max
            ? "equal"
            : "between"
          : condition.min !== undefined
            ? "greaterThanOrEqual"
            : "lessThanOrEqual";
      formulas = (operator === "equal" ? bounds.slice(0, 1) : bounds).map(String);
    }
  }
  const texts = [
    ["error", rule.helpText, 255],
    ["errorTitle", rule.errorTitle, 32],
    ["promptTitle", rule.inputTitle, 32],
    ["prompt", rule.inputMessage, 255],
  ] as const;
  const text_attributes: string[] = [];
  for (const [attribute, text, max_length] of texts) {
    if (!text) continue;
    if (Array.from(text).length > max_length) {
      emitWarning(context, {
        code: "validation-loss",
        message: `Validation rule "${rule.id}" ${attribute} exceeded ${max_length} characters and was omitted from native XLSX`,
        sheet,
      });
      continue;
    }
    text_attributes.push(`${attribute}="${escapeXml(encodeXstring(text))}"`);
  }
  const error_style = rule.errorStyle ?? (rule.policy === "warn" ? "warning" : "stop");
  const attributes = [
    `type="${type}"`,
    ...(operator ? [`operator="${operator}"`] : []),
    `sqref="${areaA1(rule.range)}"`,
    `allowBlank="${rule.allowBlank === false ? 0 : 1}"`,
    // Excel's showDropDown means the opposite: 1 hides the in-cell dropdown.
    ...(condition.kind === "list" && rule.inCellDropdown === false ? ['showDropDown="1"'] : []),
    `showInputMessage="${rule.showInputMessage === false ? 0 : 1}"`,
    `showErrorMessage="${rule.policy === "allow" ? 0 : 1}"`,
    // Stop is the schema default, so Excel writes the style only when it is another.
    ...(error_style === "stop" ? [] : [`errorStyle="${error_style}"`]),
    ...text_attributes,
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

function index_sheet_rows(sheet: SheetSnapshot) {
  const by_row = new Map<number, AbsoluteCell[]>();
  // Blocks list their cells row by row, so most cells join the previous cell's row.
  let last_row = -1;
  let row_cells: AbsoluteCell[] = [];
  for (const block of sheet.cells) {
    for (const source of block.cells) {
      const row = block.startRow + source.rowOffset;
      const col = block.startCol + source.colOffset;
      if (row < 0 || row >= sheet.rowCount || col < 0 || col >= sheet.columns.length) continue;
      if (row !== last_row) {
        last_row = row;
        const known = by_row.get(row);
        row_cells = known ?? [];
        if (known === undefined) by_row.set(row, row_cells);
      }
      row_cells.push({ row, col, source });
    }
  }
  return by_row;
}

/**
 * Add the values each spill shows in the cells it covers, which Excel files
 * keep there. A covered cell with only a style keeps its style. Each row's
 * column index is built once and kept up to date, so many spills on one row
 * cost no more than their cells.
 */
function add_spill_values(
  sheet: SheetSnapshot,
  by_row: Map<number, AbsoluteCell[]>,
  spills: readonly SpillOutput[],
  context: XlsxCodecContext,
): void {
  const column_indexes = new Map<number, Map<number, number>>();
  let written = 0;
  for (const spill of spills) {
    const row_end = Math.min(spill.row + spill.rows, sheet.rowCount);
    const col_end = Math.min(spill.col + spill.cols, sheet.columns.length);
    for (let row = spill.row; row < row_end; row++) {
      let cells = by_row.get(row);
      if (cells === undefined) {
        cells = [];
        by_row.set(row, cells);
      }
      let index_by_col = column_indexes.get(row);
      if (index_by_col === undefined) {
        index_by_col = new Map(cells.map((cell, index) => [cell.col, index]));
        column_indexes.set(row, index_by_col);
      }
      for (let col = spill.col; col < col_end; col++) {
        if (row === spill.row && col === spill.col) continue;
        written += 1;
        if ((written & 4_095) === 0) checkAbort(context);
        const value = spill.values[(row - spill.row) * spill.cols + col - spill.col] ?? null;
        const index = index_by_col.get(col);
        const existing = index === undefined ? undefined : cells[index];
        if (index !== undefined && existing !== undefined) {
          cells[index] = {
            ...existing,
            source: { ...existing.source, value: { kind: "literal", value } },
          };
        } else if (value !== null) {
          index_by_col.set(col, cells.length);
          cells.push({
            row,
            col,
            source: { rowOffset: row, colOffset: col, value: { kind: "literal", value } },
          });
        }
      }
    }
  }
  // A row the spills only passed with empty values writes no `<row>`.
  for (const row of column_indexes.keys()) if (by_row.get(row)?.length === 0) by_row.delete(row);
}

interface WorksheetOutlines {
  readonly outlineLevels: ReadonlyMap<number, number>;
  readonly collapsedOutlineRows: ReadonlySet<number>;
  readonly collapsedSummaries: ReadonlySet<number>;
}

function sheet_outlines(sheet: SheetSnapshot, context: XlsxCodecContext): WorksheetOutlines {
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
  return {
    outlineLevels: outline_levels,
    collapsedOutlineRows: collapsed_outline_rows,
    collapsedSummaries: collapsed_summaries,
  };
}

function append_sheet_header(xml: XmlBuffer, sheet: SheetSnapshot, styles: StylesRegistry): void {
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(`<worksheet xmlns="${MAIN_NS}" xmlns:r="${RELATIONSHIPS_NS}">`);
  // `<tabColor>` comes before `<outlinePr>` in `<sheetPr>`.
  const tab_color =
    sheet.tabColor && /^#[\dA-Fa-f]{6}$/u.test(sheet.tabColor)
      ? `<tabColor rgb="FF${sheet.tabColor.slice(1).toUpperCase()}"/>`
      : "";
  const outline = sheet.rowGroups?.length ? '<outlinePr summaryBelow="1"/>' : "";
  if (tab_color || outline) xml.append(`<sheetPr>${tab_color}${outline}</sheetPr>`);
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
    for (const [index, column] of sheet.columns.entries()) {
      // The stored character width includes OOXML's five-pixel padding.
      const width = columnWidthCharacters(column.width);
      // A `text` column is Excel's Text format, so typing there keeps text.
      const number_format =
        column.cellStyle?.numberFormat ??
        column.numberFormat ??
        (column.type === "text" ? "@" : undefined);
      const style_id = styles.register(column.cellStyle, number_format);
      xml.append(
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"${column.visible === false ? ' hidden="1"' : ""}${style_id ? ` style="${style_id}"` : ""}/>`,
      );
    }
    xml.append("</cols>");
  }
}

function* write_sheet_rows(
  xml: XmlBuffer,
  snapshot: WorkbookSnapshot,
  sheet: SheetSnapshot,
  styles: StylesRegistry,
  context: XlsxCodecContext,
  rows: ReadonlySet<number>,
  by_row: ReadonlyMap<number, AbsoluteCell[]>,
  row_metadata: ReadonlyMap<number, NonNullable<SheetSnapshot["rowMeta"]>[number][1]>,
  outlines: WorksheetOutlines,
  /** Rows the AutoFilter hides. */
  filtered: ReadonlySet<number>,
  hook: WorkbookWriteHook | undefined,
  arrays: SheetDynamicArrays,
): Generator<Uint8Array> {
  const {
    collapsedOutlineRows: collapsed_outline_rows,
    outlineLevels: outline_levels,
    collapsedSummaries: collapsed_summaries,
  } = outlines;
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
    ? hyperlinkStyledRows(sheet, source_rows)
    : source_rows;
  for (const { row, cells } of styled_rows) {
    const meta = row_metadata.get(row);
    const hidden = meta?.hidden || collapsed_outline_rows.has(row) || filtered.has(row);
    const outline_level = outline_levels.get(row);
    xml.append(
      `<row r="${row + 1}"${meta?.height !== undefined ? ` ht="${(meta.height * 72) / 96}" customHeight="1"` : ""}${hidden ? ' hidden="1"' : ""}${outline_level ? ` outlineLevel="${outline_level}"` : ""}${collapsed_summaries.has(row) ? ' collapsed="1"' : ""}>`,
    );
    for (const cell of cells) {
      processed += 1;
      if ((processed & 4_095) === 0) checkAbort(context);
      xml.append(cellXml(snapshot, sheet, cell, styles, context, arrays));
      const chunk = xml.drain();
      if (chunk) yield* chunk;
    }
    xml.append("</row>");
    const chunk = xml.drain();
    if (chunk) yield* chunk;
  }
  xml.append("</sheetData>");
}

function append_sheet_formats(
  xml: XmlBuffer,
  sheet: SheetSnapshot,
  styles: StylesRegistry,
  context: XlsxCodecContext,
): void {
  const max_row = Math.max(1, sheet.rowCount);
  const max_col = Math.max(0, sheet.columns.length - 1);
  if (sheet.autoFilter) xml.append(autoFilterXml(sheet, sheet.autoFilter));
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
  if (sheet.filters?.length && !sheet.autoFilter) {
    emitWarning(context, {
      code: "unsupported-feature",
      message:
        "View filters without an AutoFilter filter every row, and an Excel autoFilter always keeps a header row; native emission would change which rows are filtered, so the filters remain in Sheetwrite metadata",
      sheet: sheet.name,
    });
  }
}

function append_sheet_relationships(
  xml: XmlBuffer,
  snapshot: WorkbookSnapshot,
  sheet: SheetSnapshot,
  styles: StylesRegistry,
  context: XlsxCodecContext,
  sheet_number: number,
  table_start_id: number,
  hook: WorkbookWriteHook | undefined,
  pivot_relationships: readonly ExtraRelationship[],
  pivot_charts: ReadonlyMap<string, PivotChartData> | undefined,
): Omit<SheetWriteResult, "dynamicArrays"> {
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
    const location = `${quotedSheet(target_sheet.name)}!${rangeA1(internal_target.range.start, internal_target.range.end)}`;
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
  const charts = writeCharts(snapshot, sheet, sheet_number, kept_parts, context, pivot_charts);
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
      xml: tableXml(table, native_id, sheet.name, context, styles, binding !== undefined),
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
  return {
    relationships,
    comments,
    vml,
    tables,
    chartParts: chart_parts,
    chartOverrides: chart_overrides,
  };
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
  filteredRows: readonly number[] = [],
  /** The sheet's installed spills, whose values the export writes in the covered cells. */
  spills: readonly SpillOutput[] = [],
): Generator<Uint8Array, SheetWriteResult> {
  const by_row = index_sheet_rows(sheet);
  add_spill_values(sheet, by_row, spills, context);
  const arrays: SheetDynamicArrays = {
    spills: new Map(spills.map((spill) => [spillKey(spill.row, spill.col), spill])),
    written: false,
  };
  const row_metadata = new Map(sheet.rowMeta ?? []);

  const outlines = sheet_outlines(sheet, context);
  const rows = new Set([
    ...by_row.keys(),
    ...row_metadata.keys(),
    ...outlines.outlineLevels.keys(),
    ...outlines.collapsedSummaries,
    ...filteredRows,
  ]);

  const xml = new XmlBuffer(context);
  append_sheet_header(xml, sheet, styles);

  yield* write_sheet_rows(
    xml,
    snapshot,
    sheet,
    styles,
    context,
    rows,
    by_row,
    row_metadata,
    outlines,
    new Set(filteredRows),
    hook,
    arrays,
  );

  append_sheet_formats(xml, sheet, styles, context);

  const result = append_sheet_relationships(
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
  return { ...result, dynamicArrays: arrays.written };
}
