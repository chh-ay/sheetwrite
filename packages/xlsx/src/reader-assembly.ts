import type {
  CellBorders,
  CellHyperlink,
  CellStyle,
  Column,
  SheetSnapshot,
  WorkbookSnapshot,
  WorkbookTable,
} from "@sheetwrite/core";
import { sheetNameKey } from "@sheetwrite/core";

import { columnWidthCharacters, columnWidthPixels } from "./format.js";
import { columnFromParsed, cellNumberFormatOverride } from "./reader-columns.js";
import {
  claimSidecarSheets,
  uniqueSheetId,
  restoredDashboard,
  reconcileConditionalFormats,
  reconcileHyperlinks,
} from "./reader-sidecar.js";
import type { ParsedSheet } from "./reader-types.js";
import { readerFailure } from "./reader-values.js";
import { claimColumnKey, extendSheet } from "./reader-workbook.js";
import { assertResource, checkAbort, emitWarning, type XlsxCodecContext } from "./resources.js";
import { ParsedStyles } from "./styles.js";

/**
 * Copy a parsed style and its border records for one cell. `Object.assign`
 * onto a new object, not object spread: with spread, the per-cell copies raised
 * the import peak RSS of the bench corpus by about 20 MiB.
 */
function copyCellStyle(source: CellStyle): CellStyle {
  const copy: CellStyle = Object.assign({}, source);
  if (source.border) {
    const borders: CellBorders = Object.assign({}, source.border);
    for (const side of ["all", "top", "right", "bottom", "left"] as const) {
      const border = source.border[side];
      if (border) borders[side] = Object.assign({}, border);
    }
    copy.border = borders;
  }
  return copy;
}

function snapshotColumns(
  source: ParsedSheet,
  meta: SheetSnapshot | undefined,
  styles: ParsedStyles,
  context: XlsxCodecContext,
) {
  const tableColumnCount = source.tables.reduce(
    (maximum, table) => Math.max(maximum, table.range.end.col + 1),
    0,
  );
  const columnCount = Math.max(1, source.columnCount, tableColumnCount, meta?.columns.length ?? 0);
  assertResource(context, "maxColumnsPerSheet", columnCount);
  const columns: Column[] = [];
  const keys = new Set<string>();
  for (let col = 0; col < columnCount; col++) {
    const metaColumn = meta?.columns[col];
    const key = claimColumnKey(metaColumn?.key ?? `column${col + 1}`, keys);
    const nativeColumn = columnFromParsed(source, styles, col, key);
    if (!metaColumn) {
      columns.push(nativeColumn);
      continue;
    }
    const column = structuredClone(metaColumn);
    if (nativeColumn.cellStyle) column.cellStyle = nativeColumn.cellStyle;
    else delete column.cellStyle;
    const definition = source.columns.get(col);
    if (definition) {
      for (const property of ["width", "visible", "numberFormat", "type"] as const) {
        const value = definition[property];
        // Preserve subpixel Sheetwrite widths only while the native column
        // still represents the metadata width; native edits remain authoritative.
        if (
          property === "width" &&
          value === columnWidthPixels(columnWidthCharacters(metaColumn.width))
        )
          continue;
        if (value !== undefined) Object.assign(column, { [property]: structuredClone(value) });
      }
    }
    if (source.columnCells.has(col)) {
      column.type = nativeColumn.type;
      if (nativeColumn.numberFormat) column.numberFormat = nativeColumn.numberFormat;
      else delete column.numberFormat;
    }
    column.key = key;
    columns.push(column);
  }
  return columns;
}

function styleSnapshotCells(source: ParsedSheet, columns: readonly Column[], styles: ParsedStyles) {
  // The parsed cells become the snapshot's cells: each gets its own style copy
  // now that every column default is known, and no second array is built.
  const snapshotCells = source.cells;
  if (source.cellStyles.length !== snapshotCells.length) {
    throw new RangeError("Sheetwrite: XLSX cell styles and cells are out of step");
  }
  for (let index = 0; index < snapshotCells.length; index++) {
    const cell = snapshotCells[index];
    if (!cell) continue;
    const record = styles.at(source.cellStyles.at(index));
    let style = record.style ? copyCellStyle(record.style) : undefined;
    // Native center is normally unset, but must override an inherited bottom.
    if (
      style?.verticalAlign === undefined &&
      columns[cell.colOffset]?.cellStyle?.verticalAlign === "bottom"
    ) {
      style ??= {};
      style.verticalAlign = "middle";
    }
    const numberFormat = cellNumberFormatOverride(
      record,
      cell.value,
      columns[cell.colOffset]?.numberFormat,
    );
    const cellStyle = numberFormat ? { ...style, numberFormat } : style;
    if (cellStyle) cell.style = cellStyle;
  }
  return snapshotCells;
}

