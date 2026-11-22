import type { Page } from "@playwright/test";

import type { Grid, PagedStoreStats } from "../../packages/core/src/types.js";
import { expect, fitsViewport, test } from "./fixtures.js";

declare global {
  interface Window {
    __sheetwriteScaleGrid?: Grid;
  }
}

const GRID = '[data-testid="scale-grid"]';
const ROWS = 1_000_000;
const COLUMNS = 1_000;
const CACHE_BUDGET_BYTES = 32 * 1024 * 1024;
const STRESS_CACHE_BYTES = 1024 * 1024;

interface WindowReadout {
  firstRow: number;
  lastRow: number;
  firstColumn: number;
  lastColumn: number;
  selected: string;
}

function column_index(label: string): number {
  let value = 0;
  for (const character of label) value = value * 26 + character.charCodeAt(0) - 64;
  return value - 1;
}

function numeric_text(text: string | null): number {
  return Number((text ?? "").replace(/,/g, "").replace(/[^\d.]/g, ""));
}

function paged_stats(page: Page): Promise<PagedStoreStats | null> {
  return page.evaluate(() => {
    const store = window.__sheetwriteScaleGrid?.store;
    if (!store || !("getPagedStats" in store) || typeof store.getPagedStats !== "function") {
      return null;
    }
    return store.getPagedStats("scale") as PagedStoreStats;
  });
}

function load_state(page: Page, row: number, col: number): Promise<string | undefined> {
  return page.evaluate(
    ({ row, col }) =>
      window.__sheetwriteScaleGrid?.store.getCellLoadState?.({ sheet: "scale", row, col }),
    { row, col },
  );
}

function resolved(page: Page, row: number, col: number): Promise<unknown> {
  return page.evaluate(
    ({ row, col }) =>
      window.__sheetwriteScaleGrid?.store.getCell({ sheet: "scale", row, col }).resolved,
    { row, col },
  );
}

async function boot_scale(page: Page): Promise<void> {
  await page.goto("/showcases/performance/");
  await page.waitForSelector(`${GRID} canvas`, { state: "attached", timeout: 20_000 });
  await expect
    .poll(async () => (await paged_stats(page))?.loadedCells ?? 0, { timeout: 20_000 })
    .toBeGreaterThan(0);
}

/** The public window readout, checked against its row and column headers. */
async function read_window(page: Page): Promise<WindowReadout> {
  // One snapshot: the readouts move together while the grid scrolls.
  const {
    windowText: window_text,
    rowText: row_text,
    columnText: column_text,
    selected,
  } = await page.evaluate(() => {
    const text = (test_id: string) =>
      document.querySelector(`[data-testid="${test_id}"]`)?.textContent ?? null;
    return {
      windowText: text("scale-window-a1"),
      rowText: text("scale-window-rows"),
      columnText: text("scale-window-columns"),
      selected: text("scale-current-a1"),
    };
  });
  const window_match = window_text?.trim().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  const row_match = row_text?.trim().match(/^(\d+)–(\d+)$/);
  const column_match = column_text?.trim().match(/^([A-Z]+)–([A-Z]+)$/);
  if (!window_match || !row_match || !column_match) {
    throw new Error(
      `Malformed readout: ${JSON.stringify({ windowText: window_text, rowText: row_text, columnText: column_text })}`,
    );
  }
  const readout = {
    firstRow: Number(window_match[2]),
    lastRow: Number(window_match[4]),
    firstColumn: column_index(window_match[1] ?? ""),
    lastColumn: column_index(window_match[3] ?? ""),
    selected: selected?.trim() ?? "",
  };
  expect([readout.firstRow, readout.lastRow]).toEqual([Number(row_match[1]), Number(row_match[2])]);
  expect([readout.firstColumn, readout.lastColumn]).toEqual([
    column_index(column_match[1] ?? ""),
    column_index(column_match[2] ?? ""),
  ]);
  return readout;
}

async function jump(page: Page, row: number, column: number): Promise<void> {
  await page.getByTestId("scale-jump-row").fill(String(row));
  await page.getByTestId("scale-jump-column").fill(String(column));
  await page.getByTestId("scale-jump").click();
}

