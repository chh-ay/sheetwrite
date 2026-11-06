import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";
import "../styles/tokens.css";
import { type Grid, initSheetwrite, type Workbook, type WorkbookSnapshot } from "@sheetwrite/core";
import type { HistoryArchive } from "@sheetwrite/core/history";
import { createSpreadsheetShell } from "@sheetwrite/core/shell";

import { siteGridTheme } from "../showcases/site-grid-theme.js";
import { FIGURE_SHEETS, figureWorkbook } from "./workbook.js";

declare global {
  interface Window {
    /** The grid on the screenshot stage, for the capture script's steps. */
    __sheetwriteFigureGrid?: Grid;
  }
}

/** The linked workbook the Edit Links capture lists, and the cell that reads it. */
const LINKED_BOOK = "Budget 2027.xlsx";
const LINKED_TARGET = "https://files.example/finance/Budget 2027.xlsx";

/** A small CSV the Get Data capture loads as a saved query. */
const TARGETS_CSV = "Region,Target\nAmericas,1450000\nEMEA,1120000\nAPAC,980000\nLATAM,540000\n";

/** The one-cell workbook the shell starts on, before the screenshot workbook replaces it. */
const PLACEHOLDER_WORKBOOK: Workbook = {
  activeSheet: "start",
  sheets: [
    {
      id: "start",
      name: "Sheet1",
      rowCount: 1,
      columns: [{ key: "a", header: "A", width: 80, type: "text" }],
    },
  ],
};

/**
 * Mount the shell for one screenshot. Query parameters: `theme` (light or
 * dark), `sheet` (orders,
 * regions or dashboard), `ribbon` (full or compact), `width` and `height` of
 * the stage in CSS pixels, `links=1` to give the workbook a linked
 * workbook, and `history=1` to start its version history with a named version. Marks the document `data-figure-ready`
 * once the first frame is drawn.
 */
async function mountFigure(host: HTMLElement, params: URLSearchParams): Promise<void> {
  document.documentElement.dataset.theme = params.get("theme") === "dark" ? "dark" : "light";
  host.style.width = `${Number(params.get("width") ?? 1200)}px`;
  host.style.height = `${Number(params.get("height") ?? 720)}px`;

  const [formulas, { chartsAddon }, { queriesAddon }, { externalLinksAddon }, history] =
    await Promise.all([
      import("@sheetwrite/formulas"),
      import("@sheetwrite/charts"),
      import("@sheetwrite/queries"),
      import("@sheetwrite/core/external-links"),
      import("@sheetwrite/core/history"),
    ]);
  await initSheetwrite({
    engine: formulas,
    addons: [chartsAddon(), queriesAddon(), externalLinksAddon(), history.historyAddon()],
  });
  const archive = await history.HistoryArchive.open({
    documentId: HISTORY_DOCUMENT,
    storage: new history.MemoryHistoryStorage(),
  });

  const sheet = params.get("sheet") ?? FIGURE_SHEETS.dashboard;
  const shell = createSpreadsheetShell(host, {
    ribbon: { mode: params.get("ribbon") === "compact" ? "compact" : "full" },
    grid: {
      workbook: PLACEHOLDER_WORKBOOK,
      theme: siteGridTheme(),
      addons: {
        queries: {
          fetchSource: async () => ({
            kind: "bytes",
            bytes: new TextEncoder().encode(TARGETS_CSV),
          }),
        },
        externalLinks: { resolve: async () => null },
        history: { archive, authorId: "Avery Brooks" },
      },
    },
  });
  await shell.grid.importWorkbook(figureWorkbook(sheet));
  if (params.get("links") === "1") linkBudget(shell.grid);

  if (params.get("history") === "1") await saveDraft(archive, figureWorkbook(sheet));
  window.__sheetwriteFigureGrid = shell.grid;

  await document.fonts.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  document.documentElement.dataset.figureReady = "true";
}

/** The document ID of the stage's version history. */
const HISTORY_DOCUMENT = "figures";

/** The archive's first version, a day before the stage's fixed clock, by another author. */
const DRAFT_TIME = Date.parse("2026-11-03T16:20:00Z");

/** Start the archive from the open workbook and name its first version. */
async function saveDraft(archive: HistoryArchive, snapshot: WorkbookSnapshot): Promise<void> {
  await archive.initialize({ ...snapshot, documentId: HISTORY_DOCUMENT }, DRAFT_TIME);
  await archive.saveVersion("Budget draft", "Lena Fischer", DRAFT_TIME);
}

/** One linked workbook and a formula on the Regions sheet that reads it. */
function linkBudget(grid: Grid): void {
  const result = grid.applyTransaction({
    patches: [
      {
        op: "setExternalLinks",
        links: [
          {
            book: LINKED_BOOK,
            target: LINKED_TARGET,
            sheets: [
              {
                name: "Annual",
                cells: [
                  { row: 1, col: 2, value: 1_520_000 },
                  { row: 2, col: 2, value: 1_180_000 },
                ],
              },
            ],
          },
        ],
      },
      {
        op: "set",
        addr: { sheet: FIGURE_SHEETS.regions, row: 1, col: 3 },
        value: { kind: "formula", src: `='[${LINKED_BOOK}]Annual'!C2` },
      },
    ],
  });
  if (result.status !== "applied") throw new Error(`The linked workbook was ${result.status}`);
}

const stage = document.getElementById("stage");
if (stage === null) throw new Error("The stage page has no #stage element");
await mountFigure(stage, new URLSearchParams(location.search));
