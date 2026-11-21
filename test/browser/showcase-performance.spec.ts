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

function columnIndex(label: string): number {
  let value = 0;
  for (const character of label) value = value * 26 + character.charCodeAt(0) - 64;
  return value - 1;
}

function numericText(text: string | null): number {
  return Number((text ?? "").replace(/,/g, "").replace(/[^\d.]/g, ""));
}

function pagedStats(page: Page): Promise<PagedStoreStats | null> {
  return page.evaluate(() => {
    const store = window.__sheetwriteScaleGrid?.store;
    if (!store || !("getPagedStats" in store) || typeof store.getPagedStats !== "function") {
      return null;
    }
    return store.getPagedStats("scale") as PagedStoreStats;
  });
}

function loadState(page: Page, row: number, col: number): Promise<string | undefined> {
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

async function bootScale(page: Page): Promise<void> {
  await page.goto("/showcases/performance/");
  await page.waitForSelector(`${GRID} canvas`, { state: "attached", timeout: 20_000 });
  await expect
    .poll(async () => (await pagedStats(page))?.loadedCells ?? 0, { timeout: 20_000 })
    .toBeGreaterThan(0);
}

/** The public window readout, checked against its row and column headers. */
async function readWindow(page: Page): Promise<WindowReadout> {
  // One snapshot: the readouts move together while the grid scrolls.
  const { windowText, rowText, columnText, selected } = await page.evaluate(() => {
    const text = (testId: string) =>
      document.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null;
    return {
      windowText: text("scale-window-a1"),
      rowText: text("scale-window-rows"),
      columnText: text("scale-window-columns"),
      selected: text("scale-current-a1"),
    };
  });
  const windowMatch = windowText?.trim().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  const rowMatch = rowText?.trim().match(/^(\d+)–(\d+)$/);
  const columnMatch = columnText?.trim().match(/^([A-Z]+)–([A-Z]+)$/);
  if (!windowMatch || !rowMatch || !columnMatch) {
    throw new Error(`Malformed readout: ${JSON.stringify({ windowText, rowText, columnText })}`);
  }
  const readout = {
    firstRow: Number(windowMatch[2]),
    lastRow: Number(windowMatch[4]),
    firstColumn: columnIndex(windowMatch[1] ?? ""),
    lastColumn: columnIndex(windowMatch[3] ?? ""),
    selected: selected?.trim() ?? "",
  };
  expect([readout.firstRow, readout.lastRow]).toEqual([Number(rowMatch[1]), Number(rowMatch[2])]);
  expect([readout.firstColumn, readout.lastColumn]).toEqual([
    columnIndex(columnMatch[1] ?? ""),
    columnIndex(columnMatch[2] ?? ""),
  ]);
  return readout;
}

async function jump(page: Page, row: number, column: number): Promise<void> {
  await page.getByTestId("scale-jump-row").fill(String(row));
  await page.getByTestId("scale-jump-column").fill(String(column));
  await page.getByTestId("scale-jump").click();
}

/** A viewport point inside the visible body cell, scrolling the page to it if needed. */
async function gridBodyPoint(page: Page, row: number, column: number) {
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
  const editRow = 741_999;
  const cleanRow = 737_903;
  const column = 3;
  await bootScale(page);
  const grid = page.locator(GRID);
  await page.getByTestId("scale-eviction-stress").click();
  await expect(grid).toHaveAttribute("data-cache-bytes", String(STRESS_CACHE_BYTES));
  const chunkRows = Number(await grid.getAttribute("data-chunk-rows"));
  expect(chunkRows).toBeGreaterThan(0);

  // Load a clean comparison tile, then the edit target.
  await jump(page, cleanRow + 1, column + 1);
  await expect(page.getByTestId("scale-current-a1")).toHaveText(`D${cleanRow + 1}`);
  await expect.poll(() => loadState(page, cleanRow, column)).toBe("loaded-value");
  await jump(page, editRow + 1, column + 1);
  await expect(page.getByTestId("scale-current-a1")).toHaveText(`D${editRow + 1}`);
  await expect
    .poll(() => loadState(page, editRow, column), { timeout: 20_000 })
    .toBe("loaded-value");

  // Edit through the real pointer, F2 and editor path.
  await grid.scrollIntoViewIfNeeded();
  const target = await gridBodyPoint(page, editRow, column);
  await page.mouse.click(target.x, target.y);
  await expect(page.getByTestId("scale-current-a1")).toHaveText(`D${editRow + 1}`);
  await expect(grid).toBeFocused();
  await page.keyboard.press("F2");
  await page.locator(`${GRID} .sheetwrite-editor`).fill("777777");
  await page.keyboard.press("Enter");
  await expect.poll(() => resolved(page, editRow, column)).toBe(777_777);

  // Far horizontal motion past column 900.
  const box = await grid.boundingBox();
  if (!box) throw new Error("Grid has no physical bounds");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  let firstColumn = (await readWindow(page)).firstColumn;
  for (let motion = 0; motion < 34 && firstColumn <= 900; motion += 1) {
    const previous = firstColumn;
    await page.mouse.wheel(3_600, 0);
    await expect
      .poll(async () => {
        firstColumn = (await readWindow(page)).firstColumn;
        return firstColumn;
      })
      .toBeGreaterThan(previous);
  }
  const farWindow = await readWindow(page);
  expect(farWindow.firstColumn).toBeGreaterThan(900);
  expect(farWindow.lastColumn).toBeLessThan(COLUMNS);

  // Churn distant tiles until the clean tile is evicted; the edit must stay.
  for (const landmark of ["0", "25", "100", "0", "25"]) {
    await page.getByTestId(`scale-landmark-${landmark}`).click();
    await page.waitForTimeout(250);
  }
  let cleanState: string | undefined;
  for (let visit = 0; visit < 128 && cleanState !== "unloaded"; visit += 1) {
    const row = 10_000 + visit * 7_500;
    const visitColumn = 1 + ((visit * 113) % 990);
    const chunk = Math.floor((row - 1) / chunkRows);
    if (chunk === Math.floor(cleanRow / chunkRows) || chunk === Math.floor(editRow / chunkRows)) {
      continue;
    }
    await jump(page, row, visitColumn);
    await expect.poll(() => loadState(page, row - 1, visitColumn - 1)).toMatch(/loaded/);
    cleanState = await loadState(page, cleanRow, column);
  }
  expect(cleanState, "churn never evicted the watched clean tile").toBe("unloaded");
  expect(await loadState(page, editRow, column)).toBe("local-edit");
  await expect(page.getByTestId("scale-eviction-watch")).toHaveAttribute(
    "data-clean-state",
    "unloaded",
  );
  const afterEviction = await pagedStats(page);
  expect(afterEviction?.allocatedBytes).toBeLessThanOrEqual(STRESS_CACHE_BYTES);
  expect(afterEviction?.dirtyCells).toBe(1);
  const amplification = Number(await page.getByTestId("scale-column-amplification").textContent());
  expect(amplification).toBeLessThanOrEqual(farWindow.lastColumn - farWindow.firstColumn + 11);
  expect(amplification).toBeLessThan(64);

  await jump(page, editRow + 1, column + 1);
  await expect(page.getByTestId("scale-current-a1")).toHaveText(`D${editRow + 1}`);
  await expect.poll(() => resolved(page, editRow, column)).toBe(777_777);
});

