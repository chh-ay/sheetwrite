import type { SnapshotResourceLimits } from "../document-protocol.js";
import type { SheetId } from "../types/coordinates.js";
import type { MutationIssue } from "../types/document.js";

/**
 * Where a sheet's cells live: dense storage, local pages (a dense sheet that
 * grew past `maxDenseCells`), or datasource-backed pages.
 */
type SheetStorage = "dense" | "local" | "paged";

/** One sheet's dimensions as a transaction's row and column inserts grow it. */
export interface SheetDimensions {
  readonly name: string;
  rows: number;
  columns: number;
  /** Dense and local sheets count toward `maxDenseCells` and `maxLocalPagedCells`. */
  storage: SheetStorage;
}

type SheetLimitIssue = Extract<MutationIssue, { kind: "resource-limit" }>;

/**
 * Holds row and column inserts to the document limits a snapshot must meet,
 * so a store never commits a sheet that its own snapshot would refuse to
 * load. A dense sheet that would pass `maxDenseCells` across the workbook
 * continues in local pages, as the engine does, and local sheets end at
 * `maxLocalPagedCells` across the workbook. The store gives the engine the
 * same two limits, capped at its ceilings, so the engine places and refuses
 * every insert as this check does.
 */
export class SheetGrowth {
  private denseCells = 0;
  private localCells = 0;

  constructor(
    private readonly sheets: Map<SheetId, SheetDimensions>,
    private readonly limits: Readonly<SnapshotResourceLimits>,
  ) {
    for (const sheet of sheets.values()) {
      const cells = sheet.rows * sheet.columns;
      if (sheet.storage === "dense") this.denseCells += cells;
      if (sheet.storage === "local") this.localCells += cells;
    }
  }

  /**
   * Grow `sheet` by `rows` rows and `columns` columns, or return the limit
   * that refuses it and leave the dimensions as they were. A sheet this
   * transaction adds is not tracked; sheet admission bounds it.
   */
  grow(sheet: SheetId, rows: number, columns: number): SheetLimitIssue | undefined {
    const current = this.sheets.get(sheet);
    if (current === undefined) return undefined;
    const nextRows = current.rows + rows;
    const nextColumns = current.columns + columns;
    const issue = (
      resource: SheetLimitIssue["resource"],
      max: number,
      actual: number,
      what: string,
    ): SheetLimitIssue => ({
      kind: "resource-limit",
      severity: "error",
      resource,
      actual,
      max,
      message: `${current.name} cannot grow to ${actual.toLocaleString("en-US")} ${what}: the limit is ${max.toLocaleString("en-US")}.`,
    });

    if (nextRows > this.limits.maxRowsPerSheet) {
      return issue("sheet-rows", this.limits.maxRowsPerSheet, nextRows, "rows");
    }
    if (nextColumns > this.limits.maxColumnsPerSheet) {
      return issue("sheet-columns", this.limits.maxColumnsPerSheet, nextColumns, "columns");
    }
    const cells = current.rows * current.columns;
    const nextCells = nextRows * nextColumns;
    if (nextCells > this.limits.maxLogicalCellsPerSheet) {
      return issue("sheet-cells", this.limits.maxLogicalCellsPerSheet, nextCells, "cells");
    }

    let storage = current.storage;
    let denseCells = this.denseCells;
    let localCells = this.localCells;
    if (storage === "dense") {
      denseCells -= cells;
      if (denseCells + nextCells <= this.limits.maxDenseCells) {
        denseCells += nextCells;
      } else {
        storage = "local";
      }
    } else if (storage === "local") {
      localCells -= cells;
    }
    if (storage === "local") {
      localCells += nextCells;
      if (localCells > this.limits.maxLocalPagedCells) {
        return issue(
          "local-paged-cells",
          this.limits.maxLocalPagedCells,
          localCells,
          "cells in local pages across the workbook",
        );
      }
    }

    current.rows = nextRows;
    current.columns = nextColumns;
    current.storage = storage;
    this.denseCells = denseCells;
    this.localCells = localCells;
    return undefined;
  }
}
