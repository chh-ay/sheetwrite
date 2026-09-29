import { expect, type Page, test } from "@playwright/test";
import { hasOpaqueForeground } from "./canvas-assertions.js";
import { siteUrl } from "./playwright.config.js";

// Focused contracts for the /vanilla/ engine workbench: explicit lifecycle,
// construction-bound renderer/data options behind deep links, Worker
// failure fallback, host-owned paging, and workbook operations — all through
// the framework-free host module. Shared boot/nav coverage stays in
// examples.spec.ts.

const VANILLA_URL = siteUrl("/vanilla/");
const GRID = ".sw-vw-stage .sheetwrite";
const CANVAS = `${GRID} .sheetwrite-canvas`;
const FIRST_ACCOUNT = "Account 000001";
const WORKER_ASSET = /\/assets\/worker-[A-Za-z0-9_-]+\.js$/;

interface BrowserErrors {
  console: string[];
  page: string[];
  worker: string[];
}

function collectErrors(page: Page): BrowserErrors {
  const errors: BrowserErrors = { console: [], page: [], worker: [] };
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.context().on("weberror", (error) => errors.worker.push(error.error().message));
  return errors;
}

async function gridCellTexts(page: Page): Promise<string[]> {
  return page.locator(`${GRID} [role="gridcell"]`).allTextContents();
}

/**
 * Compositor-level paint check that works for both the main-thread canvas and
 * the transferred Worker OffscreenCanvas (whose 2D context is unreachable).
 */
async function canvasBodyPainted(page: Page): Promise<boolean> {
  const canvas = page.locator(CANVAS);
  // The workbench sits below the showcase hero; the clip must be on-screen.
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box || box.width <= 80 || box.height <= 56) return false;

  const image = await page.screenshot({
    clip: {
      x: box.x + 64,
      y: box.y + 40,
      width: Math.min(320, box.width - 64),
      height: Math.min(180, box.height - 40),
    },
  });
  const rgba = await page.evaluate(async (encoded) => {
    const source = new Image();
    source.src = `data:image/png;base64,${encoded}`;
    await source.decode();
    const canvas = document.createElement("canvas");
    canvas.width = source.naturalWidth;
    canvas.height = source.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return [];
    context.drawImage(source, 0, 0);
    return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data);
  }, image.toString("base64"));

  return hasOpaqueForeground(rgba);
}

interface DprCanvasEvidence {
  backingHeight: number;
  backingWidth: number;
  cssHeight: number;
  cssWidth: number;
  devicePixelRatio: number;
  sample: number[];
  sampleHeight: number;
  sampleWidth: number;
}

async function readDprCanvasEvidence(page: Page): Promise<DprCanvasEvidence> {
  return page.locator(CANVAS).evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    const bounds = canvas.getBoundingClientRect();
    if (!context) throw new Error("Main-thread canvas 2D context is unavailable");
    if (bounds.width <= 0 || bounds.height <= 0) {
      throw new Error("Main-thread canvas has no CSS dimensions");
    }

    const scaleX = canvas.width / bounds.width;
    const scaleY = canvas.height / bounds.height;
    const left = Math.ceil(64 * scaleX);
    const top = Math.ceil(40 * scaleY);
    const sampleWidth = Math.min(Math.ceil(256 * scaleX), canvas.width - left);
    const sampleHeight = Math.min(Math.ceil(160 * scaleY), canvas.height - top);
    if (sampleWidth <= 0 || sampleHeight <= 0) {
      throw new Error("Main-thread canvas body sample is empty");
    }

    return {
      backingHeight: canvas.height,
      backingWidth: canvas.width,
      cssHeight: bounds.height,
      cssWidth: bounds.width,
      devicePixelRatio: window.devicePixelRatio,
      sample: Array.from(context.getImageData(left, top, sampleWidth, sampleHeight).data),
      sampleHeight,
      sampleWidth,
    };
  });
}

async function waitForLive(page: Page): Promise<void> {
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-phase", "live", {
    timeout: 20_000,
  });
  await expect
    .poll(() => gridCellTexts(page), { timeout: 15_000, message: "grid never exposed cells" })
    .toContain(FIRST_ACCOUNT);
}

