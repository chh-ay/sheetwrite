import { expect, type Page, test } from "@playwright/test";
import type { Grid, PagedStoreStats } from "../../packages/core/src/types.js";
import { siteUrl } from "./playwright.config.js";

declare global {
  interface Window {
    __sheetwriteScaleGrid?: Grid;
  }
}

const ROUTE = siteUrl("/showcases/performance/");
const GRID = '[data-testid="scale-grid"]';
const ROWS = 1_000_000;
const COLUMNS = 1_000;

interface BootErrors {
  console: string[];
  page: string[];
}

interface WindowReadout {
  firstRow: number;
  lastRow: number;
  firstColumn: number;
  lastColumn: number;
  selected: string;
}

function collectErrors(page: Page): BootErrors {
  const errors: BootErrors = { console: [], page: [] };
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
  return errors;
}

function columnIndex(label: string): number {
  let value = 0;
  for (const character of label) value = value * 26 + character.charCodeAt(0) - 64;
  return value - 1;
}

function numericText(text: string | null): number {
  return Number((text ?? "").replace(/,/g, "").replace(/[^\d.]/g, ""));
}

async function pagedStats(page: Page): Promise<PagedStoreStats | null> {
  return page.evaluate(() => {
    const store = window.__sheetwriteScaleGrid?.store;
    if (!store || !("getPagedStats" in store) || typeof store.getPagedStats !== "function") {
      return null;
    }
    return store.getPagedStats("scale") as PagedStoreStats;
  });
}

async function bootScale(page: Page): Promise<void> {
  await page.goto(ROUTE);
  await page.waitForSelector(`${GRID} canvas`, { state: "attached", timeout: 20_000 });
  await expect(page.getByTestId("scale-status")).toContainText("1,000,000,000", {
    timeout: 20_000,
  });
  await expect
    .poll(async () => (await pagedStats(page))?.loadedCells ?? 0, {
      timeout: 20_000,
      message: "the initial rectangular page never became resident",
    })
    .toBeGreaterThan(0);
}

async function readWindow(page: Page): Promise<WindowReadout> {
  const { windowText, rowText, columnText, selected } = await page.evaluate(() => {
    const text = (testId: string): string | null =>
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
    throw new Error(
      `Malformed public readout: ${JSON.stringify({ windowText, rowText, columnText })}`,
    );
  }
  const readout = {
    firstRow: Number(windowMatch[2]),
    lastRow: Number(windowMatch[4]),
    firstColumn: columnIndex(windowMatch[1]!),
    lastColumn: columnIndex(windowMatch[3]!),
    selected: selected?.trim() ?? "",
  };
  expect(readout.firstRow).toBe(Number(rowMatch[1]));
  expect(readout.lastRow).toBe(Number(rowMatch[2]));
  expect(readout.firstColumn).toBe(columnIndex(columnMatch[1]!));
  expect(readout.lastColumn).toBe(columnIndex(columnMatch[2]!));
  expect(readout.firstRow).toBeLessThanOrEqual(readout.lastRow);
  expect(readout.firstColumn).toBeLessThanOrEqual(readout.lastColumn);
  return readout;
}

async function assertLoadedPeriodWithoutStaleFlash(page: Page, row: number): Promise<void> {
  const expectedPeriod = `FY${2024 + (Math.floor(row / 12) % 5)} P${String((row % 12) + 1).padStart(2, "0")}`;
  const samples: Array<{ state: string | null; value: unknown }> = [];
  for (let sample = 0; sample < 8; sample += 1) {
    samples.push(
      await page.evaluate((targetRow) => {
        const store = window.__sheetwriteScaleGrid?.store;
        return {
          state: store?.getCellLoadState?.({ sheet: "scale", row: targetRow, col: 0 }) ?? null,
          value: store?.getCell({ sheet: "scale", row: targetRow, col: 0 }).resolved,
        };
      }, row),
    );
    await page.waitForTimeout(20);
  }
  for (const sample of samples) {
    if (sample.state === "unloaded") {
      expect(sample.value).toBe("#LOADING!");
    } else {
      expect(sample.value).toBe(expectedPeriod);
    }
  }
  await expect
    .poll(
      () =>
        page.evaluate(
          (targetRow) =>
            window.__sheetwriteScaleGrid?.store.getCell({
              sheet: "scale",
              row: targetRow,
              col: 0,
            }).resolved,
          row,
        ),
      { timeout: 20_000 },
    )
    .toBe(expectedPeriod);
}

async function gridBodyPoint(page: Page, row: number, column: number) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const point = await page.evaluate(
      ({ targetRow, targetColumn }) => {
        const host = document.querySelector<HTMLElement>('[data-testid="scale-grid"]');
        const grid = window.__sheetwriteScaleGrid;
        if (!host || !grid) return null;
        const rect = host.getBoundingClientRect();
        for (let y = rect.top + 36; y < rect.bottom; y += 8) {
          for (let x = rect.left + 72; x < rect.right; x += 8) {
            const address = grid.getCellAtPoint(x, y);
            if (address?.row === targetRow && address.col === targetColumn) return { x, y };
          }
        }
        return null;
      },
      { targetRow: row, targetColumn: column },
    );
    if (!point) throw new Error(`Could not locate visible cell r${row} c${column}`);
    const viewport = page.viewportSize();
    if (viewport === null || (point.y >= 0 && point.y < viewport.height)) return point;
    await page.evaluate(
      ({ targetY, viewportHeight }) => window.scrollBy(0, targetY - viewportHeight / 2),
      { targetY: point.y, viewportHeight: viewport.height },
    );
  }
  throw new Error(`Could not bring cell r${row} c${column} into the viewport`);
}

