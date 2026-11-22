/**
 * Captures the docs screenshots from the screenshot stage (index.html and
 * stage.ts here): the spreadsheet shell on a fixed workbook, driven to the
 * view each figure shows, in the light and the dark theme, at 1× and 2×.
 * Writes docs/public/figures/shots/<name>-<theme>-<scale>x.avif, the files the
 * `<Screenshot name>` component shows.
 *
 *   bun run figures              every shot (from docs/)
 *   bun run figures dashboard    the named shots
 *
 * Needs the built packages (`bun run build`), Playwright's Chromium and
 * `avifenc` (libavif) on the PATH.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { type Browser, chromium, type Page } from "@playwright/test";
import type { Selection as GridSelection } from "@sheetwrite/core";
import { createServer } from "vite";

import { SHOT_SIZES, type ShotSize, shotUrl } from "../lib/content-components.ts";

const ROOT = join(import.meta.dir, "../../..");
const STAGE = import.meta.dir;
const OUTPUT = join(ROOT, "docs/public/figures/shots");
const THEMES = ["light", "dark"] as const;
const SCALES = [1, 2] as const;
/** AVIF quality (0–100) and full-resolution chroma: UI text stays sharp. */
const AVIF_ARGS = ["-q", "72", "-y", "444", "-s", "4"];
/** The stage's clock, so times shown in a capture do not change between runs. */
const CAPTURE_TIME = new Date("2026-11-04T15:00:00Z");
/** How long one stage may take to draw its first frame. */
const READY_TIMEOUT_MS = 60_000;

/** A point a crop starts from, in CSS pixels. */
interface ShotPoint {
  readonly x: number;
  readonly y: number;
}

/** One screenshot: the stage query, its size, and the steps that open its view. */
interface Shot {
  name: string;
  /** The size of the written capture. */
  size: ShotSize;
  /**
   * `items`: keep only the dashboard's items, with the dashboard's 12 px margin.
   * `{ x, y }`: the shot's size from that point of the stage.
   * A `CardCrop`: the parts a highlight card shows, fitted into the card.
   */
  crop?: "items" | ShotPoint | CardCrop;
  /** The size of the stage a `{ x, y }` or card crop is taken from. */
  stage?: ShotSize;
  /** With `crop: "items"`, the titles of the items to keep; every item by default. */
  cropItems?: readonly string[];
  query: Record<string, string>;
  /** The stage page, beside index.html; the docs' own stage by default. */
  stagePage?: "assist.html";
  steps?: (page: Page) => Promise<void>;
}

/** Open a ribbon tab, then press its commands in order. */
function ribbon(tab: string, ...commands: string[]) {
  return async (page: Page) => {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    for (const command of commands)
      await page.getByRole("button", { name: command, exact: true }).first().click();
    await settle(page);
  };
}

/** Select the first `rows` rows of columns A to E, from A1. */
async function select_rows(page: Page, rows: number) {
  await page.locator(".sheetwrite-shell-grid").click({ position: { x: 80, y: 44 } });
  await page.keyboard.down("Shift");
  for (let row = 1; row < rows; row += 1) await page.keyboard.press("ArrowDown");
  for (let col = 1; col < 5; col += 1) await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Shift");
}

/** The site theme's grid geometry in CSS pixels: the column header, one row, the row numbers. */
const HEADER_HEIGHT = 32;
const ROW_HEIGHT = 28;
/** The left edge of the Orders columns A to F inside the grid, then the right edge of F. */
const ORDERS_COLUMN_EDGES = [48, 144, 248, 376, 456, 568, 668] as const;