/** Commit `value` into B2 through the shell name box and formula bar. */
async function commitB2(page: Page, value: string): Promise<void> {
  await page.fill("#namebox", "B2");
  await page.press("#namebox", "Enter");
  await page.fill("#formula", value);
  await page.press("#formula", "Enter");
}

async function readB2(page: Page): Promise<string> {
  await page.fill("#namebox", "B2");
  await page.press("#namebox", "Enter");
  return page.locator("#formula").inputValue();
}

/** Host action buttons, excluding the Grid's built-in toolbar. */
function actionButton(page: Page, name: string) {
  return page.locator(".sw-vw-instrument").getByRole("button", { name, exact: true });
}

async function openConstructionControls(page: Page): Promise<void> {
  const details = page.locator(".sw-vw-details");
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await page.getByText("Construction & debug controls", { exact: true }).click();
  }
}

test("boots product-first, paints, and exposes the ownership instruments", async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1568, height: 900 });

  await page.goto(VANILLA_URL);
  await waitForLive(page);
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-generation", "1");
  await expect(page.getByTestId("renderer")).toContainText(
    "Requested: Main thread · Active: Main thread",
  );
  await expect.poll(() => canvasBodyPainted(page)).toBe(true);

  const hero = await page.locator(".sw-showcase-page__hero").boundingBox();
  const installCommand = page.locator(".sw-showcase-page__install .sw-install-command");
  expect(hero).not.toBeNull();
  expect(hero!.height).toBeGreaterThanOrEqual(300);
  expect(hero!.height).toBeLessThanOrEqual(390);
  await expect(installCommand).toContainText("npm install @sheetwrite/core");
  expect(
    await installCommand.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);

  const stage = await page.locator(".sw-vw-gridstage").boundingBox();
  const instrument = await page.locator(".sw-vw-instrument").boundingBox();
  expect(stage).not.toBeNull();
  expect(instrument).not.toBeNull();
  expect(stage!.y).toBeLessThan(620);
  expect(stage!.width).toBeGreaterThan(instrument!.width * 2.5);
  await expect(page.locator(".sw-vw-stagewrap")).toBeInViewport();

  const scenarios = page.getByRole("tablist", { name: "Vanilla Grid scenarios" });
  await expect(scenarios).toBeVisible();
  await expect(scenarios.getByRole("tab")).toHaveCount(3);
  await expect(page.getByRole("tab", { name: /Main \/ Worker/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("complementary", { name: "Lifecycle ownership" })).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Grid lifecycle" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Rendering thread" })).toBeVisible();
  await expect(page.getByTestId("activity")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator('.sw-vw-stage [aria-label="Spreadsheet grid"]')).toBeAttached();

  await openConstructionControls(page);
  await expect(page.getByRole("toolbar", { name: "Workbench controls" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Data path" })).toBeVisible();

  await page.getByRole("tab", { name: /XLSX/ }).click();
  await expect(page.getByRole("toolbar", { name: "Workbook operations" })).toBeVisible();
  await expect(page.getByLabel("Import an XLSX workbook")).toBeAttached();

  const proofNav = page.getByRole("navigation", { name: "Dedicated capability proofs" });
  await expect(proofNav.locator('a[href="/showcases/performance/#million-rows"]')).toBeVisible();
  await expect(proofNav.locator('a[href="/showcases/interoperability/#xlsx"]')).toBeVisible();
  await expect(proofNav.locator('a[href="/showcases/database/"]')).toBeVisible();
  await expect(proofNav.locator('a[href="/showcases/collaboration/"]')).toBeVisible();

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test(
  "main-thread production canvas paints cells in a DPR 2 backing store",
  {
    tag: "@dpr2-render",
  },
  async ({ browser, browserName, page }, testInfo) => {
    const errors = collectErrors(page);
    await page.goto(`${VANILLA_URL}?renderer=canvas`);
    await waitForLive(page);
    await expect(page.getByTestId("renderer")).toContainText(
      "Requested: Main thread · Active: Main thread",
    );
    await expect
      .poll(async () => hasOpaqueForeground((await readDprCanvasEvidence(page)).sample), {
        timeout: 15_000,
        message: "DPR 2 main-thread canvas body never painted cell foreground",
      })
      .toBe(true);

    const evidence = await readDprCanvasEvidence(page);
    const visibleCells = await gridCellTexts(page);
    const runtimeIdentity = await page.evaluate(() => ({
      navigatorPlatform: navigator.platform,
      userAgent: navigator.userAgent,
      vendor: navigator.vendor,
    }));
    const opaqueColors = new Set<string>();
    let opaquePixels = 0;
    for (let offset = 0; offset + 3 < evidence.sample.length; offset += 4) {
      if (evidence.sample[offset + 3] !== 255) continue;
      opaquePixels += 1;
      opaqueColors.add(
        `${evidence.sample[offset]},${evidence.sample[offset + 1]},${evidence.sample[offset + 2]}`,
      );
    }
    const expectedBackingWidth = Math.max(1, Math.round(evidence.cssWidth * 2));
    const expectedBackingHeight = Math.max(1, Math.round(evidence.cssHeight * 2));
    const renderEvidence = {
      automation: {
        browserEngine: browserName,
        browserVersion: browser.version(),
        hostPlatform: `${process.platform}-${process.arch}`,
        project: testInfo.project.name,
        projectMetadata: testInfo.project.metadata,
        ...runtimeIdentity,
      },
      canvas: {
        backingHeight: evidence.backingHeight,
        backingWidth: evidence.backingWidth,
        cssHeight: evidence.cssHeight,
        cssWidth: evidence.cssWidth,
        devicePixelRatio: evidence.devicePixelRatio,
        expectedBackingHeight,
        expectedBackingWidth,
      },
      cells: {
        expectedVisibleValue: FIRST_ACCOUNT,
        foregroundPainted: hasOpaqueForeground(evidence.sample),
        opaqueColorCount: opaqueColors.size,
        opaquePixels,
        sampleHeight: evidence.sampleHeight,
        sampleWidth: evidence.sampleWidth,
      },
    };
    await testInfo.attach("dpr2-main-thread-render-evidence", {
      body: Buffer.from(JSON.stringify(renderEvidence, null, 2)),
      contentType: "application/json",
    });

    expect(["chromium", "webkit"]).toContain(browserName);
    expect(testInfo.project.name).toBe(`${browserName}-engine-dpr2`);
    expect(testInfo.project.metadata).toMatchObject({
      automationEngine:
        browserName === "chromium" ? "Playwright Chromium" : "Playwright WebKit (not macOS Safari)",
      hostPlatform: `${process.platform}-${process.arch}`,
      nativeMacOSSafariHardwareVerification: "external",
    });
    expect(evidence.devicePixelRatio).toBe(2);
    expect(evidence.backingWidth).toBe(expectedBackingWidth);
    expect(evidence.backingHeight).toBe(expectedBackingHeight);
    expect(hasOpaqueForeground(evidence.sample)).toBe(true);
    expect(visibleCells).toContain(FIRST_ACCOUNT);
    expect(errors.page).toEqual([]);
    expect(errors.worker).toEqual([]);
    expect(errors.console).toEqual([]);
  },
);

test("destroy, create, and reset bound explicit grid generations", async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto(VANILLA_URL);
  await waitForLive(page);
  await commitB2(page, "generation-one-edit");
  await expect.poll(() => readB2(page)).toBe("generation-one-edit");

  // Explicit destroy: nothing of the grid survives.
  await page.getByRole("button", { name: "Destroy" }).click();
  await expect(page.getByTestId("destroyed")).toBeVisible();
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-phase", "destroyed");
  await expect(page.locator(GRID)).toHaveCount(0);
  await expect(page.locator("#formula")).toHaveCount(0);
  await expect.poll(() => page.workers().length).toBe(0);

  // Explicit create: a fresh generation with a fresh document.
  await page.getByRole("button", { name: "Create grid" }).click();
  await waitForLive(page);
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-generation", "2");
  await expect.poll(() => readB2(page)).not.toBe("generation-one-edit");

  await openConstructionControls(page);
  // Reset rebuilds with the same construction options.
  await commitB2(page, "generation-two-edit");
  await page.getByRole("button", { name: "Reset generation" }).click();
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-generation", "3", {
    timeout: 20_000,
  });
  await waitForLive(page);
  await expect.poll(() => readB2(page)).not.toBe("generation-two-edit");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("renderer selection is construction-bound and deep-linked", {
  tag: "@portability",
}, async ({ page }) => {
  const errors = collectErrors(page);
  const workerUrls: string[] = [];
  page.on("worker", (worker) => workerUrls.push(worker.url()));

  await page.goto(VANILLA_URL);
  await waitForLive(page);

  await page.getByRole("radio", { name: "Web Worker" }).click();
  await expect(page.getByTestId("renderer")).toContainText(
    "Requested: Web Worker · Active: Web Worker",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("renderer")).toHaveAttribute("data-fallback-count", "0");
  await expect(page).toHaveURL(/[?&]renderer=worker/);
  // The rebuild is explicit: a second generation, not a mutated first one.
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-generation", "2");
  await expect
    .poll(async () => Number((await page.locator(CANVAS).getAttribute("data-worker-frame")) ?? 0), {
      timeout: 20_000,
      message: "Worker never acknowledged a frame",
    })
    .toBeGreaterThan(0);
  await expect.poll(() => canvasBodyPainted(page)).toBe(true);
  expect(workerUrls.length).toBe(1);
  expect(workerUrls[0]).toMatch(WORKER_ASSET);

  await page.getByRole("radio", { name: "Main thread" }).click();
  await expect(page.getByTestId("renderer")).toContainText(
    "Requested: Main thread · Active: Main thread",
    { timeout: 20_000 },
  );
  await expect(page).not.toHaveURL(/renderer=worker/);
  await expect
    .poll(() => page.workers().length, { message: "Worker survived renderer teardown" })
    .toBe(0);

  expect(errors.page).toEqual([]);
  expect(errors.worker).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("worker repaint keeps a cached non-shared view painted after a sub-row scroll", {
  tag: "@portability",
}, async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${VANILLA_URL}?renderer=worker`);
  await waitForLive(page);
  await expect(page.getByTestId("renderer")).toContainText(
    "Requested: Web Worker · Active: Web Worker",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("renderer")).toHaveAttribute("data-fallback-count", "0");
  await expect
    .poll(async () => Number((await page.locator(CANVAS).getAttribute("data-worker-frame")) ?? 0), {
      timeout: 20_000,
      message: "Worker never acknowledged the initial frame",
    })
    .toBeGreaterThan(0);
  await expect.poll(() => canvasBodyPainted(page), { timeout: 20_000 }).toBe(true);
  expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(false);

  const scroller = page.locator(`${GRID} .sheetwrite-scroller`);
  await scroller.hover();
  const initialFrame = Number((await page.locator(CANVAS).getAttribute("data-worker-frame")) ?? 0);
  await page.mouse.wheel(0, 8);
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect
    .poll(async () => Number((await page.locator(CANVAS).getAttribute("data-worker-frame")) ?? 0), {
      timeout: 20_000,
      message: "Worker did not paint the first sub-row scroll",
    })
    .toBeGreaterThan(initialFrame);

  const frameBeforeCachedPaint = Number(
    (await page.locator(CANVAS).getAttribute("data-worker-frame")) ?? 0,
  );
  const cellsBeforeCachedPaint = await gridCellTexts(page);
  const scrollBeforeCachedPaint = await scroller.evaluate((element) => element.scrollTop);
  await page.mouse.wheel(0, 8);
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(scrollBeforeCachedPaint);
  const scrollAfterCachedPaint = await scroller.evaluate((element) => element.scrollTop);
  expect(scrollAfterCachedPaint - scrollBeforeCachedPaint).toBeLessThan(20);
  // The second fractional scroll stays inside the same row window, so the data
  // signature and visible cells stay fixed while another Worker frame paints.
  expect(await gridCellTexts(page)).toEqual(cellsBeforeCachedPaint);
  await expect
    .poll(async () => Number((await page.locator(CANVAS).getAttribute("data-worker-frame")) ?? 0), {
      timeout: 20_000,
      message: "Worker did not repaint the cached view after a sub-row scroll",
    })
    .toBeGreaterThan(frameBeforeCachedPaint);
  await expect.poll(() => canvasBodyPainted(page), { timeout: 20_000 }).toBe(true);
  expect(errors.page).toEqual([]);
  expect(errors.worker).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("a failed Worker boot falls back honestly to the main thread", {
  tag: "@portability",
}, async ({ page }) => {
  const errors = collectErrors(page);
  const failedWorkerUrls: string[] = [];
  // Two assets match `worker-*.js`: a tiny module that only exports the real
  // worker's URL (statically imported by the route chunk — aborting it kills
  // the whole page) and the multi-kilobyte worker bundle itself. Abort only
  // the bundle so the failure lands in the Worker boot path.
  await page.route("**/assets/worker-*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.length < 1_000) {
      await route.fulfill({ response, body });
      return;
    }
    failedWorkerUrls.push(route.request().url());
    await route.abort("failed");
  });

  // Deep link straight into the Worker renderer.
  await page.goto(`${VANILLA_URL}?renderer=worker`);
  await waitForLive(page);

  const renderer = page.getByTestId("renderer");
  await expect(renderer).toContainText("Requested: Web Worker · Active: Main thread", {
    timeout: 20_000,
  });
  await expect(renderer).toContainText(/Fallback: .+/);
  await expect(renderer).toHaveAttribute("data-fallback-count", "1");
  expect(failedWorkerUrls.length).toBe(1);
  await expect
    .poll(() => page.workers().length, { message: "failed Worker was not terminated" })
    .toBe(0);

  // The fallback grid is fully alive: it paints and takes edits.
  await expect.poll(() => canvasBodyPainted(page)).toBe(true);
  await commitB2(page, "fallback-edit");
  await expect.poll(() => readB2(page)).toBe("fallback-edit");

  expect(errors.page).toEqual([]);
});

test("the paged data path serves host pages and reports allocation honestly", async ({ page }) => {
  const errors = collectErrors(page);

  // Deep link straight into the paged datasource.
  await page.goto(`${VANILLA_URL}?data=paged`);
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-phase", "live", {
    timeout: 20_000,
  });

  const stats = page.getByTestId("paged-stats");
  await expect(stats).toBeVisible();
  await expect
    .poll(async () => Number((await stats.getAttribute("data-chunks")) ?? 0), {
      timeout: 15_000,
      message: "paged store never reported a loaded chunk",
    })
    .toBeGreaterThan(0);
  const initialChunks = Number((await stats.getAttribute("data-chunks")) ?? 0);
  await expect(stats).toHaveAttribute("data-fully-loaded", "false");

  // The aria mirror boots on the loading snapshot; focus a body cell so it
  // refreshes through normal grid interaction, then values are readable.
  await page.locator(GRID).click({ position: { x: 300, y: 82 } });
  await expect.poll(() => gridCellTexts(page), { timeout: 15_000 }).toContain(FIRST_ACCOUNT);

  // Full-column aggregate over a partial store fails honestly.
  await actionButton(page, "Total ARR").click();
  await expect(page.getByTestId("activity")).toContainText("Needs the full dataset");
  // The summary sheet needs the whole fixture, so the host disables it here.
  await expect(actionButton(page, "Summary sheet")).toBeDisabled();

  // Scrolling far pulls new pages through the host page source.
  await page.locator(`${GRID} .sheetwrite-scroller`).evaluate((scroller) => {
    scroller.scrollTop = 500_000;
    scroller.dispatchEvent(new Event("scroll"));
  });
  await expect
    .poll(async () => Number((await stats.getAttribute("data-chunks")) ?? 0), {
      timeout: 20_000,
      message: "scroll never grew the paged allocation",
    })
    .toBeGreaterThan(initialChunks);
  await expect(page.getByTestId("activity")).toContainText("served by the host page source");

  // Back to the dense path: stats disappear, aggregates complete.
  await page.getByRole("tab", { name: /Main \/ Worker/ }).click();
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-phase", "live", {
    timeout: 20_000,
  });
  await expect(page).not.toHaveURL(/data=paged/);
  await expect(page.getByTestId("paged-stats")).toHaveCount(0);
  await page.getByRole("tab", { name: /XLSX/ }).click();
  await actionButton(page, "Total ARR").click();
  await expect(page.getByTestId("activity")).toContainText("Pipeline total");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});
