import type { SnapshotResourceLimits } from "../document-protocol.js";
import type { SheetId } from "../types/coordinates.js";
import type { MutationIssue } from "../types/document.js";

/** One sheet's dimensions as a transaction's row and column inserts grow it. */
export interface SheetDimensions {
  readonly name: string;
  rows: number;
  columns: number;
  /** Whether the sheet's cells are held in dense storage, which counts toward `maxDenseCells`. */
  readonly dense: boolean;
}

type SheetLimitIssue = Extract<MutationIssue, { kind: "resource-limit" }>;

/**
 * Holds row and column inserts to the document limits a snapshot must meet,
 * so a store never commits a sheet that its own snapshot would refuse to
 * load. Dense storage also ends at `maxDenseCells` across the workbook,
 * which the default limit sets to the engine's dense-cell ceiling.
 */
export class SheetGrowth {
  private denseCells = 0;

  constructor(
    private readonly sheets: Map<SheetId, SheetDimensions>,
    private readonly limits: Readonly<SnapshotResourceLimits>,
  ) {
    for (const sheet of sheets.values()) {
      if (sheet.dense) this.denseCells += sheet.rows * sheet.columns;
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
    const nextCells = nextRows * nextColumns;
    if (nextCells > this.limits.maxLogicalCellsPerSheet) {
      return issue("sheet-cells", this.limits.maxLogicalCellsPerSheet, nextCells, "cells");
    }
    const nextDenseCells = current.dense
      ? this.denseCells - current.rows * current.columns + nextCells
      : this.denseCells;
    if (current.dense && nextDenseCells > this.limits.maxDenseCells) {
      return issue(
        "dense-cells",
        this.limits.maxDenseCells,
        nextDenseCells,
        "stored cells in the workbook",
      );
    }

    current.rows = nextRows;
    current.columns = nextColumns;
    this.denseCells = nextDenseCells;
    return undefined;
  }
}
