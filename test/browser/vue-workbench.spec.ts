import type { Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { canvasPainted, cellValue, expect, test } from "./fixtures.js";

// The /vue/ business workbench: validation and protection at the mutation
// barrier, worksheet operations, host persistence state, and the Vue
// props/events surface. Adapter reset coverage stays in framework-lifecycle.

declare global {
  interface Window {
    __sheetwriteVueWorkbench?: { grid: Grid };
  }
}

const APP = ".sw-vuewb-app";
const GRID = `${APP} .sheetwrite`;
const HANDLE = "__sheetwriteVueWorkbench.grid";

async function open(page: Page): Promise<void> {
  await page.goto("/vue/");
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__sheetwriteVueWorkbench?.grid)), {
      timeout: 15_000,
    })
    .toBe(true);
  // The suppliers seed and persistence binding land with @ready.
  await expect(page.getByTestId("persistence")).toContainText("All changes on host · v0", {
    timeout: 15_000,
  });
}

/** Commit `text` into an orders cell through the real editor and Enter. */
async function commitCell(page: Page, row: number, col: number, text: string): Promise<void> {
  await page.evaluate(
    ({ row, col, text }) => {
      const grid = window.__sheetwriteVueWorkbench?.grid;
      if (!grid) throw new Error("grid handle missing");
      const addr = { sheet: "orders", row, col };
      grid.setActiveSheet("orders");
      grid.setSelection({ kind: "cell", addr });
      grid.scrollToCell(addr);
      grid.beginEdit(row, col, text);
    },
    { row, col, text },
  );
  await page.keyboard.press("Enter");
}

/** The settings disclosure keeps its state across task tabs. */
async function openAdapterSettings(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Renderer", exact: true }).click();
  const summary = page.getByText("Adapter settings", { exact: true });
  const isOpen = await summary.evaluate((element) => element.closest("details")?.open === true);
  if (!isOpen) await summary.click();
}

test("the command toolbar keeps ribbon commands reachable by keyboard at any width @portability", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1568, height: 869 });
  await open(page);
  const toolbar = page.getByRole("toolbar", { name: "Spreadsheet formatting" });
  const bold = toolbar.getByRole("button", { name: "Bold", exact: true });
  await page.evaluate(() => {
    const grid = window.__sheetwriteVueWorkbench?.grid;
    if (!grid) throw new Error("grid handle missing");
    grid.setActiveSheet("orders");
    grid.setSelection({ kind: "cell", addr: { sheet: "orders", row: 1, col: 0 } });
  });

  // Arrow keys rove between controls; Space runs the toggle and reports its state.
  await bold.focus();
  await bold.press("ArrowRight");
  await expect(toolbar.locator('[data-command="italic"]')).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(bold).toBeFocused();
  await bold.press("Space");
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await bold.press("Escape");
  await expect(page.locator(GRID)).toBeFocused();

  // A narrow window moves trailing commands into the More commands group.
  // WebKit reports the resize a frame late, and a resize closes every popup:
  // wait until Borders, on the row at the wide size, moves into the group.
  const border = toolbar.locator('[data-command="border"]');
  await expect(border).toBeVisible();
  await page.setViewportSize({ width: 640, height: 869 });
  const more = toolbar.getByRole("button", { name: "More commands" });
  await expect(more).toBeVisible();
  await expect(border).toBeHidden();
  await more.focus();
  await more.press("Enter");
  const overflow = page.getByRole("group", { name: "More commands" });
  await expect(overflow.locator('[data-command="zoom"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overflow).toBeHidden();
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute("aria-expanded", "false");
});