test("the live Grid is exactly one billion logical addresses with bounded rectangular pages", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootScale(page);
  await expect(
    page.getByRole("heading", { name: "One billion addresses. One bounded working set." }),
  ).toBeVisible();
  await expect(page.getByTestId("scale-status")).toContainText(
    "1,000,000 rows × 1,000 columns = 1,000,000,000 logical addresses",
  );
  const workbook = await page.evaluate(() => window.__sheetwriteScaleGrid?.store.getWorkbook());
  expect(workbook?.sheets).toHaveLength(1);
  expect(workbook?.sheets[0]?.rowCount).toBe(ROWS);
  expect(workbook?.sheets[0]?.columns).toHaveLength(COLUMNS);
  const cacheBudgetBytes = Number(
    await page.getByTestId("scale-grid").getAttribute("data-cache-bytes"),
  );

  const stats = await pagedStats(page);
  expect(stats).not.toBeNull();
  expect(stats!.fullyLoaded).toBe(false);
  expect(stats!.allocatedBytes).toBeLessThanOrEqual(cacheBudgetBytes);
  expect(stats!.loadedCells).toBeLessThan(ROWS * COLUMNS);
  expect(cacheBudgetBytes).toBe(32 * 1024 * 1024);
  await expect(page.getByText("Resident tile payload", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("32 MiB cache ceiling", { exact: false }).first()).toBeVisible();

  const initial = await readWindow(page);
  expect(initial.firstRow).toBe(1);
  expect(initial.firstColumn).toBe(0);
  await expect(page.getByTestId("scale-last-band")).toContainText("columns");
  expect(
    numericText(await page.getByTestId("scale-requested-cells").textContent()),
  ).toBeGreaterThan(0);
  expect(numericText(await page.getByTestId("scale-returned-cells").textContent())).toBeGreaterThan(
    0,
  );

  await page.getByTestId("scale-global-details").locator("summary").click();
  await page.getByTestId("scale-scan-attempt").click();
  await expect(page.getByTestId("scale-scan-report")).toHaveAttribute("data-state", "incomplete");
  await expect(page.getByTestId("scale-scan-report")).toContainText("IncompleteDataError");
  await expect(page.getByTestId("scale-scan-report")).toContainText("1,000,000,000");
  await page.getByTestId("scale-export-attempt").click();
  await expect(page.getByTestId("scale-export-report")).toHaveAttribute("data-state", "incomplete");
  await expect(page.getByTestId("scale-export-report")).toContainText("IncompleteDataError");
  await expect(page.getByTestId("scale-query-state")).toContainText("incomplete");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("row and column navigators agree with the public window headers", async ({ page }) => {
  await bootScale(page);
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
    ["74", "A740000", 739_999],
    ["99", "A990000", 989_999],
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

  const rail = page.getByTestId("scale-overview");
  const railBox = await rail.boundingBox();
  if (!railBox) throw new Error("Overview rail has no physical bounds");
  await page.mouse.move(railBox.x + railBox.width / 2, railBox.y + railBox.height * 0.02);
  await page.mouse.down();
  await page.mouse.move(railBox.x + railBox.width / 2, railBox.y + railBox.height * 0.55, {
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
  await expect(page.getByTestId("scale-selected-formula")).toHaveText(/^=J\d+\*\(1\+/);
});

test("a distant physical edit survives clean-tile eviction, far horizontal motion, and revisit", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await bootScale(page);
  const grid = page.locator(GRID);
  await page.getByTestId("scale-eviction-stress").click();
  await expect(grid).toHaveAttribute("data-cache-bytes", String(1024 * 1024));
  await expect(page.getByTestId("scale-status")).toContainText(
    "Optional 1 MiB eviction stress active",
  );
  const chunkRows = Number(await grid.getAttribute("data-chunk-rows"));
  expect(chunkRows).toBe(4_096);
  await page.getByTestId("scale-jump-row").fill("742000");
  await page.getByTestId("scale-jump-column").fill("4");
  await page.getByTestId("scale-jump").click();
  await expect(page.getByTestId("scale-current-a1")).toHaveText("D742000");
  await expect
    .poll(async () => {
      const readout = await readWindow(page);
      return readout.lastRow >= 742_000 && readout.lastColumn >= 3;
    })
    .toBe(true);
  const exactWindow = await readWindow(page);
  expect(exactWindow.firstRow).toBeLessThanOrEqual(742_000);
  expect(exactWindow.lastRow).toBeGreaterThanOrEqual(742_000);
  expect(exactWindow.firstColumn).toBeLessThanOrEqual(3);
  expect(exactWindow.lastColumn).toBeGreaterThanOrEqual(3);
  await page.getByTestId("scale-jump-row").fill("737904");
  await page.getByTestId("scale-jump-column").fill("4");
  await page.getByTestId("scale-jump").click();
  await expect(page.getByTestId("scale-current-a1")).toHaveText("D737904");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__sheetwriteScaleGrid?.store.getCellLoadState?.({
          sheet: "scale",
          row: 737_903,
          col: 3,
        }),
      ),
    )
    .toBe("loaded-value");
  await page.getByTestId("scale-jump-row").fill("742000");
  await page.getByTestId("scale-jump").click();
  await expect(page.getByTestId("scale-current-a1")).toHaveText("D742000");

  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          target: window.__sheetwriteScaleGrid?.store.getCellLoadState?.({
            sheet: "scale",
            row: 741_999,
            col: 3,
          }),
          cleanComparison: window.__sheetwriteScaleGrid?.store.getCellLoadState?.({
            sheet: "scale",
            row: 737_903,
            col: 3,
          }),
        })),
      { timeout: 20_000 },
    )
    .toEqual({ target: "loaded-value", cleanComparison: "loaded-value" });

  await grid.scrollIntoViewIfNeeded();
  const target = await gridBodyPoint(page, 741_999, 3);
  await page.mouse.click(target.x, target.y);
  await expect(page.getByTestId("scale-current-a1")).toHaveText("D742000");
  await expect(grid).toBeFocused();
  await page.keyboard.press("F2");
  await expect(page.locator(`${GRID} .sheetwrite-editor`)).toBeVisible();
  await page.locator(`${GRID} .sheetwrite-editor`).fill("777777");
  await page.keyboard.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteScaleGrid?.store.getCell({ sheet: "scale", row: 741_999, col: 3 })
            .resolved,
      ),
    )
    .toBe(777_777);

  const box = await grid.boundingBox();
  if (!box) throw new Error("Grid has no physical bounds");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  let sampledColumn = (await readWindow(page)).firstColumn;
  for (let motion = 0; motion < 34 && sampledColumn <= 900; motion += 1) {
    await page.mouse.wheel(3_600, 0);
    let observedColumn = sampledColumn;
    await expect
      .poll(async () => {
        const columns = (await page.getByTestId("scale-window-columns").textContent())?.match(
          /([A-Z]+)\s*–\s*([A-Z]+)/,
        );
        observedColumn = columnIndex(columns?.[1] ?? "A");
        return observedColumn;
      })
      .toBeGreaterThan(sampledColumn);
    sampledColumn = observedColumn;
  }
  const farWindow = await readWindow(page);
  expect(farWindow.firstColumn).toBeGreaterThan(900);
  expect(farWindow.lastColumn).toBeLessThan(COLUMNS);

  for (const landmark of ["0", "25", "99", "0", "25"]) {
    await page.getByTestId(`scale-landmark-${landmark}`).click();
    await page.waitForTimeout(250);
  }
  let watchedCleanState: string | undefined;
  for (let visit = 0; visit < 128; visit += 1) {
    const row = 10_000 + visit * 7_500;
    const column = 1 + ((visit * 113) % 990);
    if (
      Math.floor((row - 1) / chunkRows) === Math.floor(737_903 / chunkRows) ||
      Math.floor((row - 1) / chunkRows) === Math.floor(741_999 / chunkRows)
    ) {
      continue;
    }
    await page.getByTestId("scale-jump-row").fill(String(row));
    await page.getByTestId("scale-jump-column").fill(String(column));
    await page.getByTestId("scale-jump").click();
    await expect
      .poll(() =>
        page.evaluate(
          ({ targetRow, targetColumn }) =>
            window.__sheetwriteScaleGrid?.store.getCellLoadState?.({
              sheet: "scale",
              row: targetRow - 1,
              col: targetColumn - 1,
            }),
          { targetRow: row, targetColumn: column },
        ),
      )
      .toMatch(/loaded/);
    watchedCleanState = await page.evaluate(() =>
      window.__sheetwriteScaleGrid?.store.getCellLoadState?.({
        sheet: "scale",
        row: 737_903,
        col: 3,
      }),
    );
    if (watchedCleanState === "unloaded") break;
  }
  expect(watchedCleanState, "finite 32 MiB churn never evicted the watched clean tile").toBe(
    "unloaded",
  );

  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__sheetwriteScaleGrid?.store.getCellLoadState?.({
            sheet: "scale",
            row: 737_903,
            col: 3,
          }),
        ),
      { timeout: 20_000 },
    )
    .toBe("unloaded");
  expect(
    await page.evaluate(() =>
      window.__sheetwriteScaleGrid?.store.getCellLoadState?.({
        sheet: "scale",
        row: 741_999,
        col: 3,
      }),
    ),
  ).toBe("local-edit");
  await expect(page.getByTestId("scale-eviction-watch")).toHaveAttribute(
    "data-clean-state",
    "unloaded",
  );
  await expect(page.getByTestId("scale-eviction-watch")).toContainText(
    "Clean tile evicted; sparse dirty value retained",
  );

  const afterEviction = await pagedStats(page);
  const cacheBudgetBytes = Number(await grid.getAttribute("data-cache-bytes"));
  expect(afterEviction!.allocatedBytes).toBeLessThanOrEqual(cacheBudgetBytes);
  expect(afterEviction!.dirtyCells).toBe(1);
  const visibleWidth = farWindow.lastColumn - farWindow.firstColumn + 1;
  const amplification = Number(await page.getByTestId("scale-column-amplification").textContent());
  expect(amplification).toBeLessThanOrEqual(visibleWidth + 10);
  expect(amplification).toBeLessThan(64);

  await page.getByTestId("scale-jump-row").fill("742000");
  await page.getByTestId("scale-jump-column").fill("4");
  await page.getByTestId("scale-jump").click();
  await expect(page.getByTestId("scale-current-a1")).toHaveText("D742000");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteScaleGrid?.store.getCell({ sheet: "scale", row: 741_999, col: 3 })
            .resolved,
      ),
    )
    .toBe(777_777);
});

