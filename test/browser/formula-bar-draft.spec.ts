import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.js";

async function selectCell(page: Page, reference: string): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/showcases/spreadsheet/");
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
  const nameBox = page.getByRole("textbox", { name: "Cell reference" });
  await nameBox.fill(reference);
  await nameBox.press("Enter");
}

test("the formula bar follows every keystroke in the cell editor, and Escape restores both @portability", async ({
  page,
}) => {
  await selectCell(page, "G3");
  const bar = page.getByRole("textbox", { name: "Formula bar" });
  const stored = await bar.inputValue();
  await page.keyboard.type("=SU");
  const editor = page.locator("textarea.sheetwrite-editor");
  await expect(editor).toBeFocused();
  await expect(bar).toHaveValue("=SU");
  await page.keyboard.type("M(1,");
  await expect(bar).toHaveValue("=SUM(1,");
  await page.keyboard.press("Alt+Enter");
  await page.keyboard.type("2)");
  await expect(bar).toHaveValue("=SUM(1,\n2)");
  await page.keyboard.press("Backspace");
  await expect(bar).toHaveValue("=SUM(1,\n2");
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(bar).toHaveValue(stored);
});

test("the cell shows every keystroke typed in the formula bar, and Enter commits it @portability", async ({
  page,
}) => {
  await selectCell(page, "G4");
  const bar = page.getByRole("textbox", { name: "Formula bar" });
  await bar.click();
  await bar.press("ControlOrMeta+a");
  await page.keyboard.type("Draft");
  const editor = page.locator("textarea.sheetwrite-editor");
  await expect(editor).toHaveValue("Draft");
  await expect(bar).toBeFocused();
  await page.keyboard.type(" text");
  await expect(editor).toHaveValue("Draft text");
  // Moving into the cell editor keeps the edit; typing there shows in the bar.
  await editor.click();
  await expect(editor).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await expect(bar).toHaveValue("Draft text!");
  await bar.click();
  await page.keyboard.press("Enter");
  await expect(editor).toHaveCount(0);
  await expect(bar).toHaveValue("Draft text!");
});
