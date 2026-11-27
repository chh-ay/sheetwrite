import type { CellValue, Column } from "@sheetwrite/core";
import { colToA1 } from "@sheetwrite/core";

import { columnWidthPixels } from "./format.js";
import type { ParsedSheet } from "./reader-types.js";
import { readerFailure, parseUnsigned } from "./reader-values.js";
import { assertResource, emitWarning, type XlsxCodecContext } from "./resources.js";
import { type ParsedCellStyle, ParsedStyles } from "./styles.js";
import { type XmlElement, xmlAttribute, xmlBoolean, xmlChild, xmlChildren } from "./xml.js";

/**
 * For each column, the index of the last declaration in `spans` that covers
 * it, or -1. `spans` holds each declaration's first and last zero-based
 * column. A later declaration wins, as in Excel. Declarations are visited
 * last to first and each column is claimed once, so overlapping full-width
 * declarations cost one pass over the columns, not one per declaration.
 */
export function lastColumnDeclarations(spans: readonly number[]): Int32Array {
  let column_count = 0;
  for (let at = 1; at < spans.length; at += 2) {
    column_count = Math.max(column_count, (spans[at] ?? 0) + 1);
  }

  const owners = new Int32Array(column_count).fill(-1);
  // `next_free[col]` leads to the first unclaimed column at or after `col`.
  const next_free = Int32Array.from({ length: column_count + 1 }, (_, col) => col);
  const first_free = (col: number): number => {
    let free = col;
    while (next_free[free] !== free) free = next_free[free] ?? column_count;

    // Point every column on the walked path at the answer, so no path is walked twice.
    let step = col;
    while (step !== free) {
      const next = next_free[step] ?? column_count;
      next_free[step] = free;
      step = next;
    }
    return free;
  };

  for (let declaration = spans.length / 2 - 1; declaration >= 0; declaration--) {
    const first = spans[declaration * 2] ?? 0;
    const last = spans[declaration * 2 + 1] ?? -1;
    for (let col = first_free(first); col <= last; col = first_free(col + 1)) {
      owners[col] = declaration;
      next_free[col] = col + 1;
    }
  }

  return owners;
}

/**
 * The column type a style's number format gives: `text` for Excel's Text
 * format `@`, then `date`, `currency` or `number`; none for General.
 */
function format_type(record: ParsedCellStyle): Column["type"] | undefined {
  if (record.date) return "date";
  const format = record.numberFormat;
  if (!format) return undefined;
  if (format === "@") return "text";
  return /[$€£¥]|currency/i.test(format) ? "currency" : "number";
}

export function parseColumns(
  root: XmlElement,
  styles: ParsedStyles,
  context: XlsxCodecContext,
  part: string,
): Map<number, Partial<Column>> {
  const columns = new Map<number, Partial<Column>>();
  const collection = xmlChild(root, "cols");
  if (!collection) return columns;

  const spans: number[] = [];
  const definitions: Partial<Column>[] = [];
  for (const element of xmlChildren(collection, "col")) {
    const min = parseUnsigned(xmlAttribute(element, "min"), "column minimum");
    const max = parseUnsigned(xmlAttribute(element, "max"), "column maximum");
    if (min < 1 || max < min) return readerFailure("column range is invalid");
    assertResource(context, "maxColumnsPerSheet", max);
    const column_outline = Number(xmlAttribute(element, "outlineLevel") ?? 0);
    if (!Number.isInteger(column_outline) || column_outline < 0 || column_outline > 7) {
      return readerFailure("column outline level is invalid");
    }
    if (column_outline > 0 || xmlBoolean(xmlAttribute(element, "collapsed"))) {
      emitWarning(context, {
        code: "unsupported-feature",
        message:
          "Excel column outline/collapsed presentation cannot be represented and was dropped",
        part,
      });
    }
    const width_text = xmlAttribute(element, "width");
    const width_chars = width_text === undefined ? undefined : Number(width_text);
    if (width_chars !== undefined && (!Number.isFinite(width_chars) || width_chars <= 0)) {
      return readerFailure("column width is invalid");
    }
    const style_text = xmlAttribute(element, "style");
    const style = styles.at(
      style_text === undefined ? 0 : parseUnsigned(style_text, "column style"),
    );
    const type = format_type(style);
    spans.push(min - 1, max - 1);
    definitions.push({
      ...(width_chars !== undefined ? { width: columnWidthPixels(width_chars) } : {}),
      ...(xmlAttribute(element, "hidden") !== undefined
        ? { visible: !xmlBoolean(xmlAttribute(element, "hidden")) }
        : {}),
      cellStyle: structuredClone(style.style ?? {}),
      ...(style?.numberFormat ? { numberFormat: style.numberFormat } : {}),
      ...(type ? { type } : {}),
    });
  }

  // Readers copy a definition before they change it, so columns of one declaration share it.
  lastColumnDeclarations(spans).forEach((declaration, col) => {
    const definition = definitions[declaration];
    if (definition) columns.set(col, definition);
  });
  return columns;
}

export function columnFromParsed(
  sheet: ParsedSheet,
  styles: ParsedStyles,
  col: number,
  key: string,
): Column {
  const definition = sheet.columns.get(col);
  const formats = new Set<string>();
  const semantic_types = new Set<Column["type"]>();
  const cells = sheet.columnCells.get(col);
  for (const style_index of cells?.styleIndices ?? []) {
    const record = styles.at(style_index);
    if (record.numberFormat) formats.add(record.numberFormat);
    const type = format_type(record);
    if (type) semantic_types.add(type);
  }
  if (definition?.type) semantic_types.add(definition.type);
  if (definition?.numberFormat) formats.add(definition.numberFormat);
  // A column default is chosen only when every formatted cell agrees; cells
  // that differ keep their own format (see `cellNumberFormatOverride`).
  const mixed = semantic_types.size > 1 || formats.size > 1;
  const only_type = semantic_types.values().next().value;
  const number_format = mixed
    ? undefined
    : (definition?.numberFormat ?? formats.values().next().value);
  // Without one format for the column, it reads typing as Excel's General
  // does; each cell keeps its stored value and format.
  const type: Column["type"] = mixed ? "general" : (definition?.type ?? only_type ?? "general");
  const default_style = definition?.cellStyle ?? styles.at(0).style;
  return {
    key,
    header: colToA1(col),
    width: definition?.width ?? 75,
    type,
    ...(number_format ? { numberFormat: number_format } : {}),
    ...(default_style && Object.keys(default_style).length > 0
      ? { cellStyle: structuredClone(default_style) }
      : {}),
    ...(definition?.visible === false ? { visible: false } : {}),
  };
}

/**
 * The number format a cell must carry itself because its column default would
 * render it differently: its own code, or `General` for an unformatted number
 * in a formatted column. Text literals ignore number formats, so they never
 * need an override.
 */
export function cellNumberFormatOverride(
  record: ParsedCellStyle,
  value: CellValue,
  columnFormat: string | undefined,
): string | undefined {
  const own = record.numberFormat;
  if (own === columnFormat) return undefined;
  if (own !== undefined) return own;
  if (value.kind === "literal" && typeof value.value !== "number") return undefined;
  return "General";
}
