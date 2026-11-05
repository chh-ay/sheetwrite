import { createGrid, initSheetwrite } from "@sheetwrite/core";
import { createFormulaBar, createNameBox } from "@sheetwrite/core/shell";

import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";

import { observeSiteTheme } from "../../../lib/site-theme.js";
import { siteGridTheme } from "../../../showcases/site-grid-theme.js";
import { LANDING_SHEET, landingOperations, landingWorkbook } from "./landing-workbook.js";

/** Hosts the live hero grid fills: the formula bar row and the grid itself. */
export interface LiveGridHosts {
  readonly formulaBar: HTMLElement;
  readonly grid: HTMLElement;
}

/** The first input cell, selected so the formula bar shows a value at once. */
const FIRST_UNITS_CELL = { sheet: LANDING_SHEET, row: 1, col: 1 } as const;

/**
 * Mounts the real engine and Grid in the landing hero. Loaded only when the
 * reader reaches for the grid or the page goes idle, so it never competes
 * with the first paint. Returns a disposer.
 */
export async function mountLiveGrid(hosts: LiveGridHosts): Promise<() => void> {
  await initSheetwrite();
  const grid = createGrid(hosts.grid, {
    workbook: landingWorkbook(),
    theme: siteGridTheme(hosts.grid),
  });
  const result = grid.applyTransaction({ patches: landingOperations() });
  if (result.status !== "applied") {
    grid.destroy();
    throw new Error(`The hero workbook did not load: ${result.status}`);
  }
  const focusGrid = () => hosts.grid.querySelector<HTMLElement>(".sheetwrite")?.focus();
  const pieces = [
    createNameBox(hosts.formulaBar, grid, { focusGrid }),
    createFormulaBar(hosts.formulaBar, grid, { focusGrid }),
  ];
  grid.setSelection({ kind: "cell", addr: FIRST_UNITS_CELL });
  const stopTheme = observeSiteTheme(() => grid.setTheme(siteGridTheme(hosts.grid)));
  return () => {
    stopTheme();
    for (const piece of pieces) piece.destroy();
    grid.destroy();
  };
}
