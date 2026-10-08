import { expect, type Page, test } from "@playwright/test";
import {
  createEngineLiveWorkbook,
  ENGINE_LIVE_STORAGE,
  engineLiveRow,
} from "../../docs/src/showcases/scenarios/engine-live.js";
import { siteUrl } from "./playwright.config.js";

/**
 * Residency stays bounded by the window, not by the distance scrolled: at most
 * two paged chunks (the window can straddle a chunk boundary) across every
 * column, including the off-screen plan band that visible formulas read.
 */
const MAX_RESIDENT_CELLS =
  2 * ENGINE_LIVE_STORAGE.chunkRows * (createEngineLiveWorkbook().sheets[0]?.columns.length ?? 0);

const ROUTE = siteUrl("/showcases/engine/");
const ENGINE_TRACE_LIMIT = 40;
const EDITED_ROW = 24_000;
const PLAN_COLUMN = 26;

/** The banner literal the datasource serves at row 0 for `key`. */
function bannerLiteral(key: string): unknown {
  const cell = engineLiveRow(0)[key];
  const value = typeof cell === "object" && cell !== null && "value" in cell ? cell.value : cell;
  return typeof value === "object" && value !== null && "value" in value ? value.value : value;
}
const BANNER_KEYS = ["period", "region", "product", "account"] as const;

interface EngineShowcaseStore {
  getCell(address: { sheet: string; row: number; col: number }): { resolved: unknown };
  getFormula(address: { sheet: string; row: number; col: number }): string | null;
  getPagedStats(sheet: string): { allocatedBytes: number; loadedCells: number } | null;
  getWorkbook(): {
    sheets: readonly { columns: readonly { key: string; header: string }[] }[];
  };
}

interface EngineShowcaseHandle {
  grid(): {
    store: EngineShowcaseStore;
    getSelection(): unknown;
    getRuntimeResourceSnapshot(
      operation: "scroll",
      phase: "settled",
    ): { wasm: { allocatedCapacityBytes: number } };
  } | null;
  run(action: "jump" | "edit" | "undo" | "save" | "renderer"): Promise<void>;
  reset(): void;
  traceLength(): number;
}

declare global {
  interface Window {
    __sheetwriteEngineShowcase?: EngineShowcaseHandle;
    __sheetwriteEngineLongTasks?: Array<{ startTime: number; duration: number }>;
  }
}

async function bootEngine(page: Page) {
  await page.goto(ROUTE);
  await page.waitForSelector('[data-testid="engine-grid"] canvas', { timeout: 20_000 });
  await expect(page.locator('[data-testid="engine-status"]')).toContainText("Live sheet ready", {
    timeout: 20_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__sheetwriteEngineShowcase
              ?.grid()
              ?.store.getCell({ sheet: "forecast", row: 0, col: 0 }).resolved,
        ),
      { timeout: 20_000 },
    )
    .toBe(bannerLiteral("period"));
  // The banner arrives before the formula-read band. Sample only after the
  // visible formulas have their plan inputs, not merely after Grid creation.
  await expect(page.locator('[data-testid="engine-offscreen-band"]')).toHaveAttribute(
    "data-resolved",
    "true",
    { timeout: 20_000 },
  );
}

function readCells(
  page: Page,
  cells: readonly { row: number; col: number }[],
): Promise<readonly unknown[]> {
  return page.evaluate(
    (addresses) =>
      addresses.map(
        (address) =>
          window.__sheetwriteEngineShowcase
            ?.grid()
            ?.store.getCell({ sheet: "forecast", row: address.row, col: address.col }).resolved,
      ),
    cells,
  );
}

