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

import { chromium, type Page } from "@playwright/test";
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
   * `panel`: the shot's size from the side panel's top-right corner, with the grid beside it.
   * `{ x, y }`: the shot's size from that point of the stage.
   * `{ dialog: { x, y } }`: the shot's size from that point of the open grid dialog.
   */
  crop?: "items" | "panel" | ShotPoint | { readonly dialog: ShotPoint };
  /** The size of the stage a `panel`, `{ x, y }` or dialog crop is taken from. */
  stage?: ShotSize;
  /** With `crop: "items"`, the titles of the items to keep; every item by default. */
  cropItems?: readonly string[];
  query: Record<string, string>;
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
async function selectRows(page: Page, rows: number) {
  await page.locator(".sheetwrite-shell-grid").click({ position: { x: 80, y: 44 } });
  await page.keyboard.down("Shift");
  for (let row = 1; row < rows; row += 1) await page.keyboard.press("ArrowDown");
  for (let col = 1; col < 5; col += 1) await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Shift");
}

/** The site theme's grid geometry in CSS pixels: the column header, one row, the row numbers. */
const HEADER_HEIGHT = 32;
const ROW_HEIGHT = 28;
/** The left edge of the Orders columns A to E inside the grid, then the right edge of E. */
const ORDERS_COLUMN_EDGES = [48, 144, 248, 376, 456, 568] as const;

/** A point in the grid element: the middle of a cell by its row and column from 0. */
function cellPoint(row: number, col: number) {
  const left = ORDERS_COLUMN_EDGES[col];
  const right = ORDERS_COLUMN_EDGES[col + 1];
  if (left === undefined || right === undefined) throw new Error(`Orders has no column ${col}`);
  return { x: (left + right) / 2, y: HEADER_HEIGHT + row * ROW_HEIGHT + ROW_HEIGHT / 2 };
}

/** An inclusive block of the Orders sheet, rows and columns from 0. */
function ordersRange(top: number, left: number, bottom: number, right: number) {
  return { sheet: "orders", start: { row: top, col: left }, end: { row: bottom, col: right } };
}

