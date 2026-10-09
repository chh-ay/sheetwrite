import { expect, type Page, test } from "@playwright/test";
import type { Grid } from "../../packages/core/src/types.js";
import { hasOpaqueForeground } from "./canvas-assertions.js";
import { siteUrl } from "./playwright.config.js";

// Focused contracts for the /vue/ business workbench: reactive configuration,
// validation/protection at the mutation barrier, notes and row metadata,
// workbook/sheet operations, host persistence state, and the explicit Vue
// props/events surface. Shared boot/nav coverage stays in examples.spec.ts;
// canonical adapter reset coverage stays in framework-lifecycle.spec.ts.

declare global {
  interface Window {
    __sheetwriteVueWorkbench?: { grid: Grid };
    __sheetwriteVuePaintFonts?: string[];
  }
}

const VUE_URL = siteUrl("/vue/");
const APP = ".sw-vuewb-app";
const GRID = `${APP} .sheetwrite`;

// Deterministic scenario observables (docs/src/showcases/scenarios/business.ts):
// status[row] = BUSINESS_STATUSES[(row * 7) % 4]; qty[0] = 8; unitCost[0] = 96.
const FIRST_PO = "PO-0001";
const PROTECTION_ID = "orders-computed-totals";
const SUPPLIER_BANNER = "Approved supplier directory — FY26";

interface BrowserErrors {
  console: string[];
  page: string[];
}

function collectErrors(page: Page): BrowserErrors {
  const errors: BrowserErrors = { console: [], page: [] };
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => {
    errors.page.push(error.message);
  });
  return errors;
}

async function canvasBodyPainted(page: Page): Promise<boolean> {
  const sample = await page.evaluate((selector) => {
    const canvas = document.querySelector(`${selector} canvas`);
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) {
      return null;
    }
    const context = canvas.getContext("2d");
    const bounds = canvas.getBoundingClientRect();
    if (!context || bounds.width === 0 || bounds.height === 0) return null;
    const scaleX = canvas.width / bounds.width;
    const scaleY = canvas.height / bounds.height;
    const left = Math.ceil(64 * scaleX);
    const top = Math.ceil(40 * scaleY);
    const width = Math.min(Math.ceil(256 * scaleX), canvas.width - left);
    const height = Math.min(Math.ceil(160 * scaleY), canvas.height - top);
    if (width <= 0 || height <= 0) return null;
    return Array.from(context.getImageData(left, top, width, height).data);
  }, GRID);
  return sample !== null && hasOpaqueForeground(sample);
}

async function openWorkbench(page: Page): Promise<void> {
  await page.goto(VUE_URL);
  await page.waitForSelector(GRID, { state: "attached", timeout: 15_000 });
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__sheetwriteVueWorkbench?.grid)), {
      timeout: 15_000,
      message: "vue workbench grid handle never became ready",
    })
    .toBe(true);
  // The suppliers seed and persistence binding land with @ready.
  await expect(page.getByTestId("persistence")).toContainText("All changes on host · v0", {
    timeout: 15_000,
  });
}

async function openTask(page: Page, name: string): Promise<void> {
  await page.getByRole("tab", { name, exact: true }).click();
}

function cellValue(page: Page, sheet: string, row: number, col: number) {
  return page.evaluate(
    ([s, r, c]) =>
      window.__sheetwriteVueWorkbench?.grid.store.getCell({
        sheet: String(s),
        row: Number(r),
        col: Number(c),
      }).resolved ?? null,
    [sheet, row, col] as const,
  );
}

/** Commit `text` into a cell through the real editor + keyboard path. */
async function commitCell(page: Page, row: number, col: number, text: string): Promise<void> {
  await page.evaluate(
    ([r, c, value]) => {
      const grid = window.__sheetwriteVueWorkbench?.grid;
      if (!grid) throw new Error("grid handle missing");
      const addr = { sheet: "orders", row: Number(r), col: Number(c) };
      grid.setActiveSheet("orders");
      grid.setSelection({ kind: "cell", addr });
      grid.scrollToCell(addr);
      grid.beginEdit(Number(r), Number(c), String(value));
    },
    [row, col, text] as const,
  );
  await page.keyboard.press("Enter");
}

