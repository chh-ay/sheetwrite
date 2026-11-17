import type { Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { expect, test } from "./fixtures.js";

// The grid's modal dialogs in a browser build: labelled, keyboard-complete
// (Tab, Escape, Enter) and giving the grid its focus back.

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
  }
}

async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1_600, height: 900 });
  await page.goto("/showcases/spreadsheet/");
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
}

/** Put `m1` and `m2` in row 6's first two cells (A6:B6) and select them. */
async function twoValues(page: Page): Promise<void> {
  await page.evaluate(() => {
    const grid = window.__sheetwriteSpreadsheetGrid!;
    const sheet = grid.getActiveSheet();
    grid.applyTransaction({
      patches: [
        { op: "set", addr: { sheet, row: 5, col: 0 }, value: { kind: "literal", value: "m1" } },
        { op: "set", addr: { sheet, row: 5, col: 1 }, value: { kind: "literal", value: "m2" } },
      ],
    });
    grid.setSelection({
      kind: "range",
      range: { sheet, start: { row: 5, col: 0 }, end: { row: 5, col: 1 } },
    });
  });
}

function merged(page: Page): Promise<{ merges: number; covered: unknown }> {
  return page.evaluate(() => {
    const grid = window.__sheetwriteSpreadsheetGrid!;
    const sheet = grid.getActiveSheet();
    const meta = grid.store.getWorkbook().sheets.find((candidate) => candidate.id === sheet);
    return {
      merges: (meta?.merges ?? []).filter((merge) => merge.r0 === 5).length,
      covered: grid.store.getCell({ sheet, row: 5, col: 1 }).resolved,
    };
  });
}

test("merging cells that hold two values warns first, from the keyboard @portability", async ({
  page,
}) => {
  await open(page);
  await twoValues(page);
  // `ask` gives the toolbar's Merge & Center: the warning first.
  await page.evaluate(() =>
    window.__sheetwriteSpreadsheetGrid!.actions.mergeAndCenter({ ask: true }),
  );

  const dialog = page.getByRole("alertdialog", { name: "Merge Cells" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    "Merging cells only keeps the upper-left value and discards other values.",
  );
  const ok = dialog.getByRole("button", { name: "OK" });
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  await expect(ok).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(ok).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(cancel).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".sheetwrite").first()).toBeFocused();
  expect(await merged(page)).toEqual({ merges: 0, covered: "m2" });

  await page.evaluate(() =>
    window.__sheetwriteSpreadsheetGrid!.actions.mergeAndCenter({ ask: true }),
  );
  await expect(ok).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  expect(await merged(page)).toEqual({ merges: 1, covered: null });
});

/** Select `r0..r1` × `c0..c1` (data rows) on the active sheet and give the grid focus. */
async function selectRange(page: Page, r0: number, c0: number, r1 = r0, c1 = c0): Promise<void> {
  await page.evaluate(
    ([startRow, startCol, endRow, endCol]) => {
      const grid = window.__sheetwriteSpreadsheetGrid!;
      const sheet = grid.getActiveSheet();
      grid.setSelection({
        kind: "range",
        range: {
          sheet,
          start: { row: startRow, col: startCol },
          end: { row: endRow, col: endCol },
        },
      });
    },
    [r0, c0, r1, c1] as const,
  );
  await page.locator(".sheetwrite").first().focus();
}

test("Excel's format, hide, insert, delete and Format Cells keys reach the grid @portability", async ({
  page,
}) => {
  await open(page);
  const state = () =>
    page.evaluate(() => {
      const grid = window.__sheetwriteSpreadsheetGrid!;
      const sheet = grid.getActiveSheet();
      return {
        format: grid.store.getCell({ sheet, row: 5, col: 0 }).style.numberFormat ?? null,
        rows: [...grid.hiddenRows()],
        columns: [...grid.hiddenColumns()],
      };
    });
  await page.evaluate(() => {
    const grid = window.__sheetwriteSpreadsheetGrid!;
    const sheet = grid.getActiveSheet();
    grid.applyTransaction({
      patches: [
        { op: "set", addr: { sheet, row: 5, col: 0 }, value: { kind: "literal", value: 1234.5 } },
      ],
    });
  });

  await selectRange(page, 5, 0);
  await page.keyboard.press("Control+Shift+Digit4");
  await expect.poll(async () => (await state()).format).toBe("$#,##0.00_);($#,##0.00)");
  await page.keyboard.press("Control+Shift+Backquote");
  await expect.poll(async () => (await state()).format).toBe("General");

  await page.keyboard.press("Control+Digit9");
  await expect.poll(async () => (await state()).rows).toEqual([5]);
  await selectRange(page, 4, 0, 6, 0);
  await page.keyboard.press("Control+Shift+Digit9");
  await expect.poll(async () => (await state()).rows).toEqual([]);

  await selectRange(page, 5, 1);
  await page.keyboard.press("Control+Digit0");
  await expect.poll(async () => (await state()).columns).toEqual([1]);
  await selectRange(page, 5, 0, 5, 2);
  await page.keyboard.press("Control+Shift+Digit0");
  await expect.poll(async () => (await state()).columns).toEqual([]);

  const grid = page.locator(".sheetwrite").first();
  for (const [key, name] of [
    ["Control+Shift+Equal", "Insert"],
    ["Control+Minus", "Delete"],
    ["Control+Digit1", "Format Cells"],
  ] as const) {
    await selectRange(page, 5, 0, 5, 1);
    await page.keyboard.press(key);
    const dialog = page.getByRole("dialog", { name, exact: true });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(grid).toBeFocused();
  }
});

// Format Cells opens centred in the window, as Excel's does, and fits it: a
// short window scrolls the dialog's body, and OK and Cancel stay in view.
for (const viewport of [
  { width: 1_280, height: 720 },
  { width: 390, height: 844 },
  { width: 1_280, height: 400 },
]) {
  test(`Format Cells fits a ${viewport.width} × ${viewport.height} window with OK and Cancel in view @portability`, async ({
    page,
  }) => {
    await open(page);
    await page.setViewportSize(viewport);
    await selectRange(page, 1, 6);
    await page.keyboard.press("Control+Digit1");

    const dialog = page.getByRole("dialog", { name: "Format Cells", exact: true });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    if (!box) throw new Error("Format Cells must have a box");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

    for (const name of ["OK", "Cancel"]) {
      const button = dialog.getByRole("button", { name, exact: true });
      await expect(button).toBeInViewport({ ratio: 1 });
      const buttonBox = await button.boundingBox();
      if (!buttonBox) throw new Error(`${name} must have a box`);
      expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(box.y + box.height);
    }

    await dialog.getByRole("button", { name: "OK", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}