test("the paged ledger reads as a finance model with an off-screen plan band", async ({ page }) => {
  await bootEngine(page);
  const headers = await page.evaluate(
    () =>
      window.__sheetwriteEngineShowcase
        ?.grid()
        ?.store.getWorkbook()
        .sheets[0]?.columns.map((column) => column.header) ?? [],
  );
  expect(headers.slice(0, 6)).toEqual([
    "Month",
    "Region",
    "Actual",
    "Forecast",
    "Variance",
    "Attainment",
  ]);
  expect(headers.at(-1)).toBe("Plan USD");
  await expect
    .poll(() =>
      readCells(
        page,
        [0, 1, 6, 7].map((col) => ({ row: 0, col })),
      ),
    )
    .toEqual(BANNER_KEYS.map(bannerLiteral));

  const model = await page.evaluate((planColumn) => {
    const store = window.__sheetwriteEngineShowcase!.grid()!.store;
    const resolved = (row: number, col: number) =>
      store.getCell({ sheet: "forecast", row, col }).resolved;
    const monthlyActuals = Array.from({ length: 12 }, (_, month) => Number(resolved(1 + month, 2)));
    return {
      period: resolved(1, 0),
      region: resolved(1, 1),
      product: resolved(1, 6),
      account: resolved(1, 7),
      actual: Number(resolved(1, 2)),
      plan: Number(resolved(1, planColumn)),
      variance: Number(resolved(1, 4)),
      attainment: Number(resolved(1, 5)),
      varianceFormula: store.getFormula({ sheet: "forecast", row: 1, col: 4 }),
      totalFormula: store.getFormula({ sheet: "forecast", row: 13, col: 2 }),
      totalActual: Number(resolved(13, 2)),
      monthlySum: monthlyActuals.reduce((sum, value) => sum + value, 0),
      loadingCells: Array.from({ length: 12 }, (_, month) =>
        [2, 3, 4, 5].filter((col) => resolved(1 + month, col) === "#LOADING!"),
      ).flat().length,
    };
  }, PLAN_COLUMN);
  expect(model.period).toBe("Jan 2026");
  expect(model.region).toBe("North America");
  expect(model.product).toBe("Subscriptions");
  expect(model.account).toBe("AC-0001");
  expect(model.actual).toBeGreaterThan(0);
  expect(model.plan).toBeGreaterThan(0);
  // Variance compares the actual with the far-right plan column; attainment follows both.
  expect(model.variance).toBe(model.actual - model.plan);
  expect(model.varianceFormula).toBe("=C2-AA2");
  expect(model.attainment).toBeCloseTo(model.actual / model.plan, 4);
  // The annual row is a formula and it agrees with the twelve monthly rows.
  expect(model.totalFormula).toBe("=SUM(C2:C13)");
  expect(model.totalActual).toBe(model.monthlySum);
  expect(model.loadingCells).toBe(0);

  const band = page.locator('[data-testid="engine-offscreen-band"]');
  await expect(band).toHaveAttribute("data-column", "AA");
  await expect(band).toHaveAttribute("data-requested", "true");
  await expect(band).toHaveAttribute("data-resolved", "true");
  await expect(band).toContainText("Variance E2 reads Plan AA2");
  await expect(band).toContainText("Extra band in the window request: AA");
  await expect(
    page.locator('[data-testid="engine-event-log"] [data-plan-band="AA"]').first(),
  ).toContainText("plan");
});

