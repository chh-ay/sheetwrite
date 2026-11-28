import { dashboardFields } from "../dashboard.js";
import {
  CheckedSnapshot,
  recheckSnapshotResources,
  SnapshotValidationError,
  type SnapshotValidationOptions,
  validateWorkbookSnapshot,
  WORKBOOK_SCHEMA_VERSION,
} from "../document-protocol.js";
import { cloneJsonValue } from "../plain-data.js";
import { RangeSourceProjection } from "../reference.js";
import type { CellValue } from "../types/cell.js";
import type { SheetId } from "../types/coordinates.js";
import type {
  SheetSnapshot,
  SnapshotCell,
  Workbook,
  WorkbookSnapshot,
  XlsxSourceSnapshot,
} from "../types/document.js";
import type { StoreWindowReader } from "./window-reader.js";

export interface DecodedWorkbookSnapshot {
  readonly snapshot: WorkbookSnapshot;
  readonly workbook: Workbook;
}

/**
 * Validate once at the trust boundary and convert persisted metadata to live
 * collections. A `CheckedSnapshot` was validated already; only its checks
 * that depend on `options` run again.
 */
export function decodeWorkbookSnapshot(
  input: unknown,
  options: SnapshotValidationOptions = {},
): DecodedWorkbookSnapshot {
  const checked =
    input instanceof CheckedSnapshot
      ? recheckSnapshotResources(input, options)
      : validateWorkbookSnapshot(input, options);
  if (!checked.ok) throw new SnapshotValidationError(checked.errors);
  const snapshot = checked.value;
  const workbook: Workbook = {
    activeSheet: snapshot.workbook.activeSheet,
    namedRanges: cloneJsonValue(snapshot.workbook.namedRanges),
    xlsxSource: snapshot.workbook.xlsxSource,
    // The engine copies non-default settings and drops defaults, so re-encoding never grows the snapshot.
    calculation: snapshot.workbook.calculation,
    // An empty model and no model are the same document, so only a non-empty one is kept.
    dataModel:
      snapshot.workbook.dataModel?.relationships.length ||
      snapshot.workbook.dataModel?.measures?.length
        ? cloneJsonValue(snapshot.workbook.dataModel)
        : undefined,
    // No queries and an empty list are the same document, so only a non-empty list is kept.
    queries: snapshot.workbook.queries?.length
      ? cloneJsonValue(snapshot.workbook.queries)
      : undefined,
    // No links and an empty list are the same document, so only a non-empty list is kept.
    externalLinks: snapshot.workbook.externalLinks?.length
      ? cloneJsonValue(snapshot.workbook.externalLinks)
      : undefined,
    sheets: snapshot.sheets.map((source) => {
      const row_heights = new Map<number, number>();
      const hidden_rows = new Set<number>();
      for (const [row, meta] of source.rowMeta ?? []) {
        if (meta.height !== undefined) row_heights.set(row, meta.height);
        if (meta.hidden) hidden_rows.add(row);
      }

      return {
        id: source.id,
        name: source.name,
        ...dashboardFields(source),
        visibility: source.visibility,
        tabColor: source.tabColor,
        rowCount: source.rowCount,
        columns: cloneJsonValue(source.columns) ?? [],
        frozenRows: source.frozenRows,
        frozenCols: source.frozenCols,
        rowHeights: row_heights.size > 0 ? row_heights : undefined,
        hiddenRows: hidden_rows.size > 0 ? hidden_rows : undefined,
        merges: cloneJsonValue(source.merges),
        conditionalFormats: cloneJsonValue(source.conditionalFormats),
        hyperlinks: cloneJsonValue(source.hyperlinks),
        validationRules: cloneJsonValue(source.validationRules),
        protectedRanges: cloneJsonValue(source.protectedRanges),
        notes: cloneJsonValue(source.notes),
        sortKeys: cloneJsonValue(source.sortKeys),
        sortState: cloneJsonValue(source.sortState),
        filters: cloneJsonValue(source.filters),
        autoFilter: cloneJsonValue(source.autoFilter),
        rowGroups: cloneJsonValue(source.rowGroups),
        tables: cloneJsonValue(source.tables),
        charts: cloneJsonValue(source.charts),
        pivots: cloneJsonValue(source.pivots),
      };
    }),
  };

  return { snapshot, workbook };
}

/**
 * Encodes the live workbook as a snapshot. It holds the store's workbook,
 * window reader and handle-to-sheet list by reference and copies nothing
 * until `encode` runs.
 */
export class StoreSnapshotCodec {
  constructor(
    private readonly workbook: Workbook,
    private readonly windowReader: StoreWindowReader,
    private readonly sheetIdsByHandle: readonly SheetId[],
  ) {}