/** A viewport point inside the visible body cell, scrolling the page to it if needed. */
async function grid_body_point(page: Page, row: number, column: number) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const point = await page.evaluate(
      ({ row, column }) => {
        const host = document.querySelector<HTMLElement>('[data-testid="scale-grid"]');
        const grid = window.__sheetwriteScaleGrid;
        if (!host || !grid) return null;
        const rect = host.getBoundingClientRect();
        for (let y = rect.top + 36; y < rect.bottom; y += 8) {
          for (let x = rect.left + 72; x < rect.right; x += 8) {
            const address = grid.getCellAtPoint(x, y);
            if (address?.row === row && address.col === column) return { x, y };
          }
        }
        return null;
      },
      { row, column },
    );
    if (!point) throw new Error(`Could not locate visible cell r${row} c${column}`);
    const viewport = page.viewportSize();
    if (viewport === null || (point.y >= 0 && point.y < viewport.height)) return point;
    await page.evaluate((delta) => window.scrollBy(0, delta), point.y - viewport.height / 2);
  }
  throw new Error(`Could not bring cell r${row} c${column} into the viewport`);
}

test("a distant physical edit survives clean-tile eviction, far horizontal motion, and revisit", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const edit_row = 741_999;
  const clean_row = 737_903;
  const column = 3;
  await boot_scale(page);
  const grid = page.locator(GRID);
  await page.getByTestId("scale-eviction-stress").click();
  await expect(grid).toHaveAttribute("data-cache-bytes", String(STRESS_CACHE_BYTES));
  const chunk_rows = Number(await grid.getAttribute("data-chunk-rows"));
  expect(chunk_rows).toBeGreaterThan(0);

  // Load a clean comparison tile, then the edit target.
  await jump(page, clean_row + 1, column + 1);
  await expect(page.getByTestId("scale-current-a1")).toHaveText(`D${clean_row + 1}`);
  await expect.poll(() => load_state(page, clean_row, column)).toBe("loaded-value");
  await jump(page, edit_row + 1, column + 1);
  await expect(page.getByTestId("scale-current-a1")).toHaveText(`D${edit_row + 1}`);
  await expect
    .poll(() => load_state(page, edit_row, column), { timeout: 20_000 })
    .toBe("loaded-value");

  // Edit through the real pointer, F2 and editor path.
  await grid.scrollIntoViewIfNeeded();
  const target = await grid_body_point(page, edit_row, column);
  await page.mouse.click(target.x, target.y);
  await expect(page.getByTestId("scale-current-a1")).toHaveText(`D${edit_row + 1}`);
  await expect(grid).toBeFocused();
  await page.keyboard.press("F2");
  await page.locator(`${GRID} .sheetwrite-editor`).fill("777777");
  await page.keyboard.press("Enter");
  await expect.poll(() => resolved(page, edit_row, column)).toBe(777_777);

  // Far horizontal motion past column 900.
  const box = await grid.boundingBox();
  if (!box) throw new Error("Grid has no physical bounds");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  let first_column = (await read_window(page)).firstColumn;
  for (let motion = 0; motion < 34 && first_column <= 900; motion += 1) {
    const previous = first_column;
    await page.mouse.wheel(3_600, 0);
    await expect
      .poll(async () => {
        first_column = (await read_window(page)).firstColumn;
        return first_column;
      })
      .toBeGreaterThan(previous);
  }
  const far_window = await read_window(page);
  expect(far_window.firstColumn).toBeGreaterThan(900);
  expect(far_window.lastColumn).toBeLessThan(COLUMNS);

  // Churn distant tiles until the clean tile is evicted; the edit must stay.
  for (const landmark of ["0", "25", "100", "0", "25"]) {
    await page.getByTestId(`scale-landmark-${landmark}`).click();
    await page.waitForTimeout(250);
  }
  let clean_state: string | undefined;
  for (let visit = 0; visit < 128 && clean_state !== "unloaded"; visit += 1) {
    const row = 10_000 + visit * 7_500;
    const visit_column = 1 + ((visit * 113) % 990);
    const chunk = Math.floor((row - 1) / chunk_rows);
    if (
      chunk === Math.floor(clean_row / chunk_rows) ||
      chunk === Math.floor(edit_row / chunk_rows)
    ) {
      continue;
    }
    await jump(page, row, visit_column);
    await expect.poll(() => load_state(page, row - 1, visit_column - 1)).toMatch(/loaded/);
    clean_state = await load_state(page, clean_row, column);
  }
  expect(clean_state, "churn never evicted the watched clean tile").toBe("unloaded");
  expect(await load_state(page, edit_row, column)).toBe("local-edit");
  await expect(page.getByTestId("scale-eviction-watch")).toHaveAttribute(
    "data-clean-state",
    "unloaded",
  );
  const after_eviction = await paged_stats(page);
  expect(after_eviction?.allocatedBytes).toBeLessThanOrEqual(STRESS_CACHE_BYTES);
  expect(after_eviction?.dirtyCells).toBe(1);
  const amplification = Number(await page.getByTestId("scale-column-amplification").textContent());
  expect(amplification).toBeLessThanOrEqual(far_window.lastColumn - far_window.firstColumn + 11);
  expect(amplification).toBeLessThan(64);

  await jump(page, edit_row + 1, column + 1);
  await expect(page.getByTestId("scale-current-a1")).toHaveText(`D${edit_row + 1}`);
  await expect.poll(() => resolved(page, edit_row, column)).toBe(777_777);
});