function snapshotValidations(source: ParsedSheet, meta: SheetSnapshot | undefined, id: string) {
  const nativeValidations = source.validations.map((validation, index) => {
    const sidecar = meta?.validationRules?.[index];
    const sameBlankDefault =
      sidecar !== undefined &&
      validation.allowBlank === (sidecar.allowBlank === undefined ? true : sidecar.allowBlank);
    return {
      id: sidecar?.id ?? `xlsx-validation-${index + 1}`,
      range: { sheet: id, ...structuredClone(validation.range) },
      condition: structuredClone(validation.condition),
      policy: validation.policy,
      ...(sameBlankDefault
        ? sidecar?.allowBlank !== undefined
          ? { allowBlank: sidecar.allowBlank }
          : {}
        : validation.allowBlank !== undefined
          ? { allowBlank: validation.allowBlank }
          : {}),
      ...(validation.helpText ? { helpText: validation.helpText } : {}),
    };
  });
  const validations = source.hasValidationCollection
    ? nativeValidations
    : (structuredClone(meta?.validationRules) ?? []);
  return validations;
}

function snapshotHyperlinks(
  source: ParsedSheet,
  meta: SheetSnapshot | undefined,
  id: string,
  order: number,
  sheetIds: ReadonlyMap<string, string>,
  context: XlsxCodecContext,
) {
  const nativeHyperlinks = reconcileHyperlinks(
    source.hyperlinks.flatMap((link, linkIndex): CellHyperlink[] => {
      let target: CellHyperlink["target"] | null;
      if (link.target.kind === "external") {
        target = structuredClone(link.target);
      } else {
        const internal = link.target;
        const targetSheet = sheetIds.get(sheetNameKey(internal.sheetName));
        if (!targetSheet) {
          emitWarning(context, {
            code: "hyperlink",
            message: "Hyperlink internal target references a missing worksheet and was dropped",
            sheet: source.name,
          });
          target = null;
        } else {
          target = {
            kind: "internal",
            range: { sheet: targetSheet, ...structuredClone(internal.range) },
          };
        }
      }
      if (!target) return [];
      return [
        {
          id: `xlsx-hyperlink-${order + 1}-${linkIndex + 1}`,
          range: { sheet: id, ...structuredClone(link.range) },
          target,
          ...(link.display !== undefined ? { display: link.display } : {}),
        },
      ];
    }),
    meta?.hyperlinks,
  );
  const hyperlinks = source.hasHyperlinks
    ? nativeHyperlinks
    : (structuredClone(meta?.hyperlinks) ?? []);
  return hyperlinks;
}

function snapshotTables(
  source: ParsedSheet,
  meta: SheetSnapshot | undefined,
  id: string,
  usedTableIds: Set<string>,
  usedTableNames: Set<string>,
) {
  const tables: WorkbookTable[] = source.tables.map((nativeTable, tableIndex) => {
    const metaTable =
      meta?.tables?.find(
        (candidate) =>
          candidate.name.normalize("NFC").toUpperCase() ===
          nativeTable.name.normalize("NFC").toUpperCase(),
      ) ?? meta?.tables?.[tableIndex];
    const tableId = metaTable?.id ?? nativeTable.id;
    const tableNameKey = nativeTable.name.normalize("NFC").toUpperCase();
    if (usedTableIds.has(tableId) || usedTableNames.has(tableNameKey)) {
      return readerFailure(`workbook table ${nativeTable.name} has a duplicate identity or name`);
    }
    usedTableIds.add(tableId);
    usedTableNames.add(tableNameKey);
    return {
      ...structuredClone(nativeTable),
      id: tableId,
      range: { sheet: id, ...structuredClone(nativeTable.range) },
      columns: nativeTable.columns.map((column, columnIndex) => ({
        ...structuredClone(column),
        id: metaTable?.columns[columnIndex]?.id ?? column.id,
      })),
      ...(metaTable?.style !== undefined ? { style: structuredClone(metaTable.style) } : {}),
      ...(metaTable?.unsupportedFeatures !== undefined
        ? { unsupportedFeatures: structuredClone(metaTable.unsupportedFeatures) }
        : {}),
    };
  });
  return tables;
}

