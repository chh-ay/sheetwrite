import type { Page } from "@playwright/test";

import {
  canvasPainted,
  expect,
  fitsViewport,
  focusAt,
  gridCellTexts,
  hasOpaqueForeground,
  test,
} from "./fixtures.js";

// The /vanilla/ engine workbench: explicit lifecycle, construction-bound
// renderer options behind deep links, and Worker failure fallback.

const GRID = ".sw-vw-stage .sheetwrite";
const CANVAS = `${GRID} .sheetwrite-canvas`;
const FIRST_ACCOUNT = "Alder Quay Logistics";

async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/vanilla/${query}`);
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-phase", "live", {
    timeout: 20_000,
  });
  await expect.poll(() => gridCellTexts(page, GRID), { timeout: 15_000 }).toContain(FIRST_ACCOUNT);
}

/** Commit `value` into B2 through the shell name box and formula bar. */
async function commit_b2(page: Page, value: string): Promise<void> {
  await page.fill("#namebox", "B2");
  await page.press("#namebox", "Enter");
  await page.fill("#formula", value);
  await page.press("#formula", "Enter");
}

async function read_b2(page: Page): Promise<string> {
  await page.fill("#namebox", "B2");
  await page.press("#namebox", "Enter");
  return page.locator("#formula").inputValue();
}

function worker_frame(page: Page): Promise<number> {
  return page
    .locator(CANVAS)
    .getAttribute("data-worker-frame")
    .then((frame) => Number(frame ?? 0));
}

/** Matches the renderer readout by meaning, not by its punctuation. */
function renderer_readout(requested: string, active: string): RegExp {
  return new RegExp(`Requested:\\s*${requested}\\b[\\s\\S]*Active:\\s*${active}\\b`);
}

test("main-thread production canvas paints cells in a DPR 2 backing store @dpr2-render", async ({
  browserName: browser_name,
  page,
}) => {
  await open(page, "?renderer=canvas");
  const read_evidence = () =>
    page.locator(CANVAS).evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const context = canvas.getContext("2d");
      const bounds = canvas.getBoundingClientRect();
      if (!context || bounds.width <= 0 || bounds.height <= 0) {
        throw new Error("Main-thread canvas has no 2D context or no CSS size");
      }
      const scale_x = canvas.width / bounds.width;
      const scale_y = canvas.height / bounds.height;
      const left = Math.ceil(64 * scale_x);
      const top = Math.ceil(40 * scale_y);
      const width = Math.min(Math.ceil(256 * scale_x), canvas.width - left);
      const height = Math.min(Math.ceil(160 * scale_y), canvas.height - top);
      return {
        backingHeight: canvas.height,
        backingWidth: canvas.width,
        cssHeight: bounds.height,
        cssWidth: bounds.width,
        devicePixelRatio: window.devicePixelRatio,
        sample: Array.from(context.getImageData(left, top, width, height).data),
      };
    });
  await expect
    .poll(async () => hasOpaqueForeground((await read_evidence()).sample), { timeout: 15_000 })
    .toBe(true);

  const canvas = await read_evidence();
  expect(["chromium", "webkit"]).toContain(browser_name);
  expect(canvas.devicePixelRatio).toBe(2);
  expect(canvas.backingWidth).toBe(Math.max(1, Math.round(canvas.cssWidth * 2)));
  expect(canvas.backingHeight).toBe(Math.max(1, Math.round(canvas.cssHeight * 2)));
});

test("a grid on its own hands the focus on; destroy, create, and reset bound explicit grid generations", async ({
  page,
}) => {
  await open(page);
  // F6, Shift+F6 and Escape then Tab or Shift+Tab hand the focus to the page
  // after or before a grid without a shell around it.
  for (const [keys, side] of [
    [["F6"], "after"],
    [["Shift+F6"], "before"],
    [["Escape", "Tab"], "after"],
    [["Escape", "Shift+Tab"], "before"],
  ] as const) {
    await page.locator(GRID).focus();
    await expect.poll(() => focusAt(page, GRID)).toBe("grid");
    for (const key of keys) await page.keyboard.press(key);
    expect(await focusAt(page, GRID), keys.join(" then ")).toBe(side);
  }

  await commit_b2(page, "generation-one-edit");
  await expect.poll(() => read_b2(page)).toBe("generation-one-edit");

  // Destroy leaves nothing of the grid, and a double click makes one transition.
  await page.getByRole("button", { name: "Destroy grid", exact: true }).dblclick();
  await expect(page.getByTestId("destroyed")).toBeVisible();
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-phase", "destroyed");
  await expect(page.locator(GRID)).toHaveCount(0);
  await expect(page.locator("#formula")).toHaveCount(0);
  await expect.poll(() => page.workers().length).toBe(0);

  // Create starts a fresh generation with a fresh document.
  await page.getByRole("button", { name: "Create grid", exact: true }).dblclick();
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-generation", "2");
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-phase", "live");
  await expect.poll(() => read_b2(page)).not.toBe("generation-one-edit");

  // Reset rebuilds with the same construction options.
  const controls = page.locator(".sw-vw-details");
  if (!(await controls.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await page.getByText("Construction & debug controls", { exact: true }).click();
  }
  await commit_b2(page, "generation-two-edit");
  await page.getByRole("button", { name: "Reset generation" }).click();
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-generation", "3", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-phase", "live");
  await expect.poll(() => read_b2(page)).not.toBe("generation-two-edit");
});

test("boots product-first and fits the page; the Worker renderer is deep-linked and repaints a cached view after a sub-row scroll @portability", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-generation", "1");
  await expect(page.getByTestId("renderer")).toContainText(
    renderer_readout("Main thread", "Main thread"),
  );
  await expect.poll(() => canvasPainted(page, CANVAS)).toBe(true);
  await expect(page.locator(GRID)).toBeInViewport();
  expect(await fitsViewport(page)).toBe(true);

  await page.getByRole("radio", { name: "Web Worker" }).click();
  const renderer = page.getByTestId("renderer");
  await expect(renderer).toContainText(renderer_readout("Web Worker", "Web Worker"), {
    timeout: 20_000,
  });
  await expect(renderer).toHaveAttribute("data-fallback-count", "0");
  await expect(page).toHaveURL(/[?&]renderer=worker/);
  await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-generation", "2");
  await expect.poll(() => worker_frame(page), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect.poll(() => canvasPainted(page, CANVAS), { timeout: 20_000 }).toBe(true);
  expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(false);

  // Two 4 px steps stay inside one row window, so the second paint reuses the
  // cached view. Start where the next 9 px cross no row edge at the top or the
  // bottom of the window, whatever the grid's height.
  const scroller = page.locator(`${GRID} .sheetwrite-scroller`);
  const scroll_top = () => scroller.evaluate((element) => element.scrollTop);
  const start = await scroller.evaluate(async (element, grid) => {
    const rows = () =>
      [...document.querySelectorAll(`${grid} [role="row"]`)]
        .map((row) => row.getAttribute("aria-rowindex"))
        .join();
    const paint = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const from = element.scrollTop;
    for (let top = from; top < from + 120; top++) {
      element.scrollTop = top;
      await paint();
      const before = rows();
      element.scrollTop = top + 9;
      await paint();
      if (rows() === before) {
        element.scrollTop = top;
        await paint();
        return top;
      }
    }
    return null;
  }, GRID);
  expect(start).not.toBeNull();
  await scroller.hover();
  for (let step = 0; step < 2; step++) {
    const frame = await worker_frame(page);
    const cells = await gridCellTexts(page, GRID);
    const top = await scroll_top();
    await page.mouse.wheel(0, 4);
    await expect.poll(scroll_top).toBeGreaterThan(top);
    if (step === 1) {
      expect((await scroll_top()) - top).toBeLessThan(20);
      expect(await gridCellTexts(page, GRID)).toEqual(cells);
    }
    await expect.poll(() => worker_frame(page), { timeout: 20_000 }).toBeGreaterThan(frame);
  }
  await expect.poll(() => canvasPainted(page, CANVAS), { timeout: 20_000 }).toBe(true);

  await page.getByRole("radio", { name: "Main thread" }).click();
  await expect(renderer).toContainText(renderer_readout("Main thread", "Main thread"), {
    timeout: 20_000,
  });
  await expect(page).not.toHaveURL(/renderer=worker/);
  await expect.poll(() => page.workers().length).toBe(0);
});

test.describe(() => {
  // The aborted Worker bundle and the forced import failure log errors on purpose.
  test.use({ allowErrors: true });

  test("a failed Worker boot falls back honestly to the main thread, and a rejected import recovers @portability", async ({
    page,
  }) => {
    const page_errors: string[] = [];
    page.on("pageerror", (error) => page_errors.push(error.message));
    // Two assets match `worker-*.js`: a tiny module that only exports the real
    // worker's URL (statically imported by the route chunk; aborting it kills
    // the whole page) and the worker bundle itself. Abort only the bundle.
    const failed_worker_urls: string[] = [];
    await page.route("**/assets/worker-*.js", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (body.length < 1_000) return route.fulfill({ response, body });
      failed_worker_urls.push(route.request().url());
      return route.abort("failed");
    });

    await open(page, "?renderer=worker");
    const renderer = page.getByTestId("renderer");
    await expect(renderer).toContainText(renderer_readout("Web Worker", "Main thread"), {
      timeout: 20_000,
    });
    await expect(renderer).toContainText(/Fallback:\s*\S/);
    await expect(renderer).toHaveAttribute("data-fallback-count", "1");
    expect(failed_worker_urls.length).toBe(1);
    await expect.poll(() => page.workers().length).toBe(0);

    // The fallback grid is fully alive: it paints and takes edits.
    await expect.poll(() => canvasPainted(page, CANVAS)).toBe(true);
    await commit_b2(page, "fallback-edit");
    await expect.poll(() => read_b2(page)).toBe("fallback-edit");
    expect(page_errors).toEqual([]);

    // A rejected import shows an alert and restores the import button.
    await page.getByRole("tab", { name: /XLSX/ }).click();
    await page.evaluate(() => {
      File.prototype.arrayBuffer = () => Promise.reject(new Error("Forced import failure"));
    });
    await page.getByLabel("Import an XLSX workbook").setInputFiles({
      name: "failed.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("failed import"),
    });
    const alert = page.locator("[data-action-error]").filter({ hasText: "Forced import failure" });
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute("role", "alert");
    const import_button = page
      .locator(".sw-vw-instrument")
      .getByRole("button", { name: "Import XLSX", exact: true });
    await expect(import_button).toBeEnabled();
    await expect(import_button).not.toHaveAttribute("aria-busy", "true");
    await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-phase", "live");
  });
});
