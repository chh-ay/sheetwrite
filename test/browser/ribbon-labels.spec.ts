import type { Page } from "@playwright/test";

import { expect, nextFrames, test } from "./fixtures.js";

// An icon never stands alone: every ribbon button that shows an icon shows its
// label too. A group that no longer fits with its labels collapses into one
// labelled button (the group's icon and name), as Excel's ribbon does, rather
// than shrinking to bare icons. Excel's own icon rows stay as Excel draws them:
// the dense Font, Alignment and Number rows, and the zoom box's − and +.

/**
 * Selects each ribbon tab the row shows and lists the visible buttons with an
 * icon and no visible text, except the rows Excel draws as icons.
 */
function bareIconsOnEveryTab(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const ribbon = document.querySelector(".sheetwrite-ribbon");
    if (ribbon === null) return ["no ribbon"];
    const frames = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const shown = (element: Element) => {
      const box = element.getBoundingClientRect();
      return box.width > 2 && box.height > 2 && getComputedStyle(element).visibility !== "hidden";
    };
    const hidden = (element: Element | null, button: Element) => {
      for (
        let node = element;
        node !== null && node !== button.parentElement;
        node = node.parentElement
      ) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.clipPath === "inset(50%)") return true;
      }
      return false;
    };
    const hasText = (button: Element) => {
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
        if ((text.textContent ?? "").trim() === "") continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        if (range.getBoundingClientRect().width > 2 && !hidden(text.parentElement, button)) {
          return true;
        }
      }
      return false;
    };
    const found: string[] = [];
    const tabs = [...ribbon.querySelectorAll<HTMLElement>(".sheetwrite-ribbon-tabs [role=tab]")];
    for (const tab of tabs) {
      if (!shown(tab)) continue;
      tab.click();
      await frames();
      for (const button of ribbon.querySelectorAll("button")) {
        if (!shown(button)) continue;
        const icon = button.querySelector("svg, .sheetwrite-icon");
        if (icon === null || !shown(icon) || hasText(button)) continue;
        if (button.closest(".sheetwrite-ribbon-row") !== null) continue;
        if (button.closest('.sheetwrite-ribbon-group[aria-label="Zoom"]') !== null) continue;
        const group = button.closest(".sheetwrite-ribbon-group")?.getAttribute("aria-label");
        const name = button.getAttribute("aria-label") ?? button.title;
        found.push(`${tab.textContent ?? ""}: ${group ?? "tab row"} › ${name}`);
      }
    }
    return found;
  });
}

test("no ribbon button shows an icon without its label, on any tab, 1440 px to 320 px", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.goto("/showcases/spreadsheet/");
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
  const problems = new Set<string>();

  for (const sidePanel of [false, true]) {
    if (sidePanel) {
      await page.setViewportSize({ width: 1_440, height: 900 });
      await page.getByRole("tab", { name: "Data" }).click();
      await page.getByRole("button", { name: "Custom Sort" }).first().click();
      await expect(page.locator(".sheetwrite-panel-host:not([hidden])")).toBeVisible();
    }
    for (let width = 1_440; width >= 320; width -= 20) {
      await page.setViewportSize({ width, height: 900 });
      await nextFrames(page);
      for (const bare of await bareIconsOnEveryTab(page)) {
        problems.add(`${sidePanel ? "with" : "without"} panel at ${width} px, ${bare}`);
      }
    }
  }
  expect([...problems]).toEqual([]);
});

test("a collapsed group is one labelled button that opens its labelled commands", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.goto("/showcases/spreadsheet/");
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
  await page.getByRole("tab", { name: "Data" }).click();
  await page.getByRole("button", { name: "Custom Sort" }).first().click();
  await page.setViewportSize({ width: 1_000, height: 900 });
  const group = page.locator('.sheetwrite-ribbon-group[aria-label="Show/Hide"]');
  await expect(group).toHaveAttribute("data-size", "collapsed");
  const button = group.locator(".sheetwrite-ribbon-group-button");
  await expect(button).toHaveAccessibleName("Show/Hide");
  await expect(button).toContainText("Show/Hide");
  await expect(button).toHaveAttribute("aria-haspopup", "true");

  // Keyboard: Enter opens it, and its commands show their labels.
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  for (const name of ["Hide Rows", "Unhide Rows", "Hide Columns", "Unhide Columns"]) {
    await expect(page.getByRole("button", { name, exact: true })).toContainText(name);
  }
  // The popup stays inside the page's visible area, scrollbar left out.
  const inside = await page.evaluate(() => {
    const item = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Unhide Columns" && button.getClientRects().length > 0,
    );
    const box = item?.getBoundingClientRect();
    return box !== undefined && box.left >= 0 && box.right <= document.documentElement.clientWidth;
  });
  expect(inside).toBe(true);
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true });

  test("a tap opens a collapsed group @portability", async ({ page }) => {
    await page.setViewportSize({ width: 1_000, height: 900 });
    await page.goto("/showcases/spreadsheet/");
    await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
    await page.getByRole("tab", { name: "Data" }).tap();
    const button = page.locator(
      '.sheetwrite-ribbon-group[aria-label="Show/Hide"] .sheetwrite-ribbon-group-button',
    );
    await expect(button).toBeVisible();
    await button.tap();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: "Hide Rows", exact: true })).toContainText(
      "Hide Rows",
    );
  });
});