test.describe("on a phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("a tap selects and a touch drag scrolls the billion-cell grid, which fits the page", async ({
    page,
  }) => {
    await bootScale(page);
    const grid = page.locator(GRID);
    await grid.scrollIntoViewIfNeeded();
    const box = await grid.boundingBox();
    if (!box) throw new Error("Mobile Grid has no physical bounds");
    expect(box.width).toBeGreaterThan(200);
    const beforeTap = await readWindow(page);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(async () => (await readWindow(page)).selected).not.toBe(beforeTap.selected);

    // A real touch drag through the DevTools protocol, upward by 60% of the grid.
    const beforeTouch = await readWindow(page);
    const session = await page.context().newCDPSession(page);
    const x = Math.round(box.x + box.width / 2);
    const startY = Math.round(box.y + box.height * 0.8);
    const endY = Math.round(box.y + box.height * 0.2);
    const touchSteps = 8;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: startY, id: 1 }],
    });
    for (let step = 1; step <= touchSteps; step += 1) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: Math.round(startY + ((endY - startY) * step) / touchSteps), id: 1 }],
      });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect
      .poll(async () => (await readWindow(page)).firstRow)
      .toBeGreaterThan(beforeTouch.firstRow);
    expect(await fitsViewport(page)).toBe(true);
  });
});