test("direct route jumps, edits a live formula, and undoes in the same Grid", async ({ page }) => {
  await bootEngine(page);
  await page.fill('[data-testid="engine-jump-input"]', "24001");
  await page.click('[data-testid="engine-jump"]');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__sheetwriteEngineShowcase
              ?.grid()
              ?.store.getCell({ sheet: "forecast", row: 24_000, col: 0 }).resolved,
        ),
      { timeout: 20_000 },
    )
    .toBe("Feb 2026");
  // The month label is a literal; its arrival does not settle the formulas.
  await expect
    .poll(
      () =>
        readCells(
          page,
          [2, 3, 4, 5].map((col) => ({ row: EDITED_ROW, col })),
        ),
      { timeout: 20_000 },
    )
    .toEqual([expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number)]);

  const before = await page.evaluate((row) => {
    const store = window.__sheetwriteEngineShowcase!.grid()!.store;
    return {
      actual: Number(store.getCell({ sheet: "forecast", row, col: 2 }).resolved),
      variance: Number(store.getCell({ sheet: "forecast", row, col: 4 }).resolved),
      attainment: Number(store.getCell({ sheet: "forecast", row, col: 5 }).resolved),
    };
  }, EDITED_ROW);
  await page.click('[data-testid="engine-edit"]');
  await expect
    .poll(() =>
      page.evaluate((row) => {
        const grid = window.__sheetwriteEngineShowcase!.grid()!;
        return {
          actual: grid.store.getCell({ sheet: "forecast", row, col: 2 }).resolved,
          variance: grid.store.getCell({ sheet: "forecast", row, col: 4 }).resolved,
          selection: grid.getSelection(),
        };
      }, EDITED_ROW),
    )
    .toMatchObject({
      actual: before.actual + 1_250,
      variance: before.variance + 1_250,
      selection: {
        kind: "range",
        range: {
          sheet: "forecast",
          start: { row: EDITED_ROW, col: 4 },
          end: { row: EDITED_ROW, col: 5 },
        },
      },
    });
  const after = await page.evaluate((row) => {
    const store = window.__sheetwriteEngineShowcase!.grid()!.store;
    return {
      actual: Number(store.getCell({ sheet: "forecast", row, col: 2 }).resolved),
      variance: Number(store.getCell({ sheet: "forecast", row, col: 4 }).resolved),
      attainment: Number(store.getCell({ sheet: "forecast", row, col: 5 }).resolved),
    };
  }, EDITED_ROW);
  expect(after.actual).toBeGreaterThan(before.actual);

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const dependency = page.locator('[data-testid="engine-dependency-readout"]');
  await expect(dependency).toHaveAttribute("data-action", "edit");
  const varianceDependency = dependency.locator('[data-address="E24001"]');
  await expect(varianceDependency).toContainText("Monthly variance");
  await expect(varianceDependency).toContainText(
    `${money.format(before.variance)} → ${money.format(after.variance)}`,
  );
  await expect(varianceDependency).toContainText("=C24001-AA24001");
  const attainmentDependency = dependency.locator('[data-address="F24001"]');
  await expect(attainmentDependency).toContainText("Monthly attainment");
  await expect(attainmentDependency).toContainText("=IF(D24001=0,0,C24001/D24001)");
  // The forecast reads the plan column, so the actual edit must not touch it.
  await expect(dependency.locator('[data-address="D24001"]')).toHaveAttribute(
    "data-changed",
    "false",
  );

  await page.click('[data-testid="engine-undo"]');
  await expect
    .poll(() =>
      page.evaluate((row) => {
        const store = window.__sheetwriteEngineShowcase!.grid()!.store;
        return {
          actual: Number(store.getCell({ sheet: "forecast", row, col: 2 }).resolved),
          variance: Number(store.getCell({ sheet: "forecast", row, col: 4 }).resolved),
          attainment: Number(store.getCell({ sheet: "forecast", row, col: 5 }).resolved),
        };
      }, EDITED_ROW),
    )
    .toEqual(before);
  await expect(dependency).toHaveAttribute("data-action", "undo");
  await expect(dependency.locator('[data-address="E24001"]')).toContainText(
    `${money.format(after.variance)} → ${money.format(before.variance)}`,
  );
});

test("one click measures the whole change-to-acknowledgement cycle", async ({ page }) => {
  await bootEngine(page);
  await page.fill('[data-testid="engine-jump-input"]', "24001");
  await page.click('[data-testid="engine-jump"]');
  await expect
    .poll(() =>
      page.evaluate(
        (row) =>
          typeof window.__sheetwriteEngineShowcase?.grid()?.store.getCell({
            sheet: "forecast",
            row,
            col: 2,
          }).resolved === "number",
        EDITED_ROW,
      ),
    )
    .toBe(true);
  const before = await page.evaluate((row) => {
    const store = window.__sheetwriteEngineShowcase!.grid()!.store;
    return Number(store.getCell({ sheet: "forecast", row, col: 2 }).resolved);
  }, EDITED_ROW);
  await page.click('[data-testid="engine-follow"]');
  // The readout shows "—" with an "ms" label until the run ends; wait for a number.
  await expect
    .poll(
      async () =>
        Number.parseFloat(
          (await page.locator('[data-testid="engine-follow-duration"]').textContent()) ?? "",
        ),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);

  const readout = await page.evaluate(() => ({
    total: document.querySelector('[data-testid="engine-follow-duration"]')?.textContent ?? "",
    steps: [...document.querySelectorAll('[data-testid="engine-follow-report"] li')].map(
      (item) => item.textContent ?? "",
    ),
  }));
  expect(Number.parseFloat(readout.total)).toBeGreaterThan(0);
  expect(readout.steps).toHaveLength(4);
  for (const step of readout.steps) expect(step).toMatch(/\d+\.\d ms/);

  const rows = await page.evaluate(
    (row) => ({
      actual: Number(
        window.__sheetwriteEngineShowcase!.grid()!.store.getCell({
          sheet: "forecast",
          row,
          col: 2,
        }).resolved,
      ),
      events: [...document.querySelectorAll('[data-testid="engine-event-log"] li')].map((item) =>
        item.getAttribute("data-event"),
      ),
    }),
    EDITED_ROW,
  );
  expect(rows.actual).toBe(before + 1_250);
  for (const kind of [
    "datasource-request",
    "transaction-result",
    "formula-update",
    "browser-frame",
    "host-save",
  ]) {
    expect(rows.events).toContain(kind);
  }
  await expect(page.locator('[data-testid="engine-status"]')).toContainText(
    "host acknowledged 1 change at version 1",
  );
  await expect(
    page.locator('[data-testid="engine-event-log"] [data-event="host-save"]').first(),
  ).toContainText("applied at version 1");
});