test("Grid zoom changes real rendered geometry and reset restores the logical window", async ({
  page,
}) => {
  await bootScale(page);
  const beforeWindow = await readWindow(page);
  const before = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('[data-testid="scale-grid"]');
    const grid = window.__sheetwriteScaleGrid;
    if (!host || !grid) return null;
    const rect = host.getBoundingClientRect();
    const theme = grid.getEffectiveTheme();
    return {
      zoom: grid.getZoom(),
      rowHeight: theme.rowHeight,
      selection: grid.getSelection(),
      probe: grid.getCellAtPoint(
        rect.left + theme.rowHeaderWidth + 16,
        rect.top + Math.min(240, rect.height - 10),
      ),
      transform: getComputedStyle(host).transform,
    };
  });
  expect(before).not.toBeNull();
  expect(before!.zoom).toBe(1);
  expect(before!.transform).toBe("none");

  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByTestId("scale-zoom-value")).toHaveText("125%");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const zoomedWindow = await readWindow(page);
  expect(zoomedWindow.firstRow).toBe(beforeWindow.firstRow);
  expect(zoomedWindow.firstColumn).toBe(beforeWindow.firstColumn);
  expect(zoomedWindow.selected).toBe(beforeWindow.selected);
  const zoomed = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('[data-testid="scale-grid"]');
    const grid = window.__sheetwriteScaleGrid;
    if (!host || !grid) return null;
    const rect = host.getBoundingClientRect();
    const theme = grid.getEffectiveTheme();
    return {
      zoom: grid.getZoom(),
      rowHeight: theme.rowHeight,
      selection: grid.getSelection(),
      probe: grid.getCellAtPoint(
        rect.left + theme.rowHeaderWidth + 16,
        rect.top + Math.min(240, rect.height - 10),
      ),
      transform: getComputedStyle(host).transform,
    };
  });
  expect(zoomed).not.toBeNull();
  expect(zoomed!.zoom).toBe(1.25);
  expect(zoomed!.rowHeight).toBeGreaterThan(before!.rowHeight);
  expect(zoomed!.probe?.row).toBeLessThan(before!.probe?.row ?? Number.POSITIVE_INFINITY);
  expect(zoomed!.selection).toEqual(before!.selection);
  expect(zoomed!.transform).toBe("none");

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByTestId("scale-zoom-value")).toHaveText("100%");
  const reset = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('[data-testid="scale-grid"]');
    const grid = window.__sheetwriteScaleGrid;
    if (!host || !grid) return null;
    const rect = host.getBoundingClientRect();
    const theme = grid.getEffectiveTheme();
    return {
      zoom: grid.getZoom(),
      rowHeight: theme.rowHeight,
      selection: grid.getSelection(),
      probe: grid.getCellAtPoint(
        rect.left + theme.rowHeaderWidth + 16,
        rect.top + Math.min(240, rect.height - 10),
      ),
    };
  });
  expect(reset).not.toBeNull();
  expect(reset!.zoom).toBe(1);
  expect(reset!.rowHeight).toBe(before!.rowHeight);
  expect(reset!.probe).toEqual(before!.probe);
  expect(reset!.selection).toEqual(before!.selection);
  await expect.poll(() => readWindow(page)).toEqual(beforeWindow);
});