/** A block of grid cells, rows and columns from 0, inclusive. */
interface CellBlock {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

/** A box in the stage page's CSS pixels. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A highlight card's crop: the box around whole parts of the view, fitted
 * into the card's 2:1 frame with a margin of the background behind them.
 * The capture fails when the box cuts through any visible text, control or
 * Orders cell, so a card never shows a word or a button cut off.
 */
interface CardCrop {
  /** The elements the card shows; each selector matches one element. */
  readonly parts: readonly string[];
  /** Orders cells the card shows as well. */
  readonly cells?: CellBlock;
  /** An area of the stage the card shows as well, for a grid with other column widths. */
  readonly area?: Box;
  /** Parts of the view hidden first, so the box does not cut them. */
  readonly hide?: readonly string[];
  /** Long fields the box may cut through: their text must still show whole. */
  readonly cutThrough?: readonly string[];
  /** The stage size the view is laid out at, when not the shot's own. */
  readonly stage?: ShotSize;
  /** An element whose full width the card shows: a side panel, whose list markers hang at its edge. */
  readonly across?: string;
  /** Changes to the view before the card's box is measured, such as a shorter list. */
  readonly steps?: (page: Page) => Promise<void>;
}

/** A point in the grid element: the middle of a cell by its row and column from 0. */
function cell_point(row: number, col: number) {
  const left = ORDERS_COLUMN_EDGES[col];
  const right = ORDERS_COLUMN_EDGES[col + 1];
  if (left === undefined || right === undefined) throw new Error(`Orders has no column ${col}`);
  return { x: (left + right) / 2, y: HEADER_HEIGHT + row * ROW_HEIGHT + ROW_HEIGHT / 2 };
}

/** An inclusive block of the Orders sheet, rows and columns from 0. */
function orders_range(top: number, left: number, bottom: number, right: number) {
  return { sheet: "orders", start: { row: top, col: left }, end: { row: bottom, col: right } };
}

/** Select through the grid's API, then wait for the frame that shows it. */
async function select(page: Page, selection: GridSelection) {
  await page.evaluate((value) => window.__sheetwriteFigureGrid?.setSelection(value), selection);
  await settle(page);
}

/**
 * A paste of one row of 16,385 columns, one more than a paste may have: the
 * grid refuses it before anything is written, and says why.
 */
function paste_refused(name: string, size: ShotSize): Shot {
  return {
    name,
    size,
    query: { sheet: "orders", ribbon: "compact" },
    steps: async (page) => {
      await select(page, { kind: "cell", addr: { sheet: "orders", row: 2, col: 1 } });
      await page.evaluate(() => navigator.clipboard.writeText(`${"1\t".repeat(16_384)}1`));
      await page.evaluate(() => window.__sheetwriteFigureGrid?.actions.paste());
      await page.locator(".sheetwrite-action-status", { hasText: "Nothing was pasted" }).waitFor();
      await settle(page);
    },
  };
}

const PAGE_SHOTS: readonly Shot[] = [
  // The dashboard hero, cropped to the items so the chart and the pivot show
  // whole. Shown at about its own width in the docs column, so its labels stay
  // at their 12 px and up.
  {
    name: "dashboard",
    size: "dashboard",
    query: { sheet: "dashboard", ribbon: "compact" },
    crop: "items",
  },
  // The 0.7.0 Dashboards highlight: the Region slicer narrowed to APAC, and the
  // PivotChart and pivot it filters, so the card does not repeat the hero's KPI cards.
  {
    name: "dashboard-filtered",
    size: "dashboardRow",
    query: { sheet: "dashboard", ribbon: "compact" },
    crop: "items",
    cropItems: ["Revenue by month", "Revenue by product", "Region"],
    steps: async (page) => {
      // A slicer click selects only that value, as in Excel.
      const slicer = page.locator(".sheetwrite-dashboard-slicer");
      await slicer.getByRole("button", { name: "APAC", exact: true }).click();
      await settle(page);
    },
  },
  // The tablet version of the dashboard hero: the KPI cards beside the chart,
  // cropped to the items.
  {
    name: "dashboard-tablet",
    size: "tablet",
    query: { sheet: "dashboard", ribbon: "compact", layout: "tablet" },
    crop: "items",
  },
  // The phone version of the dashboard hero: the KPI cards above the chart,
  // laid out for a phone and cropped to the items.
  {
    name: "dashboard-phone",
    size: "phone",
    query: { sheet: "dashboard", ribbon: "compact", layout: "phone" },
    crop: "items",
  },
  // The Dashboards page: an item's actions menu, where Move and Resize start.
  {
    name: "dashboard-items",
    size: "panel",
    query: { sheet: "dashboard", ribbon: "compact" },
    steps: async (page) => {
      await page.getByRole("button", { name: "Revenue item actions" }).click();
      await settle(page);
    },
  },
  {
    name: "data-model",
    size: "app",
    query: { sheet: "orders" },
    steps: ribbon("Data", "Relationships"),
  },
  {
    name: "sort",
    size: "app",
    query: { sheet: "orders" },
    steps: async (page) => {
      await select_rows(page, 12);
      await ribbon("Data", "Custom Sort")(page);
    },
  },
  {
    name: "formula-help",
    size: "panel",
    query: { sheet: "regions" },
    steps: async (page) => {
      // D2 beside the targets, then the formula bar, where formula help opens as in the cell.
      await page.evaluate(() =>
        window.__sheetwriteFigureGrid?.setSelection({
          kind: "cell",
          addr: { sheet: "regions", row: 1, col: 3 },
        }),
      );
      await page.locator(".sheetwrite-shell-formula").click();
      await page.keyboard.type("=SUMIFS(Orders[Revenue],Orders[Region],");
      await settle(page);
    },
  },
  {
    name: "compact-ribbon",
    size: "panel",
    query: { sheet: "orders", ribbon: "compact" },
    steps: async (page) => {
      await page.getByRole("button", { name: "Number", exact: true }).click();
      await settle(page);
    },
  },
  {
    name: "edit-links",
    size: "app",
    query: { sheet: "regions", links: "1" },
    steps: ribbon("Data", "Edit Links"),
  },
  {
    name: "version-history",
    size: "app",
    query: { sheet: "orders", history: "1" },
    steps: async (page) => {
      await ribbon("Review", "Version History")(page);
      await page.getByRole("button", { name: /^Save a version/ }).click();
      await page.keyboard.type("Quarter plan");
      await page.keyboard.press("Enter");
      await settle(page);
    },
  },
  {
    name: "queries",
    size: "app",
    query: { sheet: "orders" },
    steps: ribbon("Data", "Queries & Connections"),
  },
  // The Grid section: the shell around the grid, a range selected so the
  // status line shows its totals.
  {
    name: "grid-overview",
    size: "app",
    query: { sheet: "orders" },
    steps: (page) => select(page, { kind: "range", range: orders_range(1, 3, 8, 4) }),
  },
  // The grid feature pages use the compact ribbon, so the grid gets the room.
  {
    name: "context-menu",
    size: "panel",
    query: { sheet: "orders", ribbon: "compact" },
    steps: async (page) => {
      await page
        .locator(".sheetwrite-shell-grid")
        .click({ button: "right", position: cell_point(1, 1) });
      await settle(page);
    },
  },
  {
    name: "editing",
    size: "panel",
    query: { sheet: "orders", ribbon: "compact" },
    steps: async (page) => {
      await page.locator(".sheetwrite-shell-grid").dblclick({ position: cell_point(7, 1) });
      await page.keyboard.press("End");
      await page.keyboard.type(" north");
      await settle(page);
    },
  },
  {
    name: "data-grid",
    size: "panel",
    query: { sheet: "orders", ribbon: "compact", presentation: "data-grid" },
  },
  // The fill handle mid-drag: the pointer stays down, so the fill's outline shows.
  {
    name: "fill",
    size: "panel",
    query: { sheet: "orders", ribbon: "compact" },
    steps: async (page) => {
      await select(page, { kind: "range", range: orders_range(1, 3, 2, 3) });
      const grid = await page.locator(".sheetwrite-shell-grid").boundingBox();
      if (grid === null) throw new Error("The grid is not on the stage");
      const handle = {
        x: grid.x + ORDERS_COLUMN_EDGES[4] - 1,
        y: grid.y + HEADER_HEIGHT + 3 * ROW_HEIGHT - 1,
      };
      await page.mouse.move(handle.x, handle.y);
      await page.mouse.down();
      await page.mouse.move(handle.x - 5, handle.y + 3 * ROW_HEIGHT, { steps: 4 });
      await page.mouse.move(handle.x - 5, handle.y + 5 * ROW_HEIGHT - 4, { steps: 4 });
      await settle(page);
    },
  },
  {
    name: "search",
    size: "panel",
    query: { sheet: "orders", ribbon: "compact" },
    steps: async (page) => {
      await page.locator(".sheetwrite-shell-grid").click({ position: cell_point(1, 0) });
      await page.keyboard.press("Control+f");
      // Fill the Find input itself, so the search runs and the matches highlight.
      await page.getByRole("textbox", { name: "Find in sheet" }).fill("EMEA");
      await settle(page);
    },
  },
  {
    name: "selection",
    size: "panel",
    query: { sheet: "orders", ribbon: "compact" },
    steps: (page) =>
      select(page, { kind: "multi", ranges: [orders_range(1, 1, 3, 2), orders_range(5, 3, 8, 4)] }),
  },
  {
    name: "status-bar",
    size: "panel",
    query: { sheet: "orders", ribbon: "compact" },
    steps: (page) => select(page, { kind: "range", range: orders_range(1, 4, 12, 4) }),
  },
  { name: "ribbon", size: "wide", query: { sheet: "orders" } },
  // The formatting, analysis, data and formula pages, on the Report, Pivot and Formulas sheets.
  // The compact ribbon leaves room for the whole chart under the table.
  { name: "report", size: "app", query: { sheet: "report", ribbon: "compact" } },
  {
    name: "fonts",
    size: "panel",
    query: { sheet: "report" },
    steps: async (page) => {
      // The comment cell in G3, scrolled into view.
      const comment = { sheet: "report", row: 2, col: 6 };
      await page.evaluate((addr) => window.__sheetwriteFigureGrid?.scrollToCell(addr), comment);
      await select(page, { kind: "cell", addr: comment });
      // At this width the Alignment group folds into a menu; open it, so its
      // Wrap Text and Top Align show as on beside the Font group.
      await page.getByRole("button", { name: "Alignment", exact: true }).first().click();
      await settle(page);
    },
  },
  {
    name: "number-formats",
    size: "panel",
    query: { sheet: "report" },
    steps: async (page) => {
      // A manager's name: a General cell, so the format box shows what the cell has.
      // The list covers the right of the sheet; the dollar columns stay in view.
      await select(page, { kind: "cell", addr: { sheet: "report", row: 2, col: 1 } });
      // At this width the Number group folds into a menu; open it, then the
      // list of its number format box.
      await page.getByRole("button", { name: "Number", exact: true }).first().click();
      await page.getByRole("button", { name: "Number Format list", exact: true }).click();
      await settle(page);
    },
  },
  // The app size is tall enough to show the table and the chart under it.
  // The chart selected, so its frame and handles show it floating over the cells.
  {
    name: "chart",
    size: "app",
    query: { sheet: "report", ribbon: "compact" },
    steps: async (page) => {
      await page.locator(".sheetwrite-object").first().click();
      await settle(page);
    },
  },
  {
    name: "validation",
    size: "panel",
    query: { sheet: "report", ribbon: "compact" },
    steps: async (page) => {
      await select(page, { kind: "cell", addr: { sheet: "report", row: 3, col: 5 } });
      // Alt+Down on a list cell opens its list, as in Excel; the grid host needs the keyboard focus first.
      await page.locator(".sheetwrite-shell-grid").focus();
      await page.keyboard.press("Alt+ArrowDown");
      await settle(page);
    },
  },
  // The PivotChart selected, with its frame. A selected PivotChart, like an
  // active pivot cell, opens the PivotTable Fields pane over the chart, so the
  // capture closes the pane.
  {
    name: "pivot-chart",
    size: "app",
    query: { sheet: "pivot" },
    steps: async (page) => {
      await page.locator(".sheetwrite-object").first().click();
      await page.locator(".sheetwrite-panel-header button").first().click();
      await settle(page);
    },
  },
  {
    name: "pivot",
    size: "panel",
    query: { sheet: "pivot", ribbon: "compact" },
    steps: (page) => select(page, { kind: "cell", addr: { sheet: "pivot", row: 2, col: 1 } }),
  },
  // The data-grid presentation names the columns in their headers, so a column
  // filter leaves the column names in view.
  {
    name: "filter",
    size: "panel",
    query: { sheet: "orders", ribbon: "compact", presentation: "data-grid" },
    steps: async (page) => {
      await page.evaluate(() => window.__sheetwriteFigureGrid?.filterBy(1, "EMEA"));
      await select(page, { kind: "cell", addr: { sheet: "orders", row: 0, col: 1 } });
      await settle(page);
    },
  },
  {
    name: "formula-bar",
    size: "panel",
    query: { sheet: "report", ribbon: "compact" },
    steps: (page) => select(page, { kind: "cell", addr: { sheet: "report", row: 2, col: 2 } }),
  },
  {
    name: "groupby",
    size: "panel",
    query: { sheet: "formulas", ribbon: "compact" },
    steps: (page) => select(page, { kind: "cell", addr: { sheet: "formulas", row: 0, col: 0 } }),
  },
  // The 0.7.0 Excel editing highlights. Each opens the view its card crops.
  {
    name: "autofilter",
    size: "panel",
    query: { sheet: "orders", ribbon: "compact" },
    steps: async (page) => {
      await select(page, { kind: "cell", addr: { sheet: "orders", row: 0, col: 1 } });
      await page.evaluate(() => window.__sheetwriteFigureGrid?.actions.toggleAutoFilter());
      await page.locator(".sheetwrite-shell-grid").focus();
      await page.keyboard.press("Alt+ArrowDown");
      await page.getByRole("dialog").first().waitFor();
      await settle(page);
    },
  },
  {
    name: "cut-paste",
    size: "panel",
    query: { sheet: "orders", ribbon: "compact" },
    steps: async (page) => {
      await select(page, { kind: "range", range: orders_range(2, 2, 5, 4) });
      await page.evaluate(() => window.__sheetwriteFigureGrid?.actions.cut());
      // The paste target beside the cut cells, where the move would land.
      await select(page, { kind: "cell", addr: { sheet: "orders", row: 2, col: 5 } });
    },
  },
  {
    name: "paste-special",
    size: "app",
    query: { sheet: "orders", ribbon: "compact" },
    steps: async (page) => {
      await select(page, { kind: "range", range: orders_range(1, 3, 4, 4) });
      await page.locator(".sheetwrite-shell-grid").focus();
      await page.keyboard.press("Control+c");
      await select(page, { kind: "cell", addr: { sheet: "orders", row: 1, col: 6 } });
      await page.locator(".sheetwrite-shell-grid").focus();
      await page.keyboard.press("Control+Alt+v");
      await page.getByRole("dialog").first().waitFor();
      await settle(page);
    },
  },
  {
    name: "data-validation",
    size: "app",
    query: { sheet: "report", ribbon: "compact" },
    steps: async (page) => {
      await select(page, { kind: "cell", addr: { sheet: "report", row: 3, col: 5 } });
      await page.evaluate(() => window.__sheetwriteFigureGrid?.actions.dataValidation());
      await page.getByRole("dialog").first().waitFor();
      await settle(page);
    },
  },
  {
    name: "format-cells",
    size: "app",
    query: { sheet: "report", ribbon: "compact" },
    steps: async (page) => {
      await select(page, { kind: "cell", addr: { sheet: "report", row: 2, col: 2 } });
      await page.evaluate(() => window.__sheetwriteFigureGrid?.actions.formatCells());
      await page.getByRole("dialog").first().waitFor();
      await settle(page);
    },
  },
  {
    name: "keyboard-shortcuts",
    size: "app",
    query: { sheet: "orders", ribbon: "compact", keys: "1" },
    steps: async (page) => {
      await page.evaluate(() => window.__sheetwriteFigureGrid?.openKeyboardSettings());
      await page.getByRole("dialog").first().waitFor();
      await settle(page);
    },
  },
  {
    name: "autocomplete",
    size: "panel",
    query: { sheet: "orders", ribbon: "compact" },
    steps: async (page) => {
      await select(page, { kind: "cell", addr: { sheet: "orders", row: 3, col: 1 } });
      await page.locator(".sheetwrite-shell-grid").focus();
      // The first key opens the editor and loads AutoComplete; "Am" then
      // matches only Americas, so the editor shows the rest of it selected.
      await page.keyboard.type("A");
      await settle(page);
      await page.keyboard.type("m");
      await settle(page);
    },
  },
  // The Grid methods page's view sort on the Orders data: the rows shown by
  // Revenue, largest first, while the cells keep their order.
  {
    name: "grid-methods",
    size: "panel",
    query: { sheet: "orders", ribbon: "compact", presentation: "data-grid" },
    steps: async (page) => {
      await page.evaluate(() =>
        window.__sheetwriteFigureGrid?.setViewSort([{ col: 4, ascending: false }]),
      );
      await select(page, { kind: "cell", addr: { sheet: "orders", row: 0, col: 4 } });
    },
  },
  // The paste refused past its limits, at the page size and at the tablet and
  // phone sizes: its message is wider than a phone crop of the page size.
  paste_refused("paste-refused", "panel"),
  paste_refused("paste-refused-tablet", "sectionTablet"),
  paste_refused("paste-refused-phone", "sectionPhone"),
  // The formula assist demo's stage and budget: March's total in D13, whose
  // neighbours left and right agree, so `=` in the formula bar shows the rest.
  // The Formula assist page shows it at the panel size.
  {
    name: "formula-assist",
    size: "panel",
    query: {},
    stagePage: "assist.html",
    steps: async (page) => {
      await page.evaluate(() => {
        const grid = window.__sheetwriteAssistGrid;
        if (grid === undefined) throw new Error("The assist stage has no grid");
        grid.setSelection({
          kind: "cell",
          addr: { sheet: grid.getActiveSheet(), row: 12, col: 3 },
        });
      });
      await page.getByRole("textbox", { name: "Formula bar" }).focus();
      await page.keyboard.type("=");
      await page.locator(".sheetwrite-formula-ghost").waitFor();
      await settle(page);
    },
  },
];

/**
 * The section pages' opening captures, cropped for tablets and phones: each
 * keeps the part of the view the section is about, at a size that reads at
 * those widths. Points are from the top-left of the capture's stage.
 */
const SECTION_CROPS: Readonly<
  Record<
    string,
    { readonly tablet: NonNullable<Shot["crop"]>; readonly phone: NonNullable<Shot["crop"]> }
  >
> = {
  // The ribbon's left groups, the formula bar and columns A to E; then columns C to E and the selection.
  "grid-overview": { tablet: { x: 8, y: 0 }, phone: { x: 248, y: 158 } },
  // The table under its merged title; then its first three columns.
  report: { tablet: { x: 0, y: 100 }, phone: { x: 48, y: 120 } },
  // The PivotChart; then the pivot beside it.
  "pivot-chart": { tablet: { x: 370, y: 158 }, phone: { x: 48, y: 158 } },
  // The filtered columns; then Month, Region and Product.
  filter: { tablet: { x: 8, y: 0 }, phone: { x: 48, y: 66 } },
  // The formula bar over the sheet; then the formula over the selected cell.
  "formula-bar": { tablet: { x: 0, y: 0 }, phone: { x: 100, y: 66 } },
  // The formula bar and columns A to E in the view sort; then Product, Units and Revenue.
  "grid-methods": { tablet: { x: 12, y: 66 }, phone: { x: 248, y: 100 } },
  // The Sort panel beside the sheet; then the panel from its range to the Sort button.
  sort: { tablet: { x: 640, y: 158 }, phone: { x: 880, y: 192 } },
};

/**
 * The 0.7.0 highlight cards: in each shot's view, the whole parts the card is
 * about, fitted into the card so they read at its width on any screen.
 */
const PANEL = ".sheetwrite-panel-host";
const PANEL_HEADER = ".sheetwrite-panel-header";
/**
 * The Format Cells card's dialog width: its fields then fill the card at 1×,
 * 376 px (the card's 400 px less its two 12 px margins) inside the dialog's
 * 16 px padding and 1 px border on each side.
 */
const FORMAT_CELLS_CARD_DIALOG_WIDTH = 410;
const CARD_CROPS: Readonly<Record<string, CardCrop>> = {
  // The panel's title and the relationship from Orders to Regions with its key
  // check. The Tables list above it is taken out of the layout, and the
  // relationship's Edit and Delete buttons are hidden.
  "data-model": {
    parts: [
      PANEL_HEADER,
      ".sheetwrite-panel-body > .sheetwrite-panel-section >> nth=1 >> .sheetwrite-panel-note",
    ],
    steps: async (page) => {
      await page
        .locator(".sheetwrite-panel-body > .sheetwrite-panel-section >> nth=0")
        .evaluate((tables) => ((tables as HTMLElement).style.display = "none"));
      await settle(page);
    },
    hide: [".sheetwrite-panel-body > .sheetwrite-panel-section >> nth=1 >> button"],
    across: PANEL,
  },
  // The panel's title, the range and its header row choice.
  sort: {
    parts: [PANEL_HEADER, ".sheetwrite-panel-body .sheetwrite-panel-check >> nth=0"],
    across: PANEL,
  },
  // The panel's title, Update All, and the linked workbook with its location and status.
  "edit-links": {
    parts: [PANEL_HEADER, ".sheetwrite-panel-body .sheetwrite-panel-note >> nth=1"],
    across: PANEL,
  },
  // The panel's title, Refresh All, and the first saved query with its commands.
  queries: { parts: [PANEL_HEADER, ".sheetwrite-query-row >> nth=0"], across: PANEL },
  // The panel's title, Save a version, and the saved Quarter plan.
  "version-history": { parts: [PANEL_HEADER, ".history-version >> nth=0"], across: PANEL },
  // The formula bar and the argument guide under it, laid out narrower so the
  // guide's signature wraps instead of running past the card.
  "formula-help": {
    parts: [".sheetwrite-shell-formula", ".sheetwrite-formula-guide"],
    stage: "sectionTablet",
  },
  // The compact ribbon's Font to Cells menus and the open Number menu, over
  // an empty sheet.
  "compact-ribbon": {
    parts: [
      ".sheetwrite-ribbon-group >> nth=2",
      ".sheetwrite-ribbon-group >> nth=5",
      ".sheetwrite-ribbon-group-popup",
    ],
    hide: [".sheetwrite-shell-formula-row", ".sheetwrite-shell-formula", ".sheetwrite-shell-grid"],
  },
  // The Region filter's search box and its values with their row counts.
  autofilter: {
    parts: [".sheetwrite-autofilter-search", ".sheetwrite-autofilter-list [role=option] >> nth=4"],
  },
  // The cut cells' moving border and the cell beside them the paste moves them to.
  "cut-paste": { parts: [], cells: { top: 0, left: 2, bottom: 5, right: 5 } },
  // Each dialog's tabs or first group.
  "paste-special": {
    parts: [".sheetwrite-dialog-title", ".sheetwrite-paste-special-group >> nth=0"],
  },
  "data-validation": {
    parts: [
      ".sheetwrite-data-validation-tabs",
      ".sheetwrite-dialog-choice:has-text('In-cell dropdown')",
    ],
  },
  // The Number tab's Category list, cut to its first four categories, and the
  // Sample of the selected cell in that category. The dialog is laid out as
  // wide as the card, so they show at full size.
  "format-cells": {
    parts: [
      ".sheetwrite-format-cells-panel >> nth=0 >> .sheetwrite-dialog-field >> nth=0",
      ".sheetwrite-format-cells-panel >> nth=0 >> .sheetwrite-dialog-field >> nth=1",
    ],
    steps: async (page) => {
      await page
        .locator(".sheetwrite-format-cells-dialog")
        .evaluate(
          (dialog, width) => ((dialog as HTMLElement).style.width = `${width}px`),
          FORMAT_CELLS_CARD_DIALOG_WIDTH,
        );
      await page
        .locator(".sheetwrite-format-cells-panel >> nth=0 >> select >> nth=0")
        .evaluate((list) => ((list as HTMLSelectElement).size = 4));
      await settle(page);
    },
    stage: "sectionTablet",
  },
  // The search box that takes keys, and the Copy and Cut commands with their keys.
  "keyboard-shortcuts": {
    parts: [
      ".sheetwrite-keys-search",
      ".sheetwrite-keys-table tr[data-action='cut'] .sheetwrite-keys-add",
    ],
    hide: [".sheetwrite-keys-filter", ".sheetwrite-keys-count", ".sheetwrite-keys-hint"],
  },
  // The cell editor with the rest of Americas selected, among the Region entries it matches.
  autocomplete: { parts: [], cells: { top: 0, left: 0, bottom: 4, right: 2 } },
  // The formula bar's ghost text over the first rows of the March column it sums,
  // faintly filled: the assist grid's columns A to D under the formula bar, on
  // the app-sized stage the card was laid out for.
  "formula-assist": {
    parts: [],
    area: { x: 0, y: 67, width: 420, height: 178 },
    cutThrough: [".sheetwrite-shell-formula"],
    stage: "app",
  },
};

const SHOTS: readonly Shot[] = [
  ...PAGE_SHOTS,
  ...PAGE_SHOTS.flatMap((shot) => {
    const crops = SECTION_CROPS[shot.name];
    return crops === undefined
      ? []
      : [
          {
            ...shot,
            name: `${shot.name}-tablet`,
            size: "sectionTablet" as const,
            stage: shot.size,
            crop: crops.tablet,
          },
          {
            ...shot,
            name: `${shot.name}-phone`,
            size: "sectionPhone" as const,
            stage: shot.size,
            crop: crops.phone,
          },
        ];
  }),
  ...PAGE_SHOTS.flatMap((shot) => {
    const crop = CARD_CROPS[shot.name];
    return crop === undefined
      ? []
      : [
          {
            ...shot,
            name: `card-${shot.name}`,
            size: "highlight" as const,
            stage: crop.stage ?? shot.size,
            crop,
          },
        ];
  }),
];

/** A stage tall enough to show a phone dashboard's items without scrolling. */
const STAGE_HEIGHT_FOR_CROP = 1000;
/** The dashboard view's padding around its items. */
const DASHBOARD_MARGIN = 12;

/** The box around the named dashboard items (every item by default), with the dashboard's margin. */
async function items_box(page: Page, titles?: readonly string[]) {
  const boxes = await page
    .locator(".sheetwrite-dashboard-item")
    .evaluateAll(
      (items, wanted) =>
        items
          .filter(
            (item) =>
              wanted === null ||
              wanted.includes(
                item.querySelector(".sheetwrite-dashboard-item-title")?.textContent ?? "",
              ),
          )
          .map((item) => item.getBoundingClientRect().toJSON()),
      titles ?? null,
    );
  if (boxes.length !== (titles?.length ?? boxes.length) || boxes.length === 0) {
    throw new Error(`The dashboard has no items titled ${titles?.join(", ")}`);
  }
  const left = Math.min(...boxes.map((box) => box.left)) - DASHBOARD_MARGIN;
  const top = Math.min(...boxes.map((box) => box.top)) - DASHBOARD_MARGIN;
  const right = Math.max(...boxes.map((box) => box.right)) + DASHBOARD_MARGIN;
  const bottom = Math.max(...boxes.map((box) => box.bottom)) + DASHBOARD_MARGIN;
  return { x: left, y: top, width: Math.round(right - left), height: Math.round(bottom - top) };
}

/** Hides every dashboard item but the named ones. */
async function hide_other_items(page: Page, titles: readonly string[]) {
  await page.locator(".sheetwrite-dashboard-item").evaluateAll((items, kept) => {
    for (const item of items) {
      const title = item.querySelector(".sheetwrite-dashboard-item-title")?.textContent ?? "";
      if (!kept.includes(title)) (item as HTMLElement).style.visibility = "hidden";
    }
  }, titles);
}

/** Two frames after the last change, so a panel's open transition has drawn. */
async function settle(page: Page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.waitForTimeout(300);
}

/** The clip of a `{ x, y }` crop: the shot's size from that point of the stage. */
async function crop_box(page: Page, crop: ShotPoint, size: ShotSize): Promise<Box> {
  const { width, height } = SHOT_SIZES[size];
  const stage = await stage_box(page);
  return { x: stage.x + crop.x, y: stage.y + crop.y, width, height };
}

async function stage_box(page: Page): Promise<Box> {
  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("The stage is not on the page");
  return box;
}

/** The background around a card's parts, in the card's own pixels. */
const CARD_MARGIN = 12;
/** A card draws its parts at most this much larger than the app does… */
const CARD_MAX_SCALE = 1.2;
/** …and at least this large: smaller, their text is too small to read on the card. */
const CARD_MIN_SCALE = 0.7;
/** A card's parts are captured at this many times the card's scale, then fitted. */
const CARD_OVERSAMPLING = 2;
/** Orders rows the cut check looks at: more than any stage shows. */
const ORDERS_ROWS_CHECKED = 40;
/** How far past an edge a box may reach and still count as inside: subpixel layout. */
const EDGE_TOLERANCE = 0.5;

function union_box(boxes: readonly Box[]): Box {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The box of a block of Orders cells, from the site theme's grid geometry. */
async function orders_cells_box(page: Page, cells: CellBlock): Promise<Box> {
  const grid = await page.locator(".sheetwrite-shell-grid").boundingBox();
  if (grid === null) throw new Error("The grid is not on the page");
  const left = ORDERS_COLUMN_EDGES[cells.left];
  const right = ORDERS_COLUMN_EDGES[cells.right + 1];
  if (left === undefined || right === undefined) {
    throw new Error(`Orders has no columns ${cells.left} to ${cells.right}`);
  }
  return {
    x: grid.x + left,
    y: grid.y + HEADER_HEIGHT + cells.top * ROW_HEIGHT,
    width: right - left,
    height: (cells.bottom - cells.top + 1) * ROW_HEIGHT,
  };
}

/** The box around a card's parts, cells and area. */
async function card_box(page: Page, crop: CardCrop): Promise<Box> {
  const boxes: Box[] = [];
  for (const selector of crop.parts) {
    const part = page.locator(selector);
    const count = await part.count();
    if (count !== 1) throw new Error(`The card part ${selector} matches ${count} elements`);
    const box = await part.boundingBox();
    if (box === null) throw new Error(`The card part ${selector} is not shown`);
    boxes.push(box);
  }
  if (crop.cells !== undefined) boxes.push(await orders_cells_box(page, crop.cells));
  if (crop.area !== undefined) {
    const stage = await stage_box(page);
    boxes.push({ ...crop.area, x: stage.x + crop.area.x, y: stage.y + crop.area.y });
  }
  if (boxes.length === 0) throw new Error("A card crop needs parts, cells or an area");
  const box = union_box(boxes);
  if (crop.across === undefined) return box;
  const span = await page.locator(crop.across).boundingBox();
  if (span === null) throw new Error(`The card's span ${crop.across} is not shown`);
  return { ...box, x: span.x, width: span.width };
}

/** Every Orders cell, column header and row number, labelled, for the cut check. */
async function orders_cell_boxes(page: Page): Promise<(Box & { label: string })[]> {
  const grid = await page.locator(".sheetwrite-shell-grid").boundingBox();
  if (grid === null) throw new Error("The grid is not on the page");
  const [row_numbers_right = 0, ...edges] = ORDERS_COLUMN_EDGES;
  const boxes: (Box & { label: string })[] = [];
  let left = row_numbers_right;
  for (const [col, right] of edges.entries()) {
    const letter = String.fromCharCode("A".charCodeAt(0) + col);
    const x = grid.x + left;
    const width = right - left;
    boxes.push({ x, y: grid.y, width, height: HEADER_HEIGHT, label: `column ${letter}` });
    for (let row = 0; row < ORDERS_ROWS_CHECKED; row += 1) {
      const y = grid.y + HEADER_HEIGHT + row * ROW_HEIGHT;
      boxes.push({ x, y, width, height: ROW_HEIGHT, label: `${letter}${row + 1}` });
      if (col === 0) {
        boxes.push({
          x: grid.x,
          y,
          width: row_numbers_right,
          height: ROW_HEIGHT,
          label: `row ${row + 1}`,
        });
      }
    }
    left = right;
  }
  return boxes;
}

/**
 * What `box` cuts through: each visible text, control and, on the Orders
 * sheet, each grid cell that is partly inside it. A thing covered at that
 * point (by a dialog or a menu) is not cut; nor is a `cut_through` field,
 * though its own text is.
 */
async function cut_by_box(
  page: Page,
  box: Box,
  cut_through: readonly string[],
  cells: readonly (Box & { label: string })[],
): Promise<string[]> {
  return page.evaluate(
    ({ box, cutThrough: cut_through, cells, tolerance }) => {
      const right = box.x + box.width;
      const bottom = box.y + box.height;
      const is_cut = (rect: DOMRect) =>
        rect.width > 0 &&
        rect.height > 0 &&
        rect.left < right - tolerance &&
        rect.right > box.x + tolerance &&
        rect.top < bottom - tolerance &&
        rect.bottom > box.y + tolerance &&
        (rect.left < box.x - tolerance ||
          rect.right > right + tolerance ||
          rect.top < box.y - tolerance ||
          rect.bottom > bottom + tolerance);
      // The element on top where `rect` meets the box: tells a shown thing from a covered one.
      const topmost_inside = (rect: DOMRect) =>
        document.elementFromPoint(
          (Math.max(rect.left, box.x) + Math.min(rect.right, right)) / 2,
          (Math.max(rect.top, box.y) + Math.min(rect.bottom, bottom)) / 2,
        );
      const exempt = cut_through.flatMap((selector) => [...document.querySelectorAll(selector)]);
      const cut: string[] = [];
      // Hidden text and fields: screen-reader-only (a 1 px box clipped out of
      // sight) or hidden with visibility, as the card's `hide` does.
      const is_visually_hidden = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width <= 1 || rect.height <= 1 || getComputedStyle(element).visibility !== "visible"
        );
      };

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = node.textContent?.trim();
        const owner = node.parentElement;
        if (!text || owner === null || is_visually_hidden(owner)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const shown_and_cut = [...range.getClientRects()].some((rect) => {
          if (!is_cut(rect)) return false;
          const hit = topmost_inside(rect);
          return hit !== null && (owner.contains(hit) || hit.contains(owner));
        });
        if (shown_and_cut) cut.push(`"${text.slice(0, 40)}"`);
      }

      const controls = "button, input, select, textarea, [role=button], [role=tab], [role=option]";
      for (const control of document.querySelectorAll(controls)) {
        if (exempt.some((field) => field.contains(control)) || is_visually_hidden(control))
          continue;
        const rect = control.getBoundingClientRect();
        if (!is_cut(rect)) continue;
        const hit = topmost_inside(rect);
        if (hit !== null && (control.contains(hit) || hit.contains(control))) {
          const name = `${control.tagName.toLowerCase()}.${[...control.classList].join(".")}`;
          cut.push(`<${name}> ${control.textContent?.trim().slice(0, 30) ?? ""}`);
        }
      }

      for (const cell of cells) {
        const rect = DOMRect.fromRect(cell);
        if (!is_cut(rect)) continue;
        // The grid draws its cells on a canvas under transparent overlay
        // layers; a cell shows unless something with a background (a menu,
        // a dialog, a panel) is on top of it there.
        const hit = topmost_inside(rect);
        const grid = hit?.closest(".sheetwrite-shell-grid");
        let covered = hit === null || grid === null || grid === undefined;
        for (
          let node = hit;
          !covered && node !== null && node !== grid;
          node = node.parentElement
        ) {
          const background = getComputedStyle(node).backgroundColor;
          covered = background !== "rgba(0, 0, 0, 0)" && background !== "transparent";
        }
        if (!covered) cut.push(`cell ${cell.label}`);
      }
      return cut;
    },
    { box, cutThrough: cut_through, cells, tolerance: EDGE_TOLERANCE },
  );
}

