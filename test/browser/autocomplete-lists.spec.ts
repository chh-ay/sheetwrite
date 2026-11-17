import type { Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { expect, test } from "./fixtures.js";

// Pick From Drop-down List and AutoComplete's list of matching entries, with
// the real Alt (Option on a Mac) and arrow keys of each browser engine.

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

async function select(page: Page, reference: string): Promise<void> {
  const nameBox = page.getByRole("textbox", { name: "Cell reference" });
  await nameBox.fill(reference);
  await nameBox.press("Enter");
}

function region(page: Page, row: number): Promise<unknown> {
  return page.evaluate(
    (at) =>
      window.__sheetwriteSpreadsheetGrid?.store.getCell({ sheet: "sales", row: at, col: 1 })
        .resolved ?? null,
    row,
  );
}

test("Alt+Down lists the column's entries, and AutoComplete lists several matches @portability", async ({
  page,
}) => {
  await open(page);

  // Pick From Drop-down List under the Region column.
  await select(page, "B50");
  await page.keyboard.press("Alt+ArrowDown");
  const pick = page.getByRole("listbox", { name: "Pick From Drop-down List" });
  await expect(pick.getByRole("option")).toHaveText(["East", "North", "South", "West"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(pick).toHaveCount(0);
  await expect.poll(() => region(page, 49)).toBe("North");

  // Two entries begin "Nor": AutoComplete lists them and completes nothing inline.
  await select(page, "B51");
  await page.keyboard.type("Northeast");
  await page.keyboard.press("Enter");
  await select(page, "B52");
  await page.keyboard.type("Nor");
  const listed = page.getByRole("listbox", { name: "AutoComplete" });
  await expect(listed.getByRole("option")).toHaveText(["North", "Northeast"]);
  await expect(page.locator("textarea.sheetwrite-editor")).toHaveValue("Nor");
  await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect.poll(() => region(page, 51)).toBe("Northeast");
});
