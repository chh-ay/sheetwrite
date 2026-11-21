import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures.js";

interface Target {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The shown elements that match `selector`, with their boxes. */
function targets(page: Page, selector: string): Promise<Target[]> {
  return page.evaluate((query) => {
    return [...document.querySelectorAll<HTMLElement>(query)].flatMap((element) => {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return [];
      const name =
        element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.className;
      return [{ name, x: box.x, y: box.y, width: box.width, height: box.height }];
    });
  }, selector);
}

/** Targets narrower or shorter than 24 px, by name and size. */
function tooSmall(list: readonly Target[]): string[] {
  return list
    .filter((target) => target.width < 24 || target.height < 24)
    .map((target) => `${target.name} ${target.width}x${target.height}`);
}

/** Pairs of targets whose boxes share more than a hairline. */
function overlapping(list: readonly Target[]): string[] {
  const pairs: string[] = [];
  list.forEach((a, index) => {
    for (const b of list.slice(index + 1)) {
      const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (width > 0.5 && height > 0.5) pairs.push(`${a.name} / ${b.name}`);
    }
  });
  return pairs;
}

/** Every tab the strip shows lies wholly inside it, so no label is cut. */
async function expectWholeTabs(tabList: Locator): Promise<void> {
  const list = await tabList.boundingBox();
  if (list === null) throw new Error("The ribbon tab list is hidden");
  for (const tab of await tabList.getByRole("tab").all()) {
    const box = await tab.boundingBox();
    if (box === null) throw new Error("A shown ribbon tab has no box");
    expect(box.x).toBeGreaterThanOrEqual(list.x - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(list.x + list.width + 0.5);
  }
}

test("at 390 px the ribbon shows whole tabs and lists the rest under More tabs @portability", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/showcases/sort/");
  const ribbon = page.getByRole("region", { name: "Ribbon" });
  const tabList = ribbon.getByRole("tablist", { name: "Ribbon tabs" });
  await expect(tabList).toBeVisible({ timeout: 30_000 });
  await tabList.scrollIntoViewIfNeeded();
  await expectWholeTabs(tabList);

  const data = tabList.getByRole("tab", { name: "Data", exact: true });
  if (!(await data.isVisible())) {
    await ribbon.getByRole("button", { name: "More tabs" }).click();
    await page
      .getByRole("menu", { name: "More tabs" })
      .getByRole("menuitem", { name: "Data", exact: true })
      .click();
  }
  await expect(data).toBeVisible();
  await expect(data).toHaveAttribute("aria-selected", "true");
  await expectWholeTabs(tabList);
  await expect(ribbon.getByRole("button", { name: /^Sort/ }).first()).toBeVisible();
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("ribbon and sheet tab controls are at least 24 px and do not overlap", async ({ page }) => {
    await page.goto("/showcases/spreadsheet/");
    await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled({ timeout: 30_000 });
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

    const tabRow = await targets(page, ".sheetwrite-ribbon-tabs button");
    expect(tabRow.map((target) => target.name)).toContain("Collapse the ribbon");
    expect(tooSmall(tabRow)).toEqual([]);
    expect(overlapping(tabRow)).toEqual([]);

    // At 390 px the Clipboard group folds into one button that opens it.
    const ribbon = page.getByRole("region", { name: "Ribbon" });
    if (!(await ribbon.getByRole("button", { name: "Paste options" }).isVisible())) {
      await ribbon
        .getByRole("group", { name: "Clipboard", exact: true })
        .getByRole("button", { name: "Clipboard", exact: true })
        .click();
    }
    const paste = await targets(page, '[aria-label="Paste options"]');
    expect(paste).toHaveLength(1);
    expect(tooSmall(paste)).toEqual([]);

    // The active tab's options button sits in the tab's own right padding.
    const sheetTabs = await targets(
      page,
      ".sheetwrite-tab:not(.sheetwrite-tab-active), .sheetwrite-tab-add, .sheetwrite-tab-options-button",
    );
    const active = await targets(page, ".sheetwrite-tab-active");
    expect(sheetTabs.map((target) => target.name)).toContain("Add sheet");
    expect(tooSmall([...sheetTabs, ...active])).toEqual([]);
    expect(overlapping(sheetTabs)).toEqual([]);
  });

  test("dashboard slicer buttons are at least 24 px and do not overlap", async ({ page }) => {
    await page.goto("/showcases/dashboards/");
    const slicers = page.locator(".sheetwrite-dashboard-slicer-value");
    await expect(slicers.first()).toBeVisible({ timeout: 30_000 });
    const buttons = await targets(
      page,
      ".sheetwrite-dashboard-slicer-value, .sheetwrite-dashboard-slicer-clear",
    );
    expect(buttons.some((target) => target.name === "Clear")).toBe(true);
    expect(tooSmall(buttons)).toEqual([]);
    expect(overlapping(buttons)).toEqual([]);
  });
});