/** The background the nearest painted ancestor of `selector`'s element shows. */
async function background_behind(page: Page, selector: string): Promise<string> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      for (let node = element.parentElement; node !== null; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor;
        if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
      }
      return getComputedStyle(document.body).backgroundColor;
    });
}

/**
 * Writes a highlight card: the parts' box, checked to cut nothing, fitted
 * into the card's frame on the background behind them.
 */
async function capture_card(
  browser: Browser,
  page: Page,
  shot: Shot,
  crop: CardCrop,
  scale: number,
  png: string,
) {
  await crop.steps?.(page);
  for (const selector of crop.hide ?? []) {
    await page.locator(selector).evaluateAll((elements) => {
      for (const element of elements) (element as HTMLElement).style.visibility = "hidden";
    });
  }
  const box = await card_box(page, crop);
  const cells = shot.query.sheet === "orders" ? await orders_cell_boxes(page) : [];
  const cut = await cut_by_box(page, box, crop.cutThrough ?? [], cells);
  if (cut.length > 0) throw new Error(`${shot.name} crops through ${cut.join(", ")}`);

  const card = SHOT_SIZES.highlight;
  const fit = Math.min(
    (card.width - 2 * CARD_MARGIN) / box.width,
    (card.height - 2 * CARD_MARGIN) / box.height,
    CARD_MAX_SCALE,
  );
  if (fit < CARD_MIN_SCALE) {
    throw new Error(
      `${shot.name}'s ${Math.round(box.width)}×${Math.round(box.height)} px parts fit its card only at ${fit.toFixed(2)}×; show fewer parts`,
    );
  }
  const background = await background_behind(page, crop.parts[0] ?? ".sheetwrite-shell-grid");
  const image = await page.screenshot({ clip: box, animations: "disabled" });
  const frame = await browser.newPage({ viewport: card, deviceScaleFactor: scale });
  try {
    await frame.setContent(
      `<body style="margin:0;display:grid;place-items:center;width:${card.width}px;height:${card.height}px;background:${background}">` +
        `<img alt="" style="width:${box.width * fit}px;height:${box.height * fit}px" src="data:image/png;base64,${image.toString("base64")}"></body>`,
    );
    await frame.locator("img").evaluate((element) => (element as HTMLImageElement).decode());
    await frame.screenshot({ path: png });
  } finally {
    await frame.close();
  }
}

