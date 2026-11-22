// The stage the formula assist demo is recorded on (record-formula-assist.ts):
// the spreadsheet shell with the add-on installed, on the showcase's budget.
// Query parameters: `theme` (light or dark). Marks the document
// `data-figure-ready` once the first frame is drawn; the recording then warms
// the add-on's predictor up with one formula edit before it starts.
import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";
import "../styles/tokens.css";
import { type Grid, initSheetwrite } from "@sheetwrite/core";
import { createSpreadsheetShell } from "@sheetwrite/core/shell";
import { formulaAssistAddon } from "@sheetwrite/formula-assist";
import * as formulas from "@sheetwrite/formulas";

import { budgetOperations, budgetWorkbook } from "../showcases/scenarios/formula-assist.js";
import { siteGridTheme } from "../showcases/site-grid-theme.js";

declare global {
  interface Window {
    /** The grid on the stage, for the recording's steps. */
    __sheetwriteAssistGrid?: Grid;
  }
}

async function mount_stage(host: HTMLElement, params: URLSearchParams): Promise<void> {
  document.documentElement.dataset.theme = params.get("theme") === "dark" ? "dark" : "light";
  await initSheetwrite({ engine: formulas, addons: [formulaAssistAddon()] });
  const shell = createSpreadsheetShell(host, {
    // The compact ribbon leaves the grid room for every cell the demo fills.
    ribbon: { mode: "compact" },
    grid: { workbook: budgetWorkbook(), theme: siteGridTheme() },
  });
  const result = shell.grid.applyRemoteOperations(budgetOperations());
  if (result.status !== "applied") throw new Error(`The budget was ${result.status}`);
  window.__sheetwriteAssistGrid = shell.grid;

  await document.fonts.ready;
  const { promise: painted, resolve } = Promise.withResolvers<void>();
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  await painted;
  document.documentElement.dataset.figureReady = "true";
}

const stage = document.getElementById("stage");
if (stage === null) throw new Error("The stage page has no #stage element");
await mount_stage(stage, new URLSearchParams(location.search));