/** A landmark row's period is #LOADING! until its page loads, never a stale value, then the period. */
async function assertLoadedPeriodWithoutStaleFlash(page: Page, row: number): Promise<void> {
  const expectedPeriod = `FY${2024 + (Math.floor(row / 12) % 5)} P${String((row % 12) + 1).padStart(2, "0")}`;
  for (let sample = 0; sample < 8; sample += 1) {
    const { state, value } = await page.evaluate((targetRow) => {
      const store = window.__sheetwriteScaleGrid?.store;
      const addr = { sheet: "scale", row: targetRow, col: 0 };
      return { state: store?.getCellLoadState?.(addr), value: store?.getCell(addr).resolved };
    }, row);
    expect(value).toBe(state === "unloaded" ? "#LOADING!" : expectedPeriod);
    await page.waitForTimeout(20);
  }
  await expect.poll(() => resolved(page, row, 0), { timeout: 20_000 }).toBe(expectedPeriod);
}

test("the live Grid is exactly one billion logical addresses with bounded pages, and its navigators agree with the window headers", async ({
  page,
}) => {
  await bootScale(page);
  const workbook = await page.evaluate(() => window.__sheetwriteScaleGrid?.store.getWorkbook());
  expect(workbook?.sheets).toHaveLength(1);
  expect(workbook?.sheets[0]?.rowCount).toBe(ROWS);
  expect(workbook?.sheets[0]?.columns).toHaveLength(COLUMNS);
  await expect(page.getByTestId("scale-grid")).toHaveAttribute(
    "data-cache-bytes",
    String(CACHE_BUDGET_BYTES),
  );
  const stats = await pagedStats(page);
  expect(stats?.fullyLoaded).toBe(false);
  expect(stats?.allocatedBytes).toBeLessThanOrEqual(CACHE_BUDGET_BYTES);
  expect(stats?.loadedCells).toBeLessThan(ROWS * COLUMNS);
  const opening = await readWindow(page);
  expect([opening.firstRow, opening.firstColumn]).toEqual([1, 0]);
  await expect(page.getByTestId("scale-last-band")).toContainText("columns");
  for (const counter of ["scale-requested-cells", "scale-returned-cells"]) {
    expect(numericText(await page.getByTestId(counter).textContent())).toBeGreaterThan(0);
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

  const initial = await readWindow(page);
  await page.mouse.wheel(0, 1_800);
  await expect
    .poll(async () => (await readWindow(page)).firstRow)
    .toBeGreaterThan(initial.firstRow);
  const afterWheel = await readWindow(page);

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("PageDown");
  await expect
    .poll(async () => (await readWindow(page)).firstRow)
    .toBeGreaterThan(afterWheel.firstRow);
  const afterPageDown = await readWindow(page);
  await page.keyboard.press("PageUp");
  await expect
    .poll(async () => (await readWindow(page)).firstRow)
    .toBeLessThan(afterPageDown.firstRow);

  const landmarkRows: number[] = [];
  for (const [landmark, selected, dataRow] of [
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
        return numericText(rows?.[2] ?? null);
      })
      .toBeGreaterThanOrEqual(dataRow + 1);
    const readout = await readWindow(page);
    expect(readout.firstRow).toBeLessThanOrEqual(dataRow + 1);
    expect(readout.lastRow).toBeGreaterThanOrEqual(dataRow + 1);
    landmarkRows.push(readout.firstRow);
    await assertLoadedPeriodWithoutStaleFlash(page, dataRow);
  }
  expect(landmarkRows[0]).toBeLessThan(landmarkRows[1]!);
  expect(landmarkRows[1]).toBeLessThan(landmarkRows[2]!);
  expect(landmarkRows[2]).toBeLessThan(landmarkRows[3]!);

  const rail = page.getByTestId("scale-overview");
  // The rail sits under the grid; the mouse reaches only what is on screen.
  await rail.scrollIntoViewIfNeeded();
  const railBox = await rail.boundingBox();
  if (!railBox) throw new Error("Overview rail has no physical bounds");
  await page.mouse.move(railBox.x + railBox.width * 0.02, railBox.y + railBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(railBox.x + railBox.width * 0.55, railBox.y + railBox.height / 2, {
    steps: 14,
  });
  await page.mouse.up();
  await expect.poll(async () => (await readWindow(page)).firstRow).toBeLessThan(landmarkRows[2]!);
  await readWindow(page);

  const columnRail = page.getByTestId("scale-column-overview");
  await columnRail.focus();
  await page.keyboard.press("End");
  await expect(page.getByTestId("scale-current-a1")).toHaveText(/^ALL\d+$/);
  await expect.poll(async () => (await readWindow(page)).firstColumn).toBeGreaterThan(900);
  await expect(page.getByTestId("scale-selected-formula")).toHaveText(/^=/);
});