test("protected totals show rejection, role correction, and accepted mutation in one journey", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByTestId("inspector")).toContainText("orders!G1");
  await page.getByTestId("challenge-attempt").click();
  const result = page.getByTestId("policy-result");
  await expect(result).toHaveAttribute("data-state", "rejected");
  await expect(result).toContainText("orders-computed-totals");
  expect(await cellValue(page, HANDLE, "orders", 0, 6)).toBe(768);
  await expect(page.getByTestId("pending-count")).toHaveText("0");

  await page.getByTestId("challenge-authorize").click();
  await expect(page.getByTestId("role-finance-lead")).toHaveAttribute("aria-pressed", "true");
  await expect(result).toHaveAttribute("data-state", "authorized");
  await page.getByTestId("challenge-attempt").click();
  await expect(result).toHaveAttribute("data-state", "accepted");
  await expect.poll(() => cellValue(page, HANDLE, "orders", 0, 6)).toBe(999);
  await expect(page.getByTestId("pending-count")).toHaveText("1");
});

test("sheet tabs rename, add and reorder by keyboard, and the host syncs every change @portability", async ({
  page,
}) => {
  await open(page);
  const ordersOptions = page.getByRole("button", { name: "Options for Orders sheet" });
  const renameOption = page.getByRole("menuitem", { name: "Rename Orders sheet" });
  await ordersOptions.focus();
  await page.keyboard.press("ArrowDown");
  await expect(renameOption).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(ordersOptions).toBeFocused();
  await expect(ordersOptions).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowDown");
  await expect(renameOption).toBeFocused();
  // A pointer press on a focused menu must not close it first (WebKit does not
  // focus pressed buttons).
  await renameOption.click();
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
  await expect(added).toHaveAttribute("aria-selected", "true");
  await added.focus();
  await page.keyboard.press("Control+Shift+ArrowLeft");
  expect(
    await page.evaluate(() =>
      window.__sheetwriteVueWorkbench?.grid.store.getWorkbook().sheets.map((sheet) => sheet.name),
    ),
  ).toEqual(["Purchase orders", "Sheet 3", "Suppliers"]);

  await expect(page.getByTestId("pending-count")).toHaveText("3");
  await page.getByRole("tab", { name: "Persistence", exact: true }).click();
  await page.getByTestId("sync").click();
  await expect(page.getByTestId("persistence")).toContainText("All changes on host · v3");
});

test("mutation policy is reset-bound, and read-only is a live option", async ({ page }) => {
  await open(page);
  // Read-only disables mutation without a new generation.
  await openAdapterSettings(page);
  const readOnly = page.getByTestId("readonly");
  await readOnly.click();
  await expect(readOnly).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(GRID)).toHaveAttribute("aria-readonly", "true");
  await expect(page.getByRole("button", { name: "Add sheet", exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    const grid = window.__sheetwriteVueWorkbench?.grid;
    grid?.setSelection({ kind: "cell", addr: { sheet: "orders", row: 4, col: 3 } });
    grid?.beginEdit(4, 3, "Approved");
  });
  await expect(page.locator(`${GRID} .sheetwrite-editor`)).toHaveCount(0);
  await readOnly.click();
  await expect(readOnly).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("generation")).toHaveText("1 · initial");

  // A synced local edit, then a policy change: the grid rebuilds from the
  // pristine scenario and a fresh host session binds.
  await commitCell(page, 4, 3, "Approved");
  await expect(page.getByTestId("pending-count")).toHaveText("1");
  await expect(page.getByTestId("mutation-policy")).toBeDisabled();
  await page.getByRole("tab", { name: "Persistence", exact: true }).click();
  await page.getByTestId("sync").click();
  await expect(page.getByTestId("persistence")).toContainText("All changes on host · v1");
  await openAdapterSettings(page);
  await page.getByTestId("mutation-policy").click();
  await expect(page.getByTestId("generation")).toHaveText("2 · input-reset", { timeout: 15_000 });
  await expect(page.getByTestId("feed")).toContainText(":mutation-policy");
  await expect(page.getByTestId("persistence")).toContainText("All changes on host · v0");
  await expect.poll(() => cellValue(page, HANDLE, "orders", 4, 3)).toBe("Draft");
  await expect.poll(() => canvasPainted(page, `${GRID} canvas`), { timeout: 15_000 }).toBe(true);
});