test.describe("on a phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("a tap selects and a touch drag scrolls the billion-cell grid, which fits the page", async ({
    page,
  }) => {
    await boot_scale(page);
    const grid = page.locator(GRID);
    await grid.scrollIntoViewIfNeeded();
    const box = await grid.boundingBox();
    if (!box) throw new Error("Mobile Grid has no physical bounds");
    expect(box.width).toBeGreaterThan(200);
    const before_tap = await read_window(page);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(async () => (await read_window(page)).selected).not.toBe(before_tap.selected);

    // A real touch drag through the DevTools protocol, upward by 60% of the grid.
    const before_touch = await read_window(page);
    const session = await page.context().newCDPSession(page);
    const x = Math.round(box.x + box.width / 2);
    const start_y = Math.round(box.y + box.height * 0.8);
    const end_y = Math.round(box.y + box.height * 0.2);
    const touch_steps = 8;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: start_y, id: 1 }],
    });
    for (let step = 1; step <= touch_steps; step += 1) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x, y: Math.round(start_y + ((end_y - start_y) * step) / touch_steps), id: 1 },
        ],
      });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect
      .poll(async () => (await read_window(page)).firstRow)
      .toBeGreaterThan(before_touch.firstRow);
    expect(await fitsViewport(page)).toBe(true);
  });
});

/** A landmark row's period is #LOADING! until its page loads, never a stale value, then the period. */
async function assert_loaded_period_without_stale_flash(page: Page, row: number): Promise<void> {
  const expected_period = `FY${2024 + (Math.floor(row / 12) % 5)} P${String((row % 12) + 1).padStart(2, "0")}`;
  for (let sample = 0; sample < 8; sample += 1) {
    const { state, value } = await page.evaluate((target_row) => {
      const store = window.__sheetwriteScaleGrid?.store;
      const addr = { sheet: "scale", row: target_row, col: 0 };
      return { state: store?.getCellLoadState?.(addr), value: store?.getCell(addr).resolved };
    }, row);
    expect(value).toBe(state === "unloaded" ? "#LOADING!" : expected_period);
    await page.waitForTimeout(20);
  }
  await expect.poll(() => resolved(page, row, 0), { timeout: 20_000 }).toBe(expected_period);
}

