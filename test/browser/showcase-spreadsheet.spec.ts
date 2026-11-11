import type { Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { hasOpaqueForeground } from "./canvas-assertions.js";
import { expect, fitsViewport, nextFrames, screenshotPixels, test } from "./fixtures.js";

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
    /** Class names of shell elements Chromium reported as shifted. */
    __sheetwriteShellShifts?: string[];
  }
}

async function open(page: Page, width = 1_600, height = 900): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("/showcases/spreadsheet/");
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
}

async function select(page: Page, reference: string): Promise<void> {
  const nameBox = page.getByRole("textbox", { name: "Cell reference" });
  await nameBox.fill(reference);
  await nameBox.press("Enter");
}

function cell(page: Page, sheet: string, row: number, col: number) {
  return page.evaluate(
    ([sheetId, r, c]) => {
      const stored = window.__sheetwriteSpreadsheetGrid?.store.getCell({
        sheet: sheetId,
        row: r,
        col: c,
      });
      return { resolved: stored?.resolved ?? null, bold: stored?.style.bold === true };
    },
    [sheet, row, col] as const,
  );
}

test("ribbon commands edit the workbook and AutoSum totals the ledger", async ({ page }) => {
  await open(page);
  const ribbon = page.getByRole("region", { name: "Ribbon" });
  await select(page, "B2");
  const bold = ribbon.getByRole("button", { name: "Bold", exact: true });
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  expect((await cell(page, "sales", 1, 1)).bold).toBe(true);

  await select(page, "G50");
  await ribbon.getByRole("button", { name: "AutoSum" }).click();
  await expect(page.getByRole("textbox", { name: "Formula bar" })).toHaveValue("=SUM(G2:G49)");
  const total = await cell(page, "summary", 5, 2);
  expect((await cell(page, "sales", 49, 6)).resolved).toBeCloseTo(Number(total.resolved), 6);
});

test("the cell editor lists functions, picks one with the keyboard, and guides the arguments", async ({
  page,
}) => {
  await open(page);
  await select(page, "G3");
  await page.keyboard.type("=ROU");
  const editor = page.locator("textarea.sheetwrite-editor");
  const list = page.getByRole("listbox", { name: "Functions" });
  await expect(list.getByRole("option", { name: "ROUND", exact: true })).toBeVisible();
  await expect(editor).toHaveAttribute("aria-controls", (await list.getAttribute("id")) ?? "");
  await page.keyboard.press("Enter");
  await expect(editor).toHaveValue("=ROUND(");
  await expect(list).toHaveCount(0);

  const guide = page.getByRole("status").filter({ hasText: "ROUND(" });
  await expect(guide.locator("strong")).toHaveText("number");
  await page.keyboard.type("A1:A3, ");
  await expect(guide.locator("strong")).toHaveText("digits");
  await page.keyboard.type("2");
  await page.keyboard.press("Enter");
  await expect(editor).toHaveCount(0);
});

test("automatic ribbon layout follows host width until the user chooses a mode", async ({
  page,
}) => {
  // Wide enough that the showcase host is above the default compact width.
  await open(page);
  const ribbon = page.getByRole("region", { name: "Ribbon" });
  await expect(ribbon).toHaveAttribute("data-mode", "full");
  const editing = page.locator('.sheetwrite-ribbon-group[aria-label="Editing"]');
  await expect(editing).toHaveAttribute("data-size", "large");
  const panel = ribbon.getByRole("tabpanel");
  const fullHeight = await panel.evaluate((element) => element.getBoundingClientRect().height);

  await page.getByRole("button", { name: "Narrow" }).click();
  await expect(ribbon).toHaveAttribute("data-mode", "compact");
  expect(await panel.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(
    fullHeight,
  );
  // At this width groups fold into dropdowns, and all of them stay on one row.
  await expect(editing).toHaveAttribute("data-size", "collapsed");
  const rows = await panel.locator(".sheetwrite-ribbon-group").evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return Math.round(box.top + box.height / 2);
    }),
  );
  expect(rows.length).toBeGreaterThan(0);
  expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(2);
  await editing.getByRole("button", { name: /Editing/ }).click();
  await expect(page.getByRole("button", { name: "AutoSum" })).toBeVisible();

  await page.getByRole("button", { name: "Wide" }).click();
  await expect(ribbon).toHaveAttribute("data-mode", "full");
  await expect(editing).toHaveAttribute("data-size", "large");
  // A chosen mode sticks through later width changes.
  await ribbon.getByRole("button", { name: "Compact ribbon" }).click();
  await expect(ribbon).toHaveAttribute("data-mode", "compact");
  await page.getByRole("button", { name: "Narrow" }).click();
  await page.getByRole("button", { name: "Wide" }).click();
  await expect(ribbon).toHaveAttribute("data-mode", "compact");
});

