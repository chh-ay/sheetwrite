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
  let columnCount = 0;
  for (let at = 1; at < spans.length; at += 2) {
    columnCount = Math.max(columnCount, (spans[at] ?? 0) + 1);
  }

  const owners = new Int32Array(columnCount).fill(-1);
  // `nextFree[col]` leads to the first unclaimed column at or after `col`.
  const nextFree = Int32Array.from({ length: columnCount + 1 }, (_, col) => col);
  const firstFree = (col: number): number => {
    let free = col;
    while (nextFree[free] !== free) free = nextFree[free] ?? columnCount;

    // Point every column on the walked path at the answer, so no path is walked twice.
    let step = col;
    while (step !== free) {
      const next = nextFree[step] ?? columnCount;
      nextFree[step] = free;
      step = next;
    }
    return free;
  };

  for (let declaration = spans.length / 2 - 1; declaration >= 0; declaration--) {
    const first = spans[declaration * 2] ?? 0;
    const last = spans[declaration * 2 + 1] ?? -1;
    for (let col = firstFree(first); col <= last; col = firstFree(col + 1)) {
      owners[col] = declaration;
      nextFree[col] = col + 1;
    }
  }

  return owners;
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
    const columnOutline = Number(xmlAttribute(element, "outlineLevel") ?? 0);
    if (!Number.isInteger(columnOutline) || columnOutline < 0 || columnOutline > 7) {
      return readerFailure("column outline level is invalid");
    }
    if (columnOutline > 0 || xmlBoolean(xmlAttribute(element, "collapsed"))) {
      emitWarning(context, {
        code: "unsupported-feature",
        message:
          "Excel column outline/collapsed presentation cannot be represented and was dropped",
        part,
      });
    }
    const widthText = xmlAttribute(element, "width");
    const widthChars = widthText === undefined ? undefined : Number(widthText);
    if (widthChars !== undefined && (!Number.isFinite(widthChars) || widthChars <= 0)) {
      return readerFailure("column width is invalid");
    }
    const styleText = xmlAttribute(element, "style");
    const style = styles.at(styleText === undefined ? 0 : parseUnsigned(styleText, "column style"));
    const type: Column["type"] | undefined = style?.date
      ? "date"
      : style?.numberFormat
        ? /[$€£¥]|currency/i.test(style.numberFormat)
          ? "currency"
          : "number"
        : undefined;
    spans.push(min - 1, max - 1);
    definitions.push({
      ...(widthChars !== undefined ? { width: columnWidthPixels(widthChars) } : {}),
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
  const semanticTypes = new Set<Column["type"]>();
  const cells = sheet.columnCells.get(col);
  for (const styleIndex of cells?.styleIndices ?? []) {
    const record = styles.at(styleIndex);
    if (record.numberFormat) formats.add(record.numberFormat);
    if (record.date) semanticTypes.add("date");
    else if (record.numberFormat) {
      semanticTypes.add(/[$€£¥]|currency/i.test(record.numberFormat) ? "currency" : "number");
    }
  }
  const hasNumericValue = cells?.hasNumericValue === true;
  if (definition?.type) semanticTypes.add(definition.type);
  if (definition?.numberFormat) formats.add(definition.numberFormat);
  // A column default is chosen only when every formatted cell agrees; cells
  // that differ keep their own format (see the snapshot cell mapping below).
  const mixed = semanticTypes.size > 1 || formats.size > 1;
  const onlyType = semanticTypes.values().next().value;
  const numberFormat = mixed
    ? undefined
    : (definition?.numberFormat ?? formats.values().next().value);
  const type: Column["type"] = mixed
    ? "number"
    : (definition?.type ?? onlyType ?? (hasNumericValue ? "number" : "text"));
  const defaultStyle = definition?.cellStyle ?? styles.at(0).style;
  return {
    key,
    header: colToA1(col),
    width: definition?.width ?? 75,
    type,
    ...(numberFormat ? { numberFormat } : {}),
    ...(defaultStyle && Object.keys(defaultStyle).length > 0
      ? { cellStyle: structuredClone(defaultStyle) }
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