test("boots the governed business workbook, paints, and stays accessible", async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1568, height: 869 });
  await openWorkbench(page);

  // The frozen PO column stays out of the ARIA mirror window, so the first
  // mirrored body cell is the supplier column; PO-0001 is asserted from the
  // store below.
  await expect
    .poll(() => page.locator(`${GRID} [role="gridcell"]`).allTextContents(), { timeout: 15_000 })
    .toContain("Alder Quay Freight");
  await expect.poll(() => canvasBodyPainted(page), { timeout: 15_000 }).toBe(true);

  // The seeded document evaluates formulas and applies its merge.
  const model = await page.evaluate(() => {
    const grid = window.__sheetwriteVueWorkbench!.grid;
    return {
      firstPo: grid.store.getCell({ sheet: "orders", row: 0, col: 0 }).resolved,
      banner: grid.store.getCell({ sheet: "suppliers", row: 0, col: 0 }).resolved,
      bannerCovered: grid.store.getCell({ sheet: "suppliers", row: 0, col: 1 }).resolved,
      total0: grid.store.getCell({ sheet: "orders", row: 0, col: 6 }).resolved,
    };
  });
  expect(model.firstPo).toBe(FIRST_PO);
  expect(model.banner).toBe(SUPPLIER_BANNER);
  expect(model.bannerCovered).toBeNull();
  expect(model.total0).toBe(768); // Eight shipments at $96; evaluated by the engine.

  // The governed workflow, not generic controls, is the first visible task.
  const taskTabs = page.getByRole("tablist", { name: "Workbook tasks" });
  await expect(taskTabs).toBeVisible();
  await expect(page.getByRole("tab", { name: "Protection" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("policy-result")).toContainText(
    "Protected totals require the finance-lead role.",
  );
  const taskGeometry = await taskTabs.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(taskGeometry.scrollWidth).toBeLessThanOrEqual(taskGeometry.clientWidth);
  await expect(page.locator(`${APP} .sw-demo-grid`)).toBeInViewport();

  // Host persistence and lifecycle state remain explicit, labeled text.
  await expect(page.getByTestId("generation")).toHaveText("1 · initial");
  await expect(page.getByTestId("workbook-state")).toHaveText("2 sheet(s) · active orders");

  // Accessible names for every interactive surface.
  await expect(page.getByRole("toolbar", { name: "Workbench configuration" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Host role" })).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Spreadsheet formatting" })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Sheets" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Orders sheet" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Suppliers sheet" })).toBeVisible();
  await openTask(page, "Notes");
  const noteEditor = page.getByRole("textbox", { name: "Cell note" });
  await expect(noteEditor).toBeVisible();
  await expect(page.getByRole("list", { name: "Adapter events" })).toBeVisible();
  await expect(page.getByTestId("persistence")).toHaveAttribute("aria-live", "polite");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("0.5.0 toolbar swatches follow the site theme toggle", async ({ page }) => {
  const errors = collectErrors(page);
  await openWorkbench(page);

  const textColor = page.locator(`${GRID} .sheetwrite-tb-textColor`);
  const fillColor = page.locator(`${GRID} .sheetwrite-tb-fillColor`);

  // Both colour inputs seed from the theme the Grid resolves, not from black.
  const initialSwatches = await Promise.all([textColor.inputValue(), fillColor.inputValue()]);
  expect(initialSwatches[0]).toMatch(/^#[0-9a-f]{6}$/);
  expect(initialSwatches[1]).toMatch(/^#[0-9a-f]{6}$/);

  await page.getByRole("button", { name: /Use (?:light|dark) theme/ }).click();
  await expect
    .poll(() => Promise.all([textColor.inputValue(), fillColor.inputValue()]))
    .not.toEqual(initialSwatches);

  // theme-change reseeds the swatches with the colours the Grid now paints.
  const resolvedTheme = await page.evaluate(() => {
    const handle = window.__sheetwriteVueWorkbench;
    if (!handle) throw new Error("vue workbench grid handle missing");
    return [handle.grid.getTheme().fg, handle.grid.getTheme().bg];
  });
  expect(await Promise.all([textColor.inputValue(), fillColor.inputValue()])).toEqual(
    resolvedTheme,
  );

  // The same workbench keeps several sheet tabs reachable from the strip.
  await expect(page.getByRole("tab", { name: "Orders sheet" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Suppliers sheet" })).toBeVisible();
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("protected totals show rejection, role correction, and accepted mutation in one journey", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openWorkbench(page);

  const inspector = page.getByTestId("inspector");
  await expect(inspector).toContainText("orders!G1");

  await page.getByTestId("challenge-attempt").click();
  const result = page.getByTestId("policy-result");
  await expect(result).toHaveAttribute("data-state", "rejected");
  await expect(result).toContainText(PROTECTION_ID);
  await expect(result).toContainText("Rejected");
  expect(await cellValue(page, "orders", 0, 6)).toBe(768);
  await expect(page.getByTestId("pending-count")).toHaveText("0");

  await page.getByTestId("challenge-authorize").click();
  await expect(page.getByTestId("role-finance-lead")).toHaveAttribute("aria-pressed", "true");
  await expect(result).toHaveAttribute("data-state", "authorized");

  await page.getByTestId("challenge-attempt").click();
  await expect(result).toHaveAttribute("data-state", "accepted");
  await expect.poll(() => cellValue(page, "orders", 0, 6)).toBe(999);
  await expect(page.getByTestId("pending-count")).toHaveText("1");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("@portability native tabs expose the complete accessible worksheet lifecycle", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openWorkbench(page);

  const ordersOptions = page.getByRole("button", { name: "Options for Orders sheet" });
  await ordersOptions.focus();
  await page.keyboard.press("ArrowDown");
  const renameOption = page.getByRole("menuitem", { name: "Rename Orders sheet" });
  await expect(renameOption).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(ordersOptions).toBeFocused();
  await expect(ordersOptions).toHaveAttribute("aria-expanded", "false");
  await ordersOptions.click();
  await page.getByRole("menuitem", { name: "Rename Orders sheet" }).click();
  const editor = page.getByRole("textbox", { name: "Rename Orders sheet" });
  await editor.fill("Suppliers");
  await editor.press("Enter");
  await expect(page.locator(`${GRID} [role="alert"][data-code="duplicate"]`)).toHaveText(
    "Sheet name duplicates another sheet case-insensitively",
  );
  await expect(editor).toBeFocused();
  await expect(page.getByTestId("pending-count")).toHaveText("0");

  await editor.fill("Purchase orders");
  await editor.press("Enter");
  await expect(page.getByRole("tab", { name: "Purchase orders sheet" })).toBeVisible();

  await page.getByRole("button", { name: "Add sheet", exact: true }).click();
  const added = page.getByRole("tab", { name: "Sheet 3 sheet" });
  await expect(added).toBeVisible();
  await expect(added).toHaveAttribute("aria-selected", "true");

  await added.focus();
  await page.keyboard.press("Control+Shift+ArrowLeft");
  expect(
    await page.evaluate(() =>
      window.__sheetwriteVueWorkbench!.grid.store.getWorkbook().sheets.map((sheet) => sheet.name),
    ),
  ).toEqual(["Purchase orders", "Sheet 3", "Suppliers"]);

  await page.getByRole("button", { name: "Options for Sheet 3 sheet" }).click();
  await page.getByRole("menuitem", { name: "Hide Sheet 3 sheet" }).click();
  await expect(added).toHaveCount(0);
  const unhide = page.getByLabel("Unhide sheet");
  await expect(unhide).toBeVisible();
  await unhide.click();
  await page
    .getByRole("group", { name: "Hidden sheets" })
    .getByRole("button", { name: "Sheet 3" })
    .click();
  await expect(page.getByRole("tab", { name: "Sheet 3 sheet" })).toBeVisible();

  await page.getByRole("tab", { name: "Sheet 3 sheet" }).click();
  await page.getByRole("button", { name: "Options for Sheet 3 sheet" }).click();
  await page.getByRole("menuitem", { name: "Remove Sheet 3 sheet" }).click();
  await expect(page.getByRole("tab", { name: "Sheet 3 sheet" })).toHaveCount(0);

  await page.getByRole("tab", { name: "Suppliers sheet" }).click();
  expect(
    await page.evaluate(
      () => window.__sheetwriteVueWorkbench!.grid.exportSnapshot().workbook.activeSheet,
    ),
  ).toBe("suppliers");
  await expect(page.getByTestId("pending-count")).toHaveText("6");
  await openTask(page, "Persistence");
  await page.getByTestId("sync").click();
  await expect(page.getByTestId("persistence")).toContainText("All changes on host · v6");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("mutation policy is reset-bound: the grid rebuilds and persistence rebinds", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openWorkbench(page);

  // Local content proves the reset re-ingests pristine scenario data.
  await commitCell(page, 4, 3, "Approved");
  await expect(page.getByTestId("pending-count")).toHaveText("1");
  await expect(page.getByTestId("mutation-policy")).toBeDisabled();
  await openTask(page, "Persistence");
  await page.getByTestId("sync").click();
  await expect(page.getByTestId("persistence")).toContainText("All changes on host · v1");

  await openTask(page, "Renderer");
  await page.getByText("Adapter settings", { exact: true }).click();
  await page.getByTestId("mutation-policy").click();
  await expect(page.getByTestId("generation")).toHaveText("2 · input-reset", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("props")).toContainText("partial");
  await expect(page.getByTestId("feed")).toContainText(":mutation-policy");
  // A replacement Grid generation re-seeds a fresh host adapter session.
  await expect(page.getByTestId("persistence")).toContainText("All changes on host · v0");
  await expect.poll(() => cellValue(page, "orders", 4, 3)).toBe("Draft");
  await expect.poll(() => canvasBodyPainted(page), { timeout: 15_000 }).toBe(true);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("read-only is a live option that never rebuilds the grid", async ({ page }) => {
  const errors = collectErrors(page);
  await openWorkbench(page);

  await openTask(page, "Renderer");
  await page.getByText("Adapter settings", { exact: true }).click();
  const readOnly = page.getByTestId("readonly");
  await readOnly.click();
  await expect(readOnly).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(GRID)).toHaveAttribute("aria-readonly", "true");
  await openTask(page, "Notes");
  await expect(page.getByRole("textbox", { name: "Cell note" })).toBeDisabled();
  await expect(page.getByTestId("props")).toContainText("true");
  await expect(page.getByRole("button", { name: "Add sheet", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Options for / })).toHaveCount(0);

  // Mutation is disabled while navigation stays alive; no reset happened. The
  // editor must not even open (commitCell would strand Enter on the toggle).
  await page.evaluate(() => {
    const grid = window.__sheetwriteVueWorkbench!.grid;
    grid.setSelection({ kind: "cell", addr: { sheet: "orders", row: 4, col: 3 } });
    grid.beginEdit(4, 3, "Approved");
  });
  await expect(page.locator(`${GRID} .sheetwrite-editor`)).toHaveCount(0);
  expect(await cellValue(page, "orders", 4, 3)).toBe("Draft");
  await expect(page.getByTestId("pending-count")).toHaveText("0");
  await expect(page.getByTestId("generation")).toHaveText("1 · initial");

  await openTask(page, "Renderer");
  await readOnly.click();
  await expect(readOnly).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Add sheet", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Options for Orders sheet" })).toBeVisible();
  await commitCell(page, 4, 3, "Approved");
  await expect.poll(() => cellValue(page, "orders", 4, 3)).toBe("Approved");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});
