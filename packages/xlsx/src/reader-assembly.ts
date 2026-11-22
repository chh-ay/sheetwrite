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
import { snapshotAutoFilter } from "./reader-autofilter.js";
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
function copy_cell_style(source: CellStyle): CellStyle {
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

function snapshot_columns(
  source: ParsedSheet,
  meta: SheetSnapshot | undefined,
  styles: ParsedStyles,
  context: XlsxCodecContext,
) {
  const table_column_count = source.tables.reduce(
    (maximum, table) => Math.max(maximum, table.range.end.col + 1),
    0,
  );
  const column_count = Math.max(
    1,
    source.columnCount,
    table_column_count,
    meta?.columns.length ?? 0,
  );
  assertResource(context, "maxColumnsPerSheet", column_count);
  const columns: Column[] = [];
  const keys = new Set<string>();
  for (let col = 0; col < column_count; col++) {
    const meta_column = meta?.columns[col];
    const key = claimColumnKey(meta_column?.key ?? `column${col + 1}`, keys);
    const native_column = columnFromParsed(source, styles, col, key);
    if (!meta_column) {
      columns.push(native_column);
      continue;
    }
    const column = structuredClone(meta_column);
    if (native_column.cellStyle) column.cellStyle = native_column.cellStyle;
    else delete column.cellStyle;
    const definition = source.columns.get(col);
    if (definition) {
      for (const property of ["width", "visible", "numberFormat", "type"] as const) {
        const value = definition[property];
        // Preserve subpixel Sheetwrite widths only while the native column
        // still represents the metadata width; native edits remain authoritative.
        if (
          property === "width" &&
          value === columnWidthPixels(columnWidthCharacters(meta_column.width))
        )
          continue;
        if (value !== undefined) Object.assign(column, { [property]: structuredClone(value) });
      }
    }
    if (source.columnCells.has(col)) {
      column.type = native_column.type;
      if (native_column.numberFormat) column.numberFormat = native_column.numberFormat;
      else delete column.numberFormat;
    }
    column.key = key;
    columns.push(column);
  }
  return columns;
}

function style_snapshot_cells(
  source: ParsedSheet,
  columns: readonly Column[],
  styles: ParsedStyles,
) {
  // The parsed cells become the snapshot's cells: each gets its own style copy
  // now that every column default is known, and no second array is built.
  const snapshot_cells = source.cells;
  if (source.cellStyles.length !== snapshot_cells.length) {
    throw new RangeError("Sheetwrite: XLSX cell styles and cells are out of step");
  }
  for (let index = 0; index < snapshot_cells.length; index++) {
    const cell = snapshot_cells[index];
    if (!cell) continue;
    const record = styles.at(source.cellStyles.at(index));
    let style = record.style ? copy_cell_style(record.style) : undefined;
    // Native center is normally unset, but must override an inherited bottom.
    if (
      style?.verticalAlign === undefined &&
      columns[cell.colOffset]?.cellStyle?.verticalAlign === "bottom"
    ) {
      style ??= {};
      style.verticalAlign = "middle";
    }
    const number_format = cellNumberFormatOverride(
      record,
      cell.value,
      columns[cell.colOffset]?.numberFormat,
    );
    const cell_style = number_format ? { ...style, numberFormat: number_format } : style;
    if (cell_style) cell.style = cell_style;
  }
  return snapshot_cells;
}

function snapshot_validations(source: ParsedSheet, meta: SheetSnapshot | undefined, id: string) {
  const native_validations = source.validations.map((validation, index) => {
    const sidecar = meta?.validationRules?.[index];
    const { range, allowBlank: allow_blank, ...fields } = validation;
    const same_blank_default =
      sidecar !== undefined &&
      allow_blank === (sidecar.allowBlank === undefined ? true : sidecar.allowBlank);
    return {
      id: sidecar?.id ?? `xlsx-validation-${index + 1}`,
      range: { sheet: id, ...structuredClone(range) },
      ...structuredClone(fields),
      ...(same_blank_default
        ? sidecar?.allowBlank !== undefined
          ? { allowBlank: sidecar.allowBlank }
          : {}
        : allow_blank !== undefined
          ? { allowBlank: allow_blank }
          : {}),
    };
  });
  const validations = source.hasValidationCollection
    ? native_validations
    : (structuredClone(meta?.validationRules) ?? []);
  return validations;
}

function snapshot_hyperlinks(
  source: ParsedSheet,
  meta: SheetSnapshot | undefined,
  id: string,
  order: number,
  sheet_ids: ReadonlyMap<string, string>,
  context: XlsxCodecContext,
) {
  const native_hyperlinks = reconcileHyperlinks(
    source.hyperlinks.flatMap((link, link_index): CellHyperlink[] => {
      let target: CellHyperlink["target"] | null;
      if (link.target.kind === "external") {
        target = structuredClone(link.target);
      } else {
        const internal = link.target;
        const target_sheet = sheet_ids.get(sheetNameKey(internal.sheetName));
        if (!target_sheet) {
          emitWarning(context, {
            code: "hyperlink",
            message: "Hyperlink internal target references a missing worksheet and was dropped",
            sheet: source.name,
          });
          target = null;
        } else {
          target = {
            kind: "internal",
            range: { sheet: target_sheet, ...structuredClone(internal.range) },
          };
        }
      }
      if (!target) return [];
      return [
        {
          id: `xlsx-hyperlink-${order + 1}-${link_index + 1}`,
          range: { sheet: id, ...structuredClone(link.range) },
          target,
          ...(link.display !== undefined ? { display: link.display } : {}),
        },
      ];
    }),
    meta?.hyperlinks,
  );
  const hyperlinks = source.hasHyperlinks
    ? native_hyperlinks
    : (structuredClone(meta?.hyperlinks) ?? []);
  return hyperlinks;
}

function snapshot_tables(
  source: ParsedSheet,
  meta: SheetSnapshot | undefined,
  id: string,
  used_table_ids: Set<string>,
  used_table_names: Set<string>,
) {
  const tables: WorkbookTable[] = source.tables.map((native_table, table_index) => {
    const meta_table =
      meta?.tables?.find(
        (candidate) =>
          candidate.name.normalize("NFC").toUpperCase() ===
          native_table.name.normalize("NFC").toUpperCase(),
      ) ?? meta?.tables?.[table_index];
    const table_id = meta_table?.id ?? native_table.id;
    const table_name_key = native_table.name.normalize("NFC").toUpperCase();
    if (used_table_ids.has(table_id) || used_table_names.has(table_name_key)) {
      return readerFailure(`workbook table ${native_table.name} has a duplicate identity or name`);
    }
    used_table_ids.add(table_id);
    used_table_names.add(table_name_key);
    return {
      ...structuredClone(native_table),
      id: table_id,
      range: { sheet: id, ...structuredClone(native_table.range) },
      columns: native_table.columns.map((column, column_index) => ({
        ...structuredClone(column),
        id: meta_table?.columns[column_index]?.id ?? column.id,
      })),
      ...(meta_table?.style !== undefined ? { style: structuredClone(meta_table.style) } : {}),
      ...(meta_table?.unsupportedFeatures !== undefined
        ? { unsupportedFeatures: structuredClone(meta_table.unsupportedFeatures) }
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
  const sheet_ids = new Map<string, string>();
  const resolved_metadata = claimSidecarSheets(sourceSheets, metadata, context);
  const used_ids = new Set<string>();
  for (const meta of resolved_metadata) {
    if (meta) used_ids.add(meta.id);
  }

  const identities = sourceSheets.map((source, order) => {
    const meta = resolved_metadata[order];
    const id = meta?.id ?? uniqueSheetId(source.name, order, used_ids);
    sheet_ids.set(sheetNameKey(source.name), id);
    return { source, meta, id, order };
  });
  const used_table_ids = new Set<string>();
  const used_table_names = new Set<string>();
  const sheets: SheetSnapshot[] = [];
  for (const { source, meta, id, order } of identities) {
    checkAbort(context);
    // A dashboard comes back from Sheetwrite metadata; its worksheet only holds static values.
    if (meta?.kind === "dashboard") {
      sheets.push(restoredDashboard(meta, id, source.name, order, source.state));
      continue;
    }
    const columns = snapshot_columns(source, meta, styles, context);
    const row_count = Math.max(
      source.rowCount,
      source.tables.reduce((maximum, table) => Math.max(maximum, table.range.end.row + 1), 0),
    );
    assertResource(context, "maxRowsPerSheet", row_count);
    const snapshot_cells = style_snapshot_cells(source, columns, styles);
    const validations = snapshot_validations(source, meta, id);
    const native_notes = source.notes.map((note) => ({
      addr: { sheet: id, row: note.row, col: note.col },
      text: note.text,
    }));
    const notes = source.hasComments ? native_notes : (structuredClone(meta?.notes) ?? []);
    const hyperlinks = snapshot_hyperlinks(source, meta, id, order, sheet_ids, context);
    const native_conditional_formats = reconcileConditionalFormats(
      source.conditionalFormats.map((rule) => ({
        ...structuredClone(rule),
        range: { ...structuredClone(rule.range), sheet: id },
      })),
      meta?.conditionalFormats,
    );
    const conditional_formats = source.hasConditionalFormatting
      ? native_conditional_formats
      : (structuredClone(meta?.conditionalFormats) ?? []);
    // A live view sort comes only from Sheetwrite's own metadata. The
    // worksheet sortState is kept unapplied, unless it is the export of that
    // view sort.
    const sort_keys = structuredClone(meta?.sortKeys) ?? [];
    const sort_state = sort_keys.length === 0 ? source.sortState : undefined;
    const tables = snapshot_tables(source, meta, id, used_table_ids, used_table_names);
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
    sheets.push({
      id,
      name: source.name,
      order,
      ...(source.state === "hidden" || source.state === "veryHidden"
        ? { visibility: source.state }
        : {}),
      ...(source.tabColor ? { tabColor: source.tabColor } : {}),
      rowCount: row_count,
      columns,
      ...(source.frozenRows ? { frozenRows: source.frozenRows } : {}),
      ...(source.frozenCols ? { frozenCols: source.frozenCols } : {}),
      ...(source.rowMeta.length > 0 ? { rowMeta: source.rowMeta } : {}),
      ...(source.merges.length > 0 ? { merges: source.merges } : {}),
      ...(conditional_formats.length > 0 ? { conditionalFormats: conditional_formats } : {}),
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
      ...(sort_keys.length > 0 ? { sortKeys: sort_keys } : {}),
      ...(sort_state ? { sortState: structuredClone(sort_state) } : {}),
      ...snapshotAutoFilter(
        source.autoFilter,
        meta,
        id,
        snapshot_cells,
        columns,
        row_count,
        context,
      ),
      ...(tables.length > 0 ? { tables } : {}),
      cells:
        snapshot_cells.length > 0
          ? [
              {
                startRow: 0,
                startCol: 0,
                rowCount: row_count,
                colCount: columns.length,
                cells: snapshot_cells,
              },
            ]
          : [],
    });
  }
  for (const owner of sheets) {
    for (const hyperlink of owner.hyperlinks ?? []) {
      if (hyperlink.target.kind !== "internal") continue;
      const target_range = hyperlink.target.range;
      const target = sheets.find((candidate) => candidate.id === target_range.sheet);
      if (target) extendSheet(target, target_range.end.row, target_range.end.col);
    }
  }
  return { sheets, sheetIds: sheet_ids, resolvedMetadata: resolved_metadata };
}