  encode(documentId: string | undefined, documentVersion: number | undefined): WorkbookSnapshot {
    const sheets: SheetSnapshot[] = this.workbook.sheets.map((sheet, order) => {
      const row_meta_rows = new Set<number>([
        ...(sheet.rowHeights?.keys() ?? []),
        ...(sheet.hiddenRows?.values() ?? []),
      ]);
      const row_meta = [...row_meta_rows]
        .sort((left, right) => left - right)
        .map(
          (row) =>
            [
              row,
              {
                ...(sheet.rowHeights?.has(row) ? { height: sheet.rowHeights.get(row) } : {}),
                ...(sheet.hiddenRows?.has(row) ? { hidden: true } : {}),
              },
            ] as const,
        );

      const persisted = this.windowReader.capturePersistedCells(sheet.id);
      const sources = new RangeSourceProjection(
        persisted.formulaOffsets,
        persisted.formulaSources,
        persisted.referenceOffsets,
        persisted.referenceTargets,
        this.sheetIdsByHandle,
      );
      const cells: SnapshotCell[] = [];
      for (let index = 0; index < persisted.values.length; index++) {
        const row = persisted.coordinates[index * 2]!;
        const col = persisted.coordinates[index * 2 + 1]!;
        const formula = sources.formulaAt(index);
        const target = sources.referenceAt(index);
        const style = persisted.styles[index] ?? {};
        const has_style = Object.keys(style).length > 0;
        const value: CellValue = formula
          ? { kind: "formula", src: formula }
          : target
            ? { kind: "ref", target: { ...target } }
            : { kind: "literal", value: persisted.values[index] ?? null };
        cells.push({
          rowOffset: row,
          colOffset: col,
          value,
          ...(has_style ? { style: cloneJsonValue(style) } : {}),
        });
      }

      return {
        id: sheet.id,
        name: sheet.name,
        order,
        ...dashboardFields(sheet),
        ...(sheet.visibility !== undefined ? { visibility: sheet.visibility } : {}),
        ...(sheet.tabColor !== undefined ? { tabColor: sheet.tabColor } : {}),
        rowCount: sheet.rowCount,
        columns: cloneJsonValue(sheet.columns) ?? [],
        ...(sheet.frozenRows !== undefined ? { frozenRows: sheet.frozenRows } : {}),
        ...(sheet.frozenCols !== undefined ? { frozenCols: sheet.frozenCols } : {}),
        ...(row_meta.length > 0 ? { rowMeta: row_meta.map(([row, meta]) => [row, meta]) } : {}),
        ...(sheet.merges?.length ? { merges: cloneJsonValue(sheet.merges) } : {}),
        ...(sheet.conditionalFormats?.length
          ? { conditionalFormats: cloneJsonValue(sheet.conditionalFormats) }
          : {}),
        ...(sheet.hyperlinks?.length ? { hyperlinks: cloneJsonValue(sheet.hyperlinks) } : {}),
        ...(sheet.validationRules?.length
          ? { validationRules: cloneJsonValue(sheet.validationRules) }
          : {}),
        ...(sheet.protectedRanges?.length
          ? { protectedRanges: cloneJsonValue(sheet.protectedRanges) }
          : {}),
        ...(sheet.notes?.length ? { notes: cloneJsonValue(sheet.notes) } : {}),
        ...(sheet.sortKeys?.length ? { sortKeys: cloneJsonValue(sheet.sortKeys) } : {}),
        ...(sheet.sortState ? { sortState: cloneJsonValue(sheet.sortState) } : {}),
        ...(sheet.filters?.length ? { filters: cloneJsonValue(sheet.filters) } : {}),
        ...(sheet.autoFilter ? { autoFilter: cloneJsonValue(sheet.autoFilter) } : {}),
        ...(sheet.rowGroups?.length ? { rowGroups: cloneJsonValue(sheet.rowGroups) } : {}),
        ...(sheet.tables?.length ? { tables: cloneJsonValue(sheet.tables) } : {}),
        ...(sheet.charts?.length ? { charts: cloneJsonValue(sheet.charts) } : {}),
        ...(sheet.pivots?.length ? { pivots: cloneJsonValue(sheet.pivots) } : {}),
        cells:
          cells.length > 0
            ? [
                {
                  startRow: 0,
                  startCol: 0,
                  rowCount: sheet.rowCount,
                  colCount: sheet.columns.length,
                  cells,
                },
              ]
            : [],
      };
    });

    return {
      schemaVersion: WORKBOOK_SCHEMA_VERSION,
      ...(documentId !== undefined ? { documentId } : {}),
      ...(documentVersion !== undefined ? { version: documentVersion } : {}),
      workbook: {
        activeSheet: this.workbook.activeSheet,
        ...(this.workbook.namedRanges?.length
          ? { namedRanges: cloneJsonValue(this.workbook.namedRanges) }
          : {}),
        // Frozen by the store, so every snapshot shares it instead of copying the payloads.
        ...(this.workbook.xlsxSource ? { xlsxSource: this.workbook.xlsxSource } : {}),
        ...(this.workbook.calculation ? { calculation: { ...this.workbook.calculation } } : {}),
        ...(this.workbook.dataModel ? { dataModel: cloneJsonValue(this.workbook.dataModel) } : {}),
        ...(this.workbook.queries ? { queries: cloneJsonValue(this.workbook.queries) } : {}),
        ...(this.workbook.externalLinks?.length
          ? { externalLinks: cloneJsonValue(this.workbook.externalLinks) }
          : {}),
      },
      sheets,
    };
  }
}

/**
 * Freeze retained OOXML graphs so snapshots can share them by reference.
 * Payload strings are shared, not copied; already frozen parts keep their
 * identity so the XLSX backend's per-part CRC verification stays cached.
 */
export function freezeXlsxSource(source: XlsxSourceSnapshot): XlsxSourceSnapshot {
  return Object.freeze({
    parts: Object.freeze(
      source.parts.map((part) => (Object.isFrozen(part) ? part : Object.freeze({ ...part }))),
    ),
    graphs: Object.freeze(
      source.graphs.map((graph) =>
        Object.freeze({
          ...graph,
          parts: Object.freeze([...graph.parts]),
          dependencies: Object.freeze(
            graph.dependencies.map((dependency) => Object.freeze({ ...dependency })),
          ),
        }),
      ),
    ),
    ...(source.dropped ? { dropped: Object.freeze([...source.dropped]) } : {}),
  });
}