test("drawing choice reports the actual path and the host acknowledges a real Grid change", async ({
  page,
}) => {
  await bootEngine(page);
  await page.click('[data-testid="engine-edit"]');
  await expect(page.locator('[data-testid="engine-save"]')).toBeEnabled();
  await page.click('[data-testid="engine-save"]');
  await expect(page.locator('[data-testid="engine-status"]')).toContainText(
    "host acknowledged 1 change at version 1",
  );
  await expect(
    page.locator('[data-testid="engine-event-log"] [data-event="host-save"]'),
  ).toContainText("applied at version 1");

  const workerRenderer = page.locator('[data-testid="engine-renderer-worker"]');
  await workerRenderer.focus();
  await page.keyboard.press("Space");
  await expect(workerRenderer).toBeChecked();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator('[data-testid="engine-renderer-canvas"]')).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(workerRenderer).toBeChecked();
  await page.waitForSelector('[data-testid="engine-grid"] canvas', { timeout: 20_000 });
  await expect(
    page.locator('[data-testid="engine-event-log"] [data-event="renderer"]').first(),
  ).toContainText(/worker active|worker requested, canvas active/, { timeout: 20_000 });
  await expect(page.locator('[data-testid="engine-active-renderer"]')).toHaveText(/worker|canvas/);
});

test("a formula rewrite that keeps the same read stays one measured cell transaction", async ({
  page,
}) => {
  await bootEngine(page);
  const before = await page.evaluate((planColumn) => {
    const store = window.__sheetwriteEngineShowcase!.grid()!.store;
    const address = { sheet: "forecast", row: 1, col: 3 };
    return {
      formula: store.getFormula(address),
      forecast: Number(store.getCell(address).resolved),
      plan: Number(store.getCell({ sheet: "forecast", row: 1, col: planColumn }).resolved),
      variance: Number(store.getCell({ sheet: "forecast", row: 1, col: 4 }).resolved),
    };
  }, PLAN_COLUMN);
  expect(before.formula).toBe("=AA2");

  await page.click('[data-testid="engine-rewrite"]');
  const readout = await page.evaluate(() => ({
    duration: document.querySelector('[data-testid="engine-rewrite-duration"]')?.textContent ?? "",
    formula: window.__sheetwriteEngineShowcase!.grid()!.store.getFormula({
      sheet: "forecast",
      row: 1,
      col: 3,
    }),
    forecast: Number(
      window.__sheetwriteEngineShowcase!.grid()!.store.getCell({
        sheet: "forecast",
        row: 1,
        col: 3,
      }).resolved,
    ),
    variance: Number(
      window.__sheetwriteEngineShowcase!.grid()!.store.getCell({
        sheet: "forecast",
        row: 1,
        col: 4,
      }).resolved,
    ),
  }));
  expect(Number.parseFloat(readout.duration)).toBeGreaterThanOrEqual(0);
  expect(readout.formula).toBe("=AA2*1.02");
  expect(readout.forecast).toBeCloseTo(before.plan * 1.02, 2);
  // The variance still reads the same two cells, so its value does not move.
  expect(readout.variance).toBe(before.variance);
  await expect(
    page.locator('[data-testid="engine-dependency-readout"] [data-address="D2"]'),
  ).toContainText("=AA2*1.02");
  await expect(
    page.locator('[data-testid="engine-event-log"] [data-event="formula-rewrite"]').first(),
  ).toContainText("reads did not change");

  await page.click('[data-testid="engine-rewrite"]');
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__sheetwriteEngineShowcase!.grid()!.store.getFormula({
          sheet: "forecast",
          row: 1,
          col: 3,
        }),
      ),
    )
    .toBe("=AA2");
});

