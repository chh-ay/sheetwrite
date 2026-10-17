/**
 * Engine scenario — canonical dataset/workbook for the Vanilla workbench.
 *
 * Framework-neutral: owns the dense 100k-row revenue pipeline shared by the
 * Vanilla workbench and the other revenue scenarios.
 */

import type { ColumnarData, Theme, Workbook } from "@sheetwrite/core";

import {
  createRevenueWorkbook,
  REVENUE_AMOUNT_COLUMN,
  REVENUE_DATA,
  REVENUE_ROWS,
} from "../revenue.js";
import { SCENARIO_THEME } from "./presentation.js";

export const ENGINE_ROWS = REVENUE_ROWS;
export const ENGINE_SHEET_ID = "pipeline";
/** Cross-sheet formula prefix — the sheet name contains a space, so quote it. */
export const ENGINE_SHEET_REF = "'Revenue pipeline'";
export const ENGINE_AMOUNT_COLUMN = REVENUE_AMOUNT_COLUMN;
export const ENGINE_THEME: Partial<Theme> = { ...SCENARIO_THEME };

/**
 * Canonical dense columnar dataset (module-level singleton — the grid copies
 * values into the WASM store on ingest, so sharing the source arrays is safe).
 */
export function buildEngineData(): ColumnarData {
  return REVENUE_DATA;
}

/** Canonical single-sheet workbook schema for the engine story. */
export function createEngineWorkbook(positiveFill?: string): Workbook {
  return createRevenueWorkbook(positiveFill);
}
