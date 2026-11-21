import type { Page } from "@playwright/test";

import { expect, nextFrames, test } from "./fixtures.js";

// An icon never stands alone: every ribbon button that shows an icon shows its
// label too. A group that no longer fits with its labels collapses into one
// labelled button (the group's icon and name), as Excel's ribbon does, rather
// than shrinking to bare icons. Excel's own icon rows stay as Excel draws them:
// the dense Font, Alignment and Number rows, and the zoom box's − and +. No
// label is ever cut: groups that still do not fit fold into one "More" button.

/**
 * Selects each ribbon tab the row shows and lists the visible buttons with an
 * icon and no visible text, except the rows Excel draws as icons, and every
 * label cut by its button, the ribbon's scrolling rows or the page edge.
 */
function labelProblemsOnEveryTab(page: Page): Promise<string[]> {
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
    // A label is cut when its text box leaves its button, an ancestor that
    // clips (a scrolling row), or the page; or when its own text overflows.
    const cut = (button: Element) => {
      const page = document.documentElement;
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
        if ((text.textContent ?? "").trim() === "") continue;
        const parent = text.parentElement;
        if (parent === null || hidden(parent, button)) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        const box = range.getBoundingClientRect();
        if (box.width <= 2) continue;
        if (parent.scrollWidth > parent.clientWidth + 1) return text.textContent ?? "";
        const boxes: DOMRect[] = [new DOMRect(0, 0, page.clientWidth, page.clientHeight)];
        for (let node: Element | null = button; node !== null; node = node.parentElement) {
          if (node === button || getComputedStyle(node).overflowX !== "visible") {
            boxes.push(node.getBoundingClientRect());
          }
          if (node === ribbon) break;
        }
        const outside = boxes.some(
          (edge) =>
            box.left < edge.left - 1 ||
            box.right > edge.right + 1 ||
            box.top < edge.top - 1 ||
            box.bottom > edge.bottom + 1,
        );
        if (outside) return text.textContent ?? "";
      }
      return undefined;
    };
    const found: string[] = [];
    const tabs = [...ribbon.querySelectorAll<HTMLElement>(".sheetwrite-ribbon-tabs [role=tab]")];
    for (const tab of tabs) {
      if (!shown(tab)) continue;
      tab.click();
      await frames();
      for (const button of ribbon.querySelectorAll("button")) {
        if (!shown(button)) continue;
        const group = button.closest(".sheetwrite-ribbon-group")?.getAttribute("aria-label");
        const name = button.getAttribute("aria-label") ?? button.title;
        const where = `${tab.textContent ?? ""}: ${group ?? "tab row"} › ${name}`;
        const clipped = cut(button);
        if (clipped !== undefined) found.push(`${where} label "${clipped.trim()}" is cut`);
        const icon = button.querySelector("svg, .sheetwrite-icon");
        if (icon === null || !shown(icon) || hasText(button)) continue;
        if (button.closest(".sheetwrite-ribbon-row") !== null) continue;
        if (button.closest('.sheetwrite-ribbon-group[aria-label="Zoom"]') !== null) continue;
        found.push(`${where} shows an icon without its label`);
      }
    }
    return found;
  });
}

test("every ribbon button shows its whole label, on any tab, 1440 px to 320 px", async ({
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
      for (const problem of await labelProblemsOnEveryTab(page)) {
        problems.add(`${sidePanel ? "with" : "without"} panel at ${width} px, ${problem}`);
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
  // One column in the command model's order, inside the page's visible area
  // (scrollbar left out).
  const layout = await page.evaluate(() => {
    const boxes = ["Hide Rows", "Unhide Rows", "Hide Columns", "Unhide Columns"].map((name) =>
      [...document.querySelectorAll(".sheetwrite-ribbon-popup button")]
        .find((button) => button.textContent === name)
        ?.getBoundingClientRect(),
    );
    if (boxes.some((box) => box === undefined)) return "missing";
    const [first, ...rest] = boxes as DOMRect[];
    if (rest.some((box, index) => box.left !== first?.left || box.top <= (boxes[index]?.top ?? 0)))
      return "not one column in order";
    const right = Math.max(...boxes.map((box) => box?.right ?? 0));
    return right <= document.documentElement.clientWidth ? "ok" : "outside the page";
  });
  expect(layout).toBe("ok");
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
});

test("running a command from a collapsed group's dropdown closes it", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 900 });
  await page.goto("/showcases/spreadsheet/");
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
  await page.getByRole("tab", { name: "Data" }).click();
  const popups = page.locator(".sheetwrite-ribbon-popup");
  const sortGroup = page.locator(
    '.sheetwrite-ribbon-group[aria-label="Sort & Filter"] .sheetwrite-ribbon-group-button',
  );

  // Pointer: Custom Sort opens the Sort panel, and the dropdown is gone.
  await sortGroup.click();
  await expect(sortGroup).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Custom Sort" }).first().click();
  await expect(page.locator(".sheetwrite-panel-host:not([hidden])")).toBeVisible();
  await expect(popups).toHaveCount(0);
  await expect(sortGroup).toHaveAttribute("aria-expanded", "false");

  // Keyboard: the dropdown closes, and focus goes where the command leaves it,
  // here the grid, not into the ribbon or nowhere.
  await page.setViewportSize({ width: 1_000, height: 900 });
  const showHide = page.locator(
    '.sheetwrite-ribbon-group[aria-label="Show/Hide"] .sheetwrite-ribbon-group-button',
  );
  await showHide.focus();
  await page.keyboard.press("Enter");
  await expect(showHide).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Enter");
  await expect(popups).toHaveCount(0);
  const focus = await page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) return "nowhere";
    return active.closest(".sheetwrite-ribbon") === null ? "outside the ribbon" : "in the ribbon";
  });
  expect(focus).toBe("outside the ribbon");
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