test("sustained Grid scrolling stays immediate, bounded, and free of long tasks", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__sheetwriteEngineLongTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__sheetwriteEngineLongTasks!.push({
          startTime: entry.startTime,
          duration: entry.duration,
        });
      }
    }).observe({ type: "longtask", buffered: true });
  });
  await bootEngine(page);
  await page.evaluate(() => {
    window.__sheetwriteEngineLongTasks = [];
  });
  const grid = page.locator('[data-testid="engine-grid"]');
  const bounds = await grid.boundingBox();
  if (!bounds) throw new Error("The live Grid has no visible bounds");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  for (let index = 0; index < 16; index += 1) {
    await page.mouse.wheel(0, 720);
    await page.keyboard.press("PageDown");
  }
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const frameCadence = await page.evaluate(async () => {
    const host = document.querySelector<HTMLElement>('[data-testid="engine-grid"]')!;
    const scrollTarget = [host, ...host.querySelectorAll<HTMLElement>("*")]
      .filter((element) => element.scrollHeight > element.clientHeight + 10)
      .sort(
        (left, right) =>
          right.scrollHeight - right.clientHeight - (left.scrollHeight - left.clientHeight),
      )[0]!;
    const gaps: number[] = [];
    let previous = performance.now();
    for (let frame = 0; frame < 90; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const now = performance.now();
      gaps.push(now - previous);
      previous = now;
      scrollTarget.scrollTop = (frame % 2 === 0 ? frame : 90 - frame) * 320;
    }
    gaps.sort((left, right) => left - right);
    return {
      median: gaps[Math.floor(gaps.length * 0.5)] ?? Number.POSITIVE_INFINITY,
      p95: gaps[Math.floor(gaps.length * 0.95)] ?? Number.POSITIVE_INFINITY,
    };
  });
  const evidence = await page.evaluate((frameCadence) => {
    const gridInstance = window.__sheetwriteEngineShowcase!.grid()!;
    const pages = gridInstance.store.getPagedStats("forecast");
    const runtime = gridInstance.getRuntimeResourceSnapshot("scroll", "settled");
    return {
      loadedCells: pages?.loadedCells ?? 0,
      pageBytes: pages?.allocatedBytes ?? 0,
      engineBytes: runtime.wasm.allocatedCapacityBytes,
      longTasks: window.__sheetwriteEngineLongTasks ?? [],
      frameCadence,
    };
  }, frameCadence);
  expect(evidence.loadedCells).toBeGreaterThan(0);
  expect(evidence.loadedCells).toBeLessThanOrEqual(MAX_RESIDENT_CELLS);
  expect(evidence.pageBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  expect(evidence.engineBytes).toBeGreaterThan(0);
  expect(evidence.longTasks.filter((entry) => entry.duration > 50)).toEqual([]);
  expect(evidence.frameCadence.p95).toBeLessThanOrEqual(35);
});

test("repeated actions keep the trace, log, and DOM bounded, then lifecycle cleanup runs", async ({
  page,
}) => {
  await bootEngine(page);
  const runBatch = () =>
    page.evaluate(async () => {
      const handle = window.__sheetwriteEngineShowcase!;
      for (let loop = 0; loop < 50; loop += 1) {
        await handle.run("edit");
        await handle.run("undo");
      }
    });
  await runBatch();
  const firstBatchNodes = await page.locator("*").count();
  await runBatch();
  const bounds = {
    trace: await page.evaluate(() => window.__sheetwriteEngineShowcase!.traceLength()),
    logNodes: await page.locator('[data-testid="engine-event-log"] > li').count(),
    firstBatchNodes,
    afterNodes: await page.locator("*").count(),
  };
  expect(bounds.trace).toBeLessThanOrEqual(ENGINE_TRACE_LIMIT);
  expect(bounds.logNodes).toBeLessThanOrEqual(ENGINE_TRACE_LIMIT);
  // Once the log is full, more actions must not grow the page.
  expect(bounds.afterNodes).toBeLessThanOrEqual(bounds.firstBatchNodes);

  await page.getByRole("link", { name: "Browse every live feature" }).click();
  await expect(page).toHaveURL(/\/showcases\/$/);
  await expect
    .poll(() => page.evaluate(() => window.__sheetwriteEngineShowcase === undefined))
    .toBe(true);
});