test("on a phone the ribbon arrives at its compact height and follows the site theme", async ({
  page,
}) => {
  // Chromium reports every shift with the elements that moved.
  await page.addInitScript(() => {
    interface LayoutShift extends PerformanceEntry {
      readonly sources: readonly { readonly node: Node | null }[];
    }
    const moved: string[] = [];
    window.__sheetwriteShellShifts = moved;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as LayoutShift[]) {
        for (const { node } of entry.sources) {
          const element = node instanceof Element ? node : (node?.parentElement ?? null);
          if (element?.closest(".sheetwrite-shell")) moved.push(element.className);
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await open(page, 390, 844);
  await expect(page.getByRole("region", { name: "Ribbon" })).toHaveAttribute(
    "data-mode",
    "compact",
  );
  // Shifts are reported after the frame that paints them.
  await nextFrames(page);
  expect(await page.evaluate(() => window.__sheetwriteShellShifts)).toEqual([]);

  const panel = page.locator(".sheetwrite-ribbon-panel:not([hidden])");
  const background = () => panel.evaluate((element) => getComputedStyle(element).backgroundColor);
  const backgrounds: string[] = [];
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await expect.poll(background).not.toBe(backgrounds.at(-1) ?? "");
    backgrounds.push(await background());
    expect(await fitsViewport(page)).toBe(true);
  }
});

test("at 320 px the tabs scroll beside the layout buttons instead of under them @portability", async ({
  page,
}) => {
  await open(page, 320, 640);
  const ribbon = page.getByRole("region", { name: "Ribbon" });
  const home = ribbon.getByRole("tab", { name: "Home", exact: true });
  const view = ribbon.getByRole("tab", { name: "View", exact: true });
  await home.focus();
  await home.press("End");
  await expect(view).toBeFocused();
  const tab = await view.boundingBox();
  const button = await ribbon.getByRole("button", { name: "Compact ribbon" }).boundingBox();
  if (tab === null || button === null) throw new Error("The View tab or layout button is hidden");
  expect(tab.x + tab.width).toBeLessThanOrEqual(button.x);
  expect(await fitsViewport(page)).toBe(true);
});

test("at 390 px a cut-off tab label stays clear of the layout button", async ({ page }) => {
  await open(page, 390, 844);
  const ribbon = page.getByRole("region", { name: "Ribbon" });
  const tabList = ribbon.getByRole("tablist", { name: "Ribbon tabs" });
  await tabList.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const list = await tabList.boundingBox();
  const button = await ribbon.getByRole("button", { name: "Compact ribbon" }).boundingBox();
  if (list === null || button === null) throw new Error("The tab list or layout button is hidden");
  // The tabs do not fit at this width, so a label is cut at the list's end.
  expect(await tabList.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  // Between the layout button and the last six pixels of the tab list there
  // is only plain tab-row background, no part of a tab label.
  const strip = await page.screenshot({
    clip: {
      x: list.x + list.width - 6,
      y: button.y,
      width: button.x - (list.x + list.width - 6),
      height: button.height,
    },
  });
  expect(hasOpaqueForeground(await screenshotPixels(page, strip))).toBe(false);
});

for (const mode of ["full", "compact"] as const) {
  test(`${mode} ribbon keeps tab, menu and toggle keyboard semantics @portability`, async ({
    page,
  }) => {
    await open(page);
    const ribbon = page.getByRole("region", { name: "Ribbon" });
    const switcher = ribbon.getByRole("button", { name: "Compact ribbon" });
    await expect(ribbon).toHaveAttribute("data-mode", "full");
    if (mode === "compact") {
      await switcher.focus();
      await switcher.press("Space");
    }
    await expect(ribbon).toHaveAttribute("data-mode", mode);
    await expect(switcher).toHaveAttribute("aria-pressed", String(mode === "compact"));

    const home = ribbon.getByRole("tab", { name: "Home", exact: true });
    const insert = ribbon.getByRole("tab", { name: "Insert", exact: true });
    await home.focus();
    await home.press("ArrowRight");
    await expect(insert).toBeFocused();
    await expect(insert).toHaveAttribute("aria-selected", "true");
    await insert.press("Home");
    await expect(home).toBeFocused();

    await select(page, "B2");
    const bold = ribbon.getByRole("button", { name: "Bold", exact: true });
    if (!(await bold.isVisible())) {
      await ribbon
        .getByRole("group", { name: "Font", exact: true })
        .getByRole("button", { name: "Font", exact: true })
        .click();
    }
    await bold.focus();
    await bold.press("Space");
    await expect(bold).toHaveAttribute("aria-pressed", "true");
    expect((await cell(page, "sales", 1, 1)).bold).toBe(true);

    const options = page.getByRole("button", { name: "Borders options" });
    await options.focus();
    await options.press("ArrowDown");
    const menu = page.getByRole("menu", { name: "Borders", exact: true });
    await expect(menu.getByRole("menuitem", { name: "Bottom Border", exact: true })).toBeFocused();
    // locator.press refocuses twice without preventScroll. That can scroll
    // WebKit's document and dismiss the fixed menu before the key is sent.
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Top Border", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(options).toBeFocused();
    await expect(options).toHaveAttribute("aria-expanded", "false");
  });
}

test("the ribbon runs the Data query commands by keyboard", async ({ page }) => {
  await open(page);
  // The session connects after the shell is shown and loads the saved query's table.
  await expect.poll(async () => (await cell(page, "targets", 1, 0)).resolved).toBe("North");
  expect((await cell(page, "targets", 4, 0)).resolved).toBeNull();
  const ribbon = page.getByRole("region", { name: "Ribbon" });
  await ribbon.getByRole("tab", { name: "Data", exact: true }).click();

  const refreshAll = ribbon.getByRole("button", { name: "Refresh All", exact: true });
  await refreshAll.focus();
  await refreshAll.press("Enter");
  const status = page.locator(".sheetwrite-action-status");
  await expect(status).toHaveText("Queries refreshed.");

  const queries = ribbon.getByRole("button", { name: "Queries & Connections", exact: true });
  await queries.focus();
  await queries.press("Enter");
  const panel = page.locator(".sheetwrite-panel");
  await expect(panel.getByText("Regional targets", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Refresh All", exact: true })).toBeVisible();
  await ribbon.getByRole("button", { name: "Get Data", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toBeFocused();

  // A read-only grid keeps the commands, and the refresh reports the rejected write.
  await page.evaluate(() => window.__sheetwriteSpreadsheetGrid?.setReadOnly(true));
  await refreshAll.click();
  await expect(status).not.toHaveText(/Queries refreshed\.|Refreshing queries/u);
});
