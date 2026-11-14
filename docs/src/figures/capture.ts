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

/** One screenshot: the stage query, its size, and the steps that open its view. */
interface Shot {
  name: string;
  /** The size of the written capture. */
  size: ShotSize;
  /** `items`: keep only the dashboard's items, with the dashboard's 12 px margin. */
  crop?: "items";
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

const SHOTS: readonly Shot[] = [
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
      await page.keyboard.type("EMEA");
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
  { name: "report", size: "app", query: { sheet: "report" } },
  {
    name: "fonts",
    size: "panel",
    query: { sheet: "report" },
    steps: (page) => select(page, { kind: "cell", addr: { sheet: "report", row: 2, col: 6 } }),
  },
  {
    name: "number-formats",
    size: "panel",
    query: { sheet: "report" },
    steps: async (page) => {
      await select(page, { kind: "cell", addr: { sheet: "report", row: 2, col: 4 } });
      await page.getByRole("button", { name: "Number", exact: true }).first().click();
      await settle(page);
    },
  },
  {
    name: "chart",
    size: "panel",
    query: { sheet: "report", ribbon: "compact" },
    steps: async (page) => {
      await page.evaluate(() =>
        window.__sheetwriteFigureGrid?.scrollToCell({ sheet: "report", row: 6, col: 0 }),
      );
      await settle(page);
    },
  },
  {
    name: "validation",
    size: "panel",
    query: { sheet: "report", ribbon: "compact" },
    steps: async (page) => {
      await select(page, { kind: "cell", addr: { sheet: "report", row: 3, col: 5 } });
      await page.keyboard.press("Alt+ArrowDown");
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
  {
    name: "filter",
    size: "panel",
    query: { sheet: "orders", ribbon: "compact" },
    steps: async (page) => {
      await select(page, { kind: "cell", addr: { sheet: "orders", row: 0, col: 1 } });
      await page.getByRole("tab", { name: "Data", exact: true }).click();
      await page
        .getByRole("button", { name: /Filter/ })
        .first()
        .click();
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

async function capture(shot: Shot, origin: string, scratch: string) {
  // An items crop renders on a tall stage of the capture's width, then keeps the items.
  const { width } = SHOT_SIZES[shot.size];
  const height = shot.crop === "items" ? STAGE_HEIGHT_FOR_CROP : SHOT_SIZES[shot.size].height;
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
