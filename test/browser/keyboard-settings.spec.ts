import type { Page } from "@playwright/test";

import type { Grid, KeyBindings } from "../../packages/core/src/types.js";
import { expect, test } from "./fixtures.js";

// The Keyboard shortcuts panel (#802) with real key events in each browser
// engine: find a command by pressing its keys, record new keys for Bold, and
// press them on the grid. The ribbon entries are covered by unit tests.

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
    __keyBindingEvents?: KeyBindings[];
  }
}

/** The modifier the page treats as Mod: ⌘ where it reports an Apple platform, else Ctrl. */
async function open(page: Page): Promise<"Meta" | "Control"> {
  await page.setViewportSize({ width: 1_600, height: 900 });
  await page.goto("/showcases/spreadsheet/");
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
  return page.evaluate(() => {
    const grid = window.__sheetwriteSpreadsheetGrid!;
    // The shell's grid has no chrome of its own; keep it that way.
    grid.setConfig({ toolbar: false, tabs: false, keyboardSettings: true });
    window.__keyBindingEvents = [];
    grid.on("key-bindings-change", ({ bindings }) => window.__keyBindingEvents!.push(bindings));
    const apple = /Mac|iPhone|iPad|iPod/i;
    return apple.test(navigator.platform) || apple.test(navigator.userAgent) ? "Meta" : "Control";
  });
}

test("rebinds Bold with real keys and the new keys work at once @portability", async ({ page }) => {
  const mod = await open(page);
  const gridHost = page.locator(".sheetwrite").first();
  await gridHost.focus();
  await page.evaluate(() => window.__sheetwriteSpreadsheetGrid!.openKeyboardSettings());

  const panel = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(panel).toBeVisible();
  const search = panel.getByRole("searchbox", { name: "Search commands or press keys" });
  await expect(search).toBeFocused();

  // Pressing keys in the search box finds the command that owns them.
  await page.keyboard.press(`${mod}+Shift+L`);
  await expect(panel.locator("tr[data-action]:visible")).toHaveCount(1);
  await expect(panel.locator('tr[data-action="toggleFilter"]')).toBeVisible();
  await search.fill("bold");

  const boldLabel = await page.evaluate(() =>
    window.__sheetwriteSpreadsheetGrid!.getShortcutLabel("bold"),
  );
  await panel.getByRole("button", { name: `Change ${boldLabel} for Bold` }).click();
  await expect(panel.getByRole("status")).toHaveText(
    "Recording keys for Bold. Press the new keys, or Escape to cancel.",
  );
  await page.keyboard.press(`${mod}+Alt+K`);

  await expect(panel.getByRole("status")).toContainText("Bold now uses");
  expect(await page.evaluate(() => window.__keyBindingEvents)).toEqual([
    { bold: ["Mod+Alt+K", "Mod+2"] },
  ]);

  // Escape closes the panel and gives the grid its focus back.
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(gridHost).toBeFocused();

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
  await gridHost.focus();
  await page.keyboard.press(`${mod}+Alt+K`);
  await expect
    .poll(() => page.evaluate(() => window.__sheetwriteSpreadsheetGrid!.getFocusCellStyle().bold))
    .toBe(true);
});
