import type { Page } from "@playwright/test";

import type { Grid, KeyBindings } from "../../packages/core/src/types.js";
import { expect, test } from "./fixtures.js";

// The Keyboard shortcuts panel (#802) in each browser engine: open it from
// File › Options, record new keys for Bold, and press them on the grid.

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
    __keyBindingEvents?: KeyBindings[];
  }
}

async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1_600, height: 900 });
  await page.goto("/showcases/spreadsheet/");
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
  await page.evaluate(() => {
    window.__keyBindingEvents = [];
    window.__sheetwriteSpreadsheetGrid!.on("key-bindings-change", ({ bindings }) =>
      window.__keyBindingEvents!.push(bindings),
    );
  });
}

test("rebinds Bold from File › Options and the new keys work at once @portability", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("tab", { name: "File" }).click();
  const entry = page.getByRole("button", { name: "Keyboard Shortcuts" });
  await entry.focus();
  await page.keyboard.press("Enter");

  const panel = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(panel).toBeVisible();
  const search = panel.getByRole("searchbox", { name: "Search commands or press keys" });
  await expect(search).toBeFocused();

  // Pressing keys in the search box finds the command that owns them.
  await page.keyboard.press("ControlOrMeta+Shift+L");
  await expect(panel.locator("tr[data-action]:visible")).toHaveCount(1);
  await expect(panel.locator('tr[data-action="toggleFilter"]')).toBeVisible();
  await search.fill("bold");

  const boldLabel = await page.evaluate(() =>
    window.__sheetwriteSpreadsheetGrid!.getShortcutLabel("bold"),
  );
  const change = panel.getByRole("button", { name: `Change ${boldLabel} for Bold` });
  await change.click();
  await expect(panel.getByRole("status")).toHaveText(
    "Recording keys for Bold. Press the new keys, or Escape to cancel.",
  );
  await page.keyboard.press("ControlOrMeta+Alt+K");

  await expect(panel.getByRole("status")).toContainText("Bold now uses");
  expect(await page.evaluate(() => window.__keyBindingEvents)).toEqual([
    { bold: ["Mod+Alt+K", "Mod+2"] },
  ]);

  // Escape closes the panel and focus returns to File › Options › Keyboard Shortcuts.
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(entry).toBeFocused();

  // The new keys bold the active cell.
  await page.evaluate(() => {
    const grid = window.__sheetwriteSpreadsheetGrid!;
    const sheet = grid.getActiveSheet();
    grid.applyTransaction({
      patches: [
        { op: "set", addr: { sheet, row: 5, col: 0 }, value: { kind: "literal", value: "k" } },
      ],
    });
    grid.setSelection({ kind: "cell", addr: { sheet, row: 5, col: 0 } });
  });
  await page.locator(".sheetwrite").first().focus();
  await page.keyboard.press("ControlOrMeta+Alt+K");
  await expect
    .poll(() => page.evaluate(() => window.__sheetwriteSpreadsheetGrid!.getFocusCellStyle().bold))
    .toBe(true);
});
