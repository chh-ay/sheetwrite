import type { Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { expect, test } from "./fixtures.js";

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
  }
}

async function selectCell(page: Page, reference: string): Promise<void> {
  const nameBox = page.getByRole("textbox", { name: "Cell reference" });
  await nameBox.fill(reference);
  await nameBox.press("Enter");
}

function storedFormula(page: Page): Promise<string | undefined> {
  return page.evaluate(() =>
    window.__sheetwriteSpreadsheetGrid?.store.getFormula({ sheet: "sales", row: 2, col: 7 }),
  );
}

test("formula help previews the result while typing and leaves the cell unchanged @portability", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/showcases/spreadsheet/");
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
  await selectCell(page, "H3");
  const before = await storedFormula(page);

  await page.keyboard.type("=E3*F3");
  const editor = page.locator("textarea.sheetwrite-editor");
  const preview = page.locator(".sheetwrite-formula-preview");
  await expect(preview).toHaveText("= 719.91");
  await expect(editor).toHaveAttribute(
    "aria-describedby",
    new RegExp(`\\b${(await preview.getAttribute("id")) ?? "missing"}\\b`),
  );

  const screenshot = testInfo.outputPath("formula-preview.png");
  await page.screenshot({ path: screenshot });
  await testInfo.attach("formula preview", { path: screenshot, contentType: "image/png" });

  // An unfinished formula has no preview; its error waits in the guide.
  await editor.fill("=ROUND(E3*F3,");
  await expect(preview).toHaveText("");

  await editor.fill("=SEQUENCE(2,3,5)");
  await expect(preview).toHaveText("= 5 … (2 × 3 array)");

  await editor.fill("=E3*RAND()");
  await expect(preview).toHaveText(/^No preview/u);

  await editor.press("Escape");
  await expect(editor).toHaveCount(0);
  expect(await storedFormula(page)).toBe(before);
});