export function buildWorkbookSheets(
  sourceSheets: readonly ParsedSheet[],
  metadata: WorkbookSnapshot | null,
  styles: ParsedStyles,
  context: XlsxCodecContext,
) {
  const sheetIds = new Map<string, string>();
  const resolvedMetadata = claimSidecarSheets(sourceSheets, metadata, context);
  const usedIds = new Set<string>();
  for (const meta of resolvedMetadata) {
    if (meta) usedIds.add(meta.id);
  }

  const identities = sourceSheets.map((source, order) => {
    const meta = resolvedMetadata[order];
    const id = meta?.id ?? uniqueSheetId(source.name, order, usedIds);
    sheetIds.set(sheetNameKey(source.name), id);
    return { source, meta, id, order };
  });
  const usedTableIds = new Set<string>();
  const usedTableNames = new Set<string>();
  const sheets: SheetSnapshot[] = [];
  for (const { source, meta, id, order } of identities) {
    checkAbort(context);
    // A dashboard comes back from Sheetwrite metadata; its worksheet only holds static values.
    if (meta?.kind === "dashboard") {
      sheets.push(restoredDashboard(meta, id, source.name, order, source.state));
      continue;
    }
    const columns = snapshotColumns(source, meta, styles, context);
    const rowCount = Math.max(
      source.rowCount,
      source.tables.reduce((maximum, table) => Math.max(maximum, table.range.end.row + 1), 0),
    );
    assertResource(context, "maxRowsPerSheet", rowCount);
    const snapshotCells = styleSnapshotCells(source, columns, styles);
    const validations = snapshotValidations(source, meta, id);
    const nativeNotes = source.notes.map((note) => ({
      addr: { sheet: id, row: note.row, col: note.col },
      text: note.text,
    }));
    const notes = source.hasComments ? nativeNotes : (structuredClone(meta?.notes) ?? []);
    const hyperlinks = snapshotHyperlinks(source, meta, id, order, sheetIds, context);
    const nativeConditionalFormats = reconcileConditionalFormats(
      source.conditionalFormats.map((rule) => ({
        ...structuredClone(rule),
        range: { ...structuredClone(rule.range), sheet: id },
      })),
      meta?.conditionalFormats,
    );
    const conditionalFormats = source.hasConditionalFormatting
      ? nativeConditionalFormats
      : (structuredClone(meta?.conditionalFormats) ?? []);
    // A live view sort comes only from Sheetwrite's own metadata. The
    // worksheet sortState is kept unapplied, unless it is the export of that
    // view sort.
    const sortKeys = structuredClone(meta?.sortKeys) ?? [];
    const sortState = sortKeys.length === 0 ? source.sortState : undefined;
    const tables = snapshotTables(source, meta, id, usedTableIds, usedTableNames);
    if (source.hasUnsupportedValidation && validations.length === 0) {
      emitWarning(context, {
        code: "validation-loss",
        message: "Excel data validation rules could not be mapped safely and were dropped",
        sheet: source.name,
      });
    }
    if (source.hasProtection) {
      emitWarning(context, {
        code: "unsupported-feature",
        message:
          "Excel locked-cell protection is static workbook security and cannot be mapped to Sheetwrite host authorization callbacks; it was not represented as protected ranges",
        sheet: source.name,
      });
    }
    if (source.hasAutoFilter) {
      emitWarning(context, {
        code: "unsupported-feature",
        message:
          "Excel autoFilter excludes its header row, while Sheetwrite filters every data row; native filter semantics were not broadened or shifted",
        sheet: source.name,
      });
    }
    sheets.push({
      id,
      name: source.name,
      order,
      ...(source.state === "hidden" || source.state === "veryHidden"
        ? { visibility: source.state }
        : {}),
      rowCount,
      columns,
      ...(source.frozenRows ? { frozenRows: source.frozenRows } : {}),
      ...(source.frozenCols ? { frozenCols: source.frozenCols } : {}),
      ...(source.rowMeta.length > 0 ? { rowMeta: source.rowMeta } : {}),
      ...(source.merges.length > 0 ? { merges: source.merges } : {}),
      ...(conditionalFormats.length > 0 ? { conditionalFormats } : {}),
      ...(hyperlinks.length > 0 ? { hyperlinks } : {}),
      ...(source.hasRowOutlines
        ? { rowGroups: source.rowGroups }
        : meta?.rowGroups
          ? { rowGroups: structuredClone(meta.rowGroups) }
          : {}),
      ...(validations.length > 0 ? { validationRules: validations } : {}),
      ...(!source.hasProtection && meta?.protectedRanges
        ? { protectedRanges: structuredClone(meta.protectedRanges) }
        : {}),
      ...(notes.length > 0 ? { notes } : {}),
      ...(sortKeys.length > 0 ? { sortKeys } : {}),
      ...(sortState ? { sortState: structuredClone(sortState) } : {}),
      ...(!source.hasAutoFilter && meta?.filters ? { filters: structuredClone(meta.filters) } : {}),
      ...(tables.length > 0 ? { tables } : {}),
      cells:
        snapshotCells.length > 0
          ? [{ startRow: 0, startCol: 0, rowCount, colCount: columns.length, cells: snapshotCells }]
          : [],
    });
  }
  for (const owner of sheets) {
    for (const hyperlink of owner.hyperlinks ?? []) {
      if (hyperlink.target.kind !== "internal") continue;
      const targetRange = hyperlink.target.range;
      const target = sheets.find((candidate) => candidate.id === targetRange.sheet);
      if (target) extendSheet(target, targetRange.end.row, targetRange.end.col);
    }
  }
  return { sheets, sheetIds, resolvedMetadata };
}
