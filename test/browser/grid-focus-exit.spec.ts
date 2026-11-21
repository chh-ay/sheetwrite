import type { Page } from "@playwright/test";

import { expect, gridCellTexts, test } from "./fixtures.js";

// Tab moves between cells inside the grid, as in Excel, so the grid needs a
// way out for the keyboard: F6 and Shift+F6, as Excel's F6 moves between the
// parts of its window, and Escape then Tab.

/** Where the focus is, against the grid host `grid` and the shell part `part` (DOM identity). */
function focusIn(page: Page, grid: string, part?: string) {
  return page.evaluate(
    ([gridSelector, partSelector]) => {
      const active = document.activeElement;
      const host = document.querySelector(gridSelector);
      const region = partSelector === undefined ? null : document.querySelector(partSelector);
      return {
        onGrid: active === host,
        inGrid: host !== null && active !== null && host.contains(active),
        inPart: region !== null && active !== null && region.contains(active),
      };
    },
    [grid, part] as const,
  );
}

test.describe("the spreadsheet shell", () => {
  const GRID = ".sheetwrite-shell-grid";

  async function focusGrid(page: Page): Promise<void> {
    await page.setViewportSize({ width: 1_440, height: 900 });
    await page.goto("/showcases/spreadsheet/");
    const nameBox = page.getByRole("textbox", { name: "Cell reference" });
    await expect(nameBox).toBeEnabled();
    await nameBox.fill("B2");
    await nameBox.press("Enter");
    await expect.poll(async () => (await focusIn(page, GRID)).onGrid).toBe(true);
  }

  test("Tab stays in the sheet, and F6 cycles the shell's parts", async ({ page }) => {
    await focusGrid(page);
    for (let press = 0; press < 3; press++) await page.keyboard.press("Tab");
    expect((await focusIn(page, GRID)).onGrid).toBe(true);

    await page.keyboard.press("F6");
    expect((await focusIn(page, GRID, ".sheetwrite-shell-tabs")).inPart).toBe(true);
    await page.keyboard.press("F6");
    expect((await focusIn(page, GRID, ".sheetwrite-shell-status")).inPart).toBe(true);
    await page.keyboard.press("F6");
    expect((await focusIn(page, GRID, ".sheetwrite-shell-toolbar-row")).inPart).toBe(true);
    await page.keyboard.press("F6");
    expect((await focusIn(page, GRID, ".sheetwrite-shell-formula")).inPart).toBe(true);
    await page.keyboard.press("F6");
    expect((await focusIn(page, GRID)).onGrid).toBe(true);
    await page.keyboard.press("Shift+F6");
    expect((await focusIn(page, GRID, ".sheetwrite-shell-formula")).inPart).toBe(true);
  });

  test("Escape then Tab leaves the sheet", async ({ page }) => {
    await focusGrid(page);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    expect((await focusIn(page, GRID)).inGrid).toBe(false);
  });

  test("the grid names its way out once, in its description", async ({ page }) => {
    await focusGrid(page);
    await expect(page.locator(GRID)).toHaveAttribute("aria-description", /F6/);
  });
});

test.describe("a grid on its own", () => {
  const GRID = ".sw-vw-stage .sheetwrite";

  async function focusGrid(page: Page): Promise<void> {
    await page.goto("/vanilla/");
    await expect(page.getByTestId("lifecycle")).toHaveAttribute("data-phase", "live", {
      timeout: 20_000,
    });
    await expect.poll(() => gridCellTexts(page, GRID), { timeout: 15_000 }).not.toEqual([]);
    await page.locator(GRID).focus();
    await expect.poll(async () => (await focusIn(page, GRID)).onGrid).toBe(true);
  }

  for (const [keys, forward] of [
    [["F6"], true],
    [["Shift+F6"], false],
    [["Escape", "Tab"], true],
    [["Escape", "Shift+Tab"], false],
  ] as const) {
    test(`${keys.join(" then ")} moves the focus ${forward ? "after" : "before"} the grid`, async ({
      page,
    }) => {
      await focusGrid(page);
      for (const key of keys) await page.keyboard.press(key);
      const side = await page.evaluate((selector) => {
        const host = document.querySelector(selector);
        const active = document.activeElement;
        if (host === null || active === null || active === document.body) return "none";
        if (host.contains(active)) return "grid";
        return host.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING
          ? "after"
          : "before";
      }, GRID);
      expect(side).toBe(forward ? "after" : "before");
    });
  }
});