function is_card_crop(crop: Shot["crop"]): crop is CardCrop {
  return typeof crop === "object" && "parts" in crop;
}

async function capture(shot: Shot, origin: string, scratch: string) {
  // An items crop renders on a tall stage of the capture's width, then keeps the
  // items; other crops render on their own stage size, then keep the shot's size.
  const { width } = SHOT_SIZES[shot.stage ?? shot.size];
  const height =
    shot.crop === "items" ? STAGE_HEIGHT_FOR_CROP : SHOT_SIZES[shot.stage ?? shot.size].height;
  const browser = await chromium.launch();
  try {
    for (const theme of THEMES)
      for (const scale of SCALES) {
        const page = await browser.newPage({
          viewport: { width, height },
          deviceScaleFactor: is_card_crop(shot.crop) ? scale * CARD_OVERSAMPLING : scale,
          colorScheme: theme,
          locale: "en-US",
          timezoneId: "UTC",
          // Cut writes the clipboard before it marks the cells, as in a browser tab.
          permissions: ["clipboard-read", "clipboard-write"],
        });
        const query = new URLSearchParams({
          ...shot.query,
          theme,
          width: String(width),
          height: String(height),
        });
        // Dates in the captures, such as a version's time, read the same on every run.
        await page.clock.setFixedTime(CAPTURE_TIME);
        // A stage that throws fails the capture at once, with its error.

        const failed = new Promise<never>((_, reject) => page.once("pageerror", reject));

        await page.goto(`${origin}/${shot.stagePage ?? ""}?${query}`);

        await Promise.race([
          page.waitForSelector("html[data-figure-ready]", {
            state: "attached",
            timeout: READY_TIMEOUT_MS,
          }),

          failed,
        ]);
        await shot.steps?.(page);
        const png = join(scratch, `${shot.name}-${theme}-${scale}x.png`);
        if (shot.crop === "items") {
          const clip = await items_box(page, shot.cropItems);
          // The crop's margin reaches into the neighbouring items; hide them, so
          // it shows the dashboard's background as an all-items crop does.
          if (shot.cropItems !== undefined) await hide_other_items(page, shot.cropItems);
          const expected = SHOT_SIZES[shot.size];
          if (clip.width !== expected.width || clip.height !== expected.height) {
            throw new Error(`${shot.name} crops to ${clip.width}×${clip.height}, not its size`);
          }
          await page.screenshot({ path: png, clip, animations: "disabled" });
        } else if (is_card_crop(shot.crop)) {
          await capture_card(browser, page, shot, shot.crop, scale, png);
        } else if (shot.crop !== undefined) {
          const clip = await crop_box(page, shot.crop, shot.size);
          await page.screenshot({ path: png, clip, animations: "disabled" });
        } else {
          await page.locator("#stage").screenshot({ path: png, animations: "disabled" });
        }
        const avif = join(OUTPUT, basename(shotUrl(shot.name, theme, scale)));
        execFileSync("avifenc", [...AVIF_ARGS, png, avif], { stdio: "ignore" });
        console.log(`${avif.slice(ROOT.length + 1)}  ${statSync(avif).size} B`);
        await page.close();
      }
  } finally {
    await browser.close();
  }
}

const wanted = new Set(process.argv.slice(2));
const unknown = [...wanted].filter((name) => !SHOTS.some((shot) => shot.name === name));
if (unknown.length > 0) throw new Error(`Unknown shots: ${unknown.join(", ")}`);

mkdirSync(OUTPUT, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "sheetwrite-shots-"));
const server = await createServer({
  configFile: false,
  root: STAGE,
  // Its own dependency cache, so a running docs dev server keeps its own.
  cacheDir: join(scratch, "vite"),
  logLevel: "warn",
  server: { port: 0, host: "127.0.0.1", fs: { allow: [ROOT] } },
});
await server.listen();
const address = server.httpServer?.address();
if (address === null || typeof address !== "object") throw new Error("The stage did not start");
try {
  for (const shot of SHOTS)
    if (wanted.size === 0 || wanted.has(shot.name))
      await capture(shot, `http://127.0.0.1:${address.port}`, scratch);
} finally {
  await server.close();
  rmSync(scratch, { recursive: true, force: true });
}