test("@portability mobile touch input, lifecycle, and responsive reflow stay operable", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await bootScale(page);
  const grid = page.locator(GRID);
  await grid.scrollIntoViewIfNeeded();
  const box = await grid.boundingBox();
  if (!box) throw new Error("Mobile Grid has no physical bounds");
  expect(box.width).toBeGreaterThan(200);
  expect(box.height).toBeLessThanOrEqual(844 * 0.6);
  expect(await grid.evaluate((element) => getComputedStyle(element).touchAction)).toContain(
    "pan-x",
  );
  const beforeTap = await readWindow(page);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => (await readWindow(page)).selected).not.toBe(beforeTap.selected);
  const beforeTouch = await readWindow(page);
  if (browserName === "chromium") {
    const session = await context.newCDPSession(page);
    const x = Math.round(box.x + box.width / 2);
    const startY = Math.round(box.y + box.height * 0.8);
    const endY = Math.round(box.y + box.height * 0.2);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: startY, id: 1 }],
    });
    for (let step = 1; step <= 8; step += 1) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: Math.round(startY + ((endY - startY) * step) / 8), id: 1 }],
      });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect
      .poll(async () => (await readWindow(page)).firstRow)
      .toBeGreaterThan(beforeTouch.firstRow);
  } else if (browserName === "webkit") {
    await grid.locator(".sheetwrite-scroller").evaluate((scroller) => {
      scroller.scrollTop += 1_200;
    });
    await expect
      .poll(async () => (await readWindow(page)).firstRow)
      .toBeGreaterThan(beforeTouch.firstRow);
  } else {
    await grid.hover();
    await page.mouse.wheel(0, 1_200);
    await expect
      .poll(async () => (await readWindow(page)).firstRow)
      .toBeGreaterThan(beforeTouch.firstRow);
  }

  await page.locator(".sw-sp-render-details summary").click();
  await page.getByTestId("scale-renderer-worker").click();
  await page.waitForSelector(`${GRID} canvas`, { state: "attached" });
  await expect(page.getByTestId("scale-renderer-state")).toContainText("Requested worker");
  await page.getByTestId("scale-renderer-canvas").click();
  await expect(page.getByTestId("scale-renderer-active")).toHaveText("canvas");
  await expect(page.locator(`${GRID} canvas`)).toHaveCount(1);

  const layout = await page.evaluate(() => ({
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    controls: [
      ...document.querySelectorAll<HTMLElement>(
        ".sw-sp-zoom button, .sw-sp-zoom output, .sw-sp-stress button, .sw-sp-render-switch button, .sw-sp-navigator input, .sw-sp-landmarks button, .sw-sp-jump input, .sw-sp-jump button",
      ),
    ]
      .filter((element) => element.offsetParent !== null)
      .map((element) => element.getBoundingClientRect().toJSON()),
  }));
  for (const rect of layout.controls) {
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(layout.innerWidth + 1);
  }
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
  await context.close();
});
