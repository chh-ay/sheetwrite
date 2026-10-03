import { expect, type Page, test } from "@playwright/test";
import { siteUrl } from "./playwright.config.js";

const ROUTE = siteUrl("/showcases/engine/");
const ENGINE_TRACE_LIMIT = 40;

declare global {
  interface Window {
    __sheetwriteEngineShowcase?: {
      grid(): {
        store: {
          getCell(address: { sheet: string; row: number; col: number }): { resolved: unknown };
          getPagedStats(sheet: string): { allocatedBytes: number; loadedCells: number } | null;
        };
        getSelection(): unknown;
        getRuntimeResourceSnapshot(
          operation: "scroll",
          phase: "settled",
        ): { wasm: { allocatedCapacityBytes: number } };
      } | null;
      run(action: "jump" | "edit" | "undo" | "save" | "renderer"): Promise<void>;
      reset(): void;
      traceLength(): number;
      timerCount(): number;
    };
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
    .toBe("Period");
}

test("direct route jumps, edits a live formula, and undoes in the same Grid", async ({ page }) => {
  await bootEngine(page);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const store = window.__sheetwriteEngineShowcase?.grid()?.store;
        return [2, 3, 4, 5].map(
          (col) => store?.getCell({ sheet: "forecast", row: 0, col }).resolved,
        );
      }),
    )
    .toEqual(["Actual", "Forecast", "Variance", "Attainment"]);
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
    .toBe("FY26 W28");

  const before = await page.evaluate(() => {
    const store = window.__sheetwriteEngineShowcase!.grid()!.store;
    return {
      actual: store.getCell({ sheet: "forecast", row: 24_000, col: 2 }).resolved,
      variance: store.getCell({ sheet: "forecast", row: 24_000, col: 4 }).resolved,
      attainment: store.getCell({ sheet: "forecast", row: 24_000, col: 5 }).resolved,
    };
  });
  await page.click('[data-testid="engine-edit"]');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const grid = window.__sheetwriteEngineShowcase!.grid()!;
        return {
          actual: grid.store.getCell({ sheet: "forecast", row: 24_000, col: 2 }).resolved,
          variance: grid.store.getCell({ sheet: "forecast", row: 24_000, col: 4 }).resolved,
          selection: grid.getSelection(),
        };
      }),
    )
    .toMatchObject({
      actual: Number(before.actual) + 25,
      variance: Number(before.variance) + 25,
      selection: {
        kind: "range",
        range: {
          sheet: "forecast",
          start: { row: 24_000, col: 4 },
          end: { row: 24_000, col: 5 },
        },
      },
    });
  const after = await page.evaluate(() => {
    const store = window.__sheetwriteEngineShowcase!.grid()!.store;
    return {
      actual: store.getCell({ sheet: "forecast", row: 24_000, col: 2 }).resolved,
      variance: store.getCell({ sheet: "forecast", row: 24_000, col: 4 }).resolved,
      attainment: store.getCell({ sheet: "forecast", row: 24_000, col: 5 }).resolved,
    };
  });
  const dependency = page.locator('[data-testid="engine-dependency-readout"]');
  await expect(dependency).toHaveAttribute("data-action", "edit");
  const varianceDependency = dependency.locator('[data-address="E24001"]');
  await expect(varianceDependency).toContainText("E24001");
  await expect(varianceDependency).toContainText(
    `${String(before.variance)} → ${String(after.variance)}`,
  );
  await expect(varianceDependency).toContainText("=C24001-D24001");
  const attainmentDependency = dependency.locator('[data-address="F24001"]');
  await expect(attainmentDependency).toContainText("F24001");
  await expect(attainmentDependency).toContainText(
    `${String(before.attainment)} → ${String(after.attainment)}`,
  );
  await expect(attainmentDependency).toContainText("=IF(D24001=0,0,C24001/D24001)");

  await page.click('[data-testid="engine-undo"]');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const store = window.__sheetwriteEngineShowcase!.grid()!.store;
        return {
          actual: store.getCell({ sheet: "forecast", row: 24_000, col: 2 }).resolved,
          variance: store.getCell({ sheet: "forecast", row: 24_000, col: 4 }).resolved,
          attainment: store.getCell({ sheet: "forecast", row: 24_000, col: 5 }).resolved,
        };
      }),
    )
    .toEqual(before);
  await expect(dependency).toHaveAttribute("data-action", "undo");
  await expect(dependency.locator('[data-address="E24001"]')).toContainText(
    `${String(after.variance)} → ${String(before.variance)}`,
  );
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
  expect(evidence.loadedCells).toBeLessThanOrEqual(8_192);
  expect(evidence.pageBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  expect(evidence.engineBytes).toBeGreaterThanOrEqual(0);
  expect(evidence.longTasks.filter((entry) => entry.duration > 50)).toEqual([]);
  expect(evidence.frameCadence.p95).toBeLessThanOrEqual(35);
});

test("one hundred actions keep timers, trace, and DOM bounded, then lifecycle cleanup runs", async ({
  page,
}) => {
  await bootEngine(page);
  const beforeNodes = await page.locator("*").count();
  await page.evaluate(async () => {
    const handle = window.__sheetwriteEngineShowcase!;
    for (let loop = 0; loop < 50; loop += 1) {
      await handle.run("edit");
      await handle.run("undo");
    }
  });
  const bounds = {
    trace: await page.evaluate(() => window.__sheetwriteEngineShowcase!.traceLength()),
    logNodes: await page.locator('[data-testid="engine-event-log"] > li').count(),
    timers: await page.evaluate(() => window.__sheetwriteEngineShowcase!.timerCount()),
    beforeNodes,
    afterNodes: await page.locator("*").count(),
  };
  console.log(`ENGINE_BOUND_EVIDENCE ${JSON.stringify(bounds)}`);
  expect(bounds.trace).toBeLessThanOrEqual(ENGINE_TRACE_LIMIT);
  expect(bounds.logNodes).toBeLessThanOrEqual(ENGINE_TRACE_LIMIT);
  expect(bounds.timers).toBe(0);
  expect(bounds.afterNodes).toBeLessThanOrEqual(beforeNodes + ENGINE_TRACE_LIMIT * 4);

  await page.getByRole("link", { name: "Browse every live feature" }).click();
  await expect(page).toHaveURL(/\/showcases\/$/);
  await expect
    .poll(() => page.evaluate(() => window.__sheetwriteEngineShowcase === undefined))
    .toBe(true);
});