test("the live Grid is exactly one billion logical addresses with bounded pages, and its navigators agree with the window headers", async ({
  page,
}) => {
  await boot_scale(page);
  const workbook = await page.evaluate(() => window.__sheetwriteScaleGrid?.store.getWorkbook());
  expect(workbook?.sheets).toHaveLength(1);
  expect(workbook?.sheets[0]?.rowCount).toBe(ROWS);
  expect(workbook?.sheets[0]?.columns).toHaveLength(COLUMNS);
  await expect(page.getByTestId("scale-grid")).toHaveAttribute(
    "data-cache-bytes",
    String(CACHE_BUDGET_BYTES),
  );
  const stats = await paged_stats(page);
  expect(stats?.fullyLoaded).toBe(false);
  expect(stats?.allocatedBytes).toBeLessThanOrEqual(CACHE_BUDGET_BYTES);
  expect(stats?.loadedCells).toBeLessThan(ROWS * COLUMNS);
  const opening = await read_window(page);
  expect([opening.firstRow, opening.firstColumn]).toEqual([1, 0]);
  await expect(page.getByTestId("scale-last-band")).toContainText("columns");
  for (const counter of ["scale-requested-cells", "scale-returned-cells"]) {
    expect(numeric_text(await page.getByTestId(counter).textContent())).toBeGreaterThan(0);
  }
  // Whole-sheet scans and exports refuse a partly loaded store.
  await page.getByTestId("scale-global-details").locator("summary").click();
  for (const action of ["scan", "export"]) {
    await page.getByTestId(`scale-${action}-attempt`).click();
    const report = page.getByTestId(`scale-${action}-report`);
    await expect(report).toHaveAttribute("data-state", "incomplete");
    await expect(report).toContainText("IncompleteDataError");
  }
  await expect(page.getByTestId("scale-query-state")).toContainText("incomplete");

  const grid = page.locator(GRID);
  await grid.scrollIntoViewIfNeeded();
  const box = await grid.boundingBox();
  if (!box) throw new Error("Grid has no physical bounds");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  const initial = await read_window(page);
  await page.mouse.wheel(0, 1_800);
  await expect
    .poll(async () => (await read_window(page)).firstRow)
    .toBeGreaterThan(initial.firstRow);
  const after_wheel = await read_window(page);

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("PageDown");
  await expect
    .poll(async () => (await read_window(page)).firstRow)
    .toBeGreaterThan(after_wheel.firstRow);
  const after_page_down = await read_window(page);
  await page.keyboard.press("PageUp");
  await expect
    .poll(async () => (await read_window(page)).firstRow)
    .toBeLessThan(after_page_down.firstRow);

  const landmark_rows: number[] = [];
  for (const [landmark, selected, data_row] of [
    ["25", "A250001", 250_000],
    ["50", "A500001", 500_000],
    ["75", "A750000", 749_999],
    ["100", "A1000000", 999_999],
  ] as const) {
    await page.getByTestId(`scale-landmark-${landmark}`).click();
    await expect(page.getByTestId("scale-current-a1")).toHaveText(selected);
    await expect
      .poll(async () => {
        const rows = (await page.getByTestId("scale-window-rows").textContent())?.match(
          /([\d,]+)\s*–\s*([\d,]+)/,
        );
        return numeric_text(rows?.[2] ?? null);
      })
      .toBeGreaterThanOrEqual(data_row + 1);
    const readout = await read_window(page);
    expect(readout.firstRow).toBeLessThanOrEqual(data_row + 1);
    expect(readout.lastRow).toBeGreaterThanOrEqual(data_row + 1);
    landmark_rows.push(readout.firstRow);
    await assert_loaded_period_without_stale_flash(page, data_row);
  }
  expect(landmark_rows[0]).toBeLessThan(landmark_rows[1]!);
  expect(landmark_rows[1]).toBeLessThan(landmark_rows[2]!);
  expect(landmark_rows[2]).toBeLessThan(landmark_rows[3]!);

  const rail = page.getByTestId("scale-overview");
  // The rail sits under the grid; the mouse reaches only what is on screen.
  await rail.scrollIntoViewIfNeeded();
  const rail_box = await rail.boundingBox();
  if (!rail_box) throw new Error("Overview rail has no physical bounds");
  await page.mouse.move(rail_box.x + rail_box.width * 0.02, rail_box.y + rail_box.height / 2);
  await page.mouse.down();
  await page.mouse.move(rail_box.x + rail_box.width * 0.55, rail_box.y + rail_box.height / 2, {
    steps: 14,
  });
  await page.mouse.up();
  await expect.poll(async () => (await read_window(page)).firstRow).toBeLessThan(landmark_rows[2]!);
  await read_window(page);

  const column_rail = page.getByTestId("scale-column-overview");
  await column_rail.focus();
  await page.keyboard.press("End");
  await expect(page.getByTestId("scale-current-a1")).toHaveText(/^ALL\d+$/);
  await expect.poll(async () => (await read_window(page)).firstColumn).toBeGreaterThan(900);
  await expect(page.getByTestId("scale-selected-formula")).toHaveText(/^=/);
});