/** Select through the grid's API, then wait for the frame that shows it. */
async function select(page: Page, selection: GridSelection) {
  await page.evaluate((value) => window.__sheetwriteFigureGrid?.setSelection(value), selection);
  await settle(page);
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
  // PivotChart and pivot it filters, so the card does not repeat the hero.
  {
    name: "dashboard-filtered",
    size: "dashboardRow",
    query: { sheet: "dashboard", ribbon: "compact" },
    crop: "items",
    cropItems: ["Revenue by month", "Revenue by product"],
    steps: async (page) => {
      const slicer = page.locator(".sheetwrite-dashboard-slicer");
      for (const region of ["APAC", "Americas", "EMEA"])
        await slicer.getByRole("button", { name: region, exact: true }).click();
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
      await selectRows(page, 12);
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
    steps: (page) => select(page, { kind: "range", range: ordersRange(1, 3, 8, 4) }),
  },
  // The grid feature pages use the compact ribbon, so the grid gets the room.
  {
    name: "context-menu",
    size: "panel",
    query: { sheet: "orders", ribbon: "compact" },
    steps: async (page) => {
      await page
        .locator(".sheetwrite-shell-grid")
        .click({ button: "right", position: cellPoint(1, 1) });
      await settle(page);
    },
  },
  {
    name: "editing",
    size: "panel",
    query: { sheet: "orders", ribbon: "compact" },
    steps: async (page) => {
      await page.locator(".sheetwrite-shell-grid").dblclick({ position: cellPoint(7, 1) });
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
      await select(page, { kind: "range", range: ordersRange(1, 3, 2, 3) });
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
      await page.locator(".sheetwrite-shell-grid").click({ position: cellPoint(1, 0) });
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
      select(page, { kind: "multi", ranges: [ordersRange(1, 1, 3, 2), ordersRange(5, 3, 8, 4)] }),
  },
  {
    name: "status-bar",
    size: "panel",
    query: { sheet: "orders", ribbon: "compact" },
    steps: (page) => select(page, { kind: "range", range: ordersRange(1, 4, 12, 4) }),
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
      // Enter on a list cell opens its list; the grid host needs the keyboard focus first.
      await page.locator(".sheetwrite-shell-grid").focus();
      await page.keyboard.press("Enter");
      await settle(page);
    },
  },
  { name: "pivot-chart", size: "app", query: { sheet: "pivot" } },
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
      await select(page, { kind: "range", range: ordersRange(2, 2, 5, 4) });
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
      await select(page, { kind: "range", range: ordersRange(1, 3, 4, 4) });
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
  "pivot-chart": { tablet: { x: 360, y: 158 }, phone: { x: 48, y: 158 } },
  // The filtered columns; then Month, Region and Product.
  filter: { tablet: { x: 8, y: 0 }, phone: { x: 48, y: 66 } },
  // The formula bar over the sheet; then the formula over the selected cell.
  "formula-bar": { tablet: { x: 0, y: 0 }, phone: { x: 100, y: 66 } },
};

/**
 * The 0.7.0 highlight cards: a shot's view, cropped to the panel or control
 * the card is about, so it reads at a card's width on any screen.
 */
const CARD_CROPS: Readonly<Record<string, NonNullable<Shot["crop"]>>> = {
  "data-model": "panel",
  sort: "panel",
  "edit-links": "panel",
  queries: "panel",
  "version-history": "panel",
  // The formula bar and the argument guide under it.
  "formula-help": { x: 30, y: 100 },
  // The compact ribbon's group menus and the open Number menu.
  "compact-ribbon": { x: 160, y: 0 },
  // The Region column's filter dropdown: its value list with the row counts.
  autofilter: { x: 120, y: 270 },
  // The cut cells' moving border and the cell the paste would move them to.
  "cut-paste": { x: 240, y: 140 },
  // Each dialog from its tabs or its first group, without the window's edges.
  "paste-special": { dialog: { x: 16, y: 0 } },
  "data-validation": { dialog: { x: 12, y: 44 } },
  "format-cells": { dialog: { x: 12, y: 44 } },
  "keyboard-shortcuts": { dialog: { x: 12, y: 44 } },
  // The cell editor and the AutoComplete list of the entries it matches.
  autocomplete: { x: 40, y: 140 },
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
            stage: shot.size,
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
async function itemsBox(page: Page, titles?: readonly string[]) {
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
async function hideOtherItems(page: Page, titles: readonly string[]) {
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

/** The clip of a `panel` or `{ x, y }` crop: the shot's size, from the panel's top-right corner or the point. */
async function cropBox(
  page: Page,
  crop: "panel" | ShotPoint | { readonly dialog: ShotPoint },
  size: ShotSize,
) {
  const { width, height } = SHOT_SIZES[size];
  if (typeof crop === "object" && "dialog" in crop) {
    const box = await page.locator(".sheetwrite-dialog[open]").boundingBox();
    if (box === null) throw new Error("No grid dialog is open to crop to");
    return { x: box.x + crop.dialog.x, y: box.y + crop.dialog.y, width, height };
  }
  const box = await page
    .locator(crop === "panel" ? ".sheetwrite-panel-host" : "#stage")
    .boundingBox();
  if (box === null)
    throw new Error(
      crop === "panel" ? "No side panel is open to crop to" : "The stage is not on the page",
    );
  return crop === "panel"
    ? { x: box.x + box.width - width, y: box.y, width, height }
    : { x: box.x + crop.x, y: box.y + crop.y, width, height };
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
          deviceScaleFactor: scale,
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

        await page.goto(`${origin}/?${query}`);

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
          const clip = await itemsBox(page, shot.cropItems);
          // The crop's margin reaches into the neighbouring items; hide them, so
          // it shows the dashboard's background as an all-items crop does.
          if (shot.cropItems !== undefined) await hideOtherItems(page, shot.cropItems);
          const expected = SHOT_SIZES[shot.size];
          if (clip.width !== expected.width || clip.height !== expected.height) {
            throw new Error(`${shot.name} crops to ${clip.width}×${clip.height}, not its size`);
          }
          await page.screenshot({ path: png, clip, animations: "disabled" });
        } else if (shot.crop !== undefined) {
          const clip = await cropBox(page, shot.crop, shot.size);
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
