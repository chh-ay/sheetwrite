import { expect, type Locator, type Page, test } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

// The Solid site's select (docs-solid/src/components/Select.tsx), the WAI-ARIA
// select-only combobox, through the formula reference's engine filter. The
// React site's filter is Base UI, so these skip there.

const FORMULA_PAGE = siteUrl("/docs/reference/formula-functions/math/");

async function waitForHydration(page: Page): Promise<void> {
  await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15_000 });
}

interface EngineFilter {
  readonly field: Locator;
  readonly list: Locator;
  readonly status: Locator;
  /** The option aria-activedescendant points at, or null while it points nowhere. */
  readonly activeOption: () => Promise<string | null>;
  readonly option: (name: string) => Locator;
}

async function openFormulaPage(page: Page): Promise<EngineFilter> {
  await page.goto(FORMULA_PAGE);
  await waitForHydration(page);
  const field = page.getByRole("combobox", { name: "Available in" });
  test.skip(
    !(await field.evaluate((element) => element.classList.contains("sw-select__trigger"))),
    "The React site's engine filter is Base UI.",
  );
  return engineFilter(page, field);
}

function engineFilter(page: Page, field: Locator): EngineFilter {
  // The closed list is hidden; include it so its state stays checkable.
  const list = page.getByRole("listbox", { name: "Available in", includeHidden: true });
  return {
    field,
    list,
    status: page.locator(".sw-formula-filter").getByRole("status"),
    activeOption: () =>
      field.evaluate((element) => {
        const id = element.getAttribute("aria-activedescendant");
        return id === null ? null : (document.getElementById(id)?.textContent ?? "missing");
      }),
    option: (name) => list.getByRole("option", { name, exact: true, includeHidden: true }),
  };
}

async function rowCount(page: Page, engine: "default" | "full"): Promise<number> {
  return page.locator(`tr[data-engine="${engine}"]`).count();
}

test("the engine filter has its name, role and state in the accessibility tree @portability", async ({
  page,
}) => {
  const { field, list } = await openFormulaPage(page);
  await expect(field).toMatchAriaSnapshot(`- combobox "Available in": Either engine`);
  await expect(field).toHaveAttribute("aria-expanded", "false");
  await expect(field).not.toHaveAttribute("aria-activedescendant");

  await field.focus();
  await page.keyboard.press("Enter");
  await expect(field).toHaveAttribute("aria-expanded", "true");
  await expect(list).toMatchAriaSnapshot(`
    - listbox "Available in":
      - option "Either engine" [selected]
      - option "Default and full"
      - option "Full only"
  `);
});

test("arrows, Home, End, PageUp and PageDown move the active option @portability", async ({
  page,
}) => {
  const { field, activeOption } = await openFormulaPage(page);
  await field.focus();
  await page.keyboard.press("ArrowDown");
  await expect(field).toHaveAttribute("aria-expanded", "true");
  // The list opens on the current value.
  await expect.poll(activeOption).toBe("Either engine");

  const steps: readonly [string, string][] = [
    ["ArrowDown", "Default and full"],
    ["ArrowDown", "Full only"],
    ["ArrowDown", "Full only"],
    ["ArrowUp", "Default and full"],
    ["Home", "Either engine"],
    ["End", "Full only"],
    ["PageUp", "Either engine"],
    ["PageDown", "Full only"],
  ];
  for (const [key, expected] of steps) {
    await page.keyboard.press(key);
    await expect.poll(activeOption, `${key} moves to ${expected}`).toBe(expected);
  }
  // Moving is not choosing.
  await expect(field).toHaveText("Either engine");
  await expect(field).toBeFocused();
});

test("Enter and Space choose; Escape closes without choosing; focus stays on the field @portability", async ({
  page,
}) => {
  const { field, list, status, option, activeOption } = await openFormulaPage(page);
  const defaultRows = await rowCount(page, "default");

  await field.focus();
  await page.keyboard.press("Enter");
  await expect(list).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(list).toBeHidden();
  await expect(field).toHaveAttribute("aria-expanded", "false");
  await expect(field).toBeFocused();
  await expect(field).toHaveText("Default and full");
  await expect(option("Default and full")).toHaveAttribute("aria-selected", "true");
  await expect(option("Either engine")).toHaveAttribute("aria-selected", "false");
  await expect(status).toHaveText(`${defaultRows} functions`);
  await expect(page.locator('tr[data-engine="full"]:visible')).toHaveCount(0);

  await page.keyboard.press(" ");
  await expect(list).toBeVisible();
  await expect.poll(activeOption).toBe("Default and full");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press(" ");
  await expect(list).toBeHidden();
  await expect(field).toHaveText("Full only");

  await page.keyboard.press("Enter");
  await page.keyboard.press("Home");
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(field).toBeFocused();
  await expect(field).toHaveText("Full only");
  await expect(field).not.toHaveAttribute("aria-activedescendant");
});

test("typing opens the list on the matching option @portability", async ({ page }) => {
  const { field, list, activeOption } = await openFormulaPage(page);
  await field.focus();
  await page.keyboard.press("f");
  await expect(list).toBeVisible();
  await expect.poll(activeOption).toBe("Full only");
  // A second letter within the typeahead window extends the search.
  await page.keyboard.press("Escape");
  await page.keyboard.type("de");
  await expect.poll(activeOption).toBe("Default and full");
  await page.keyboard.press("Enter");
  await expect(field).toHaveText("Default and full");
});

test("a press outside or Tab closes the list @portability", async ({ page }) => {
  const { field, list } = await openFormulaPage(page);
  await field.click();
  await expect(list).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(list).toBeHidden();
  await expect(field).toHaveText("Either engine");

  await field.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  // Tab picks the active option, as the pattern does, and moves focus on.
  await page.keyboard.press("Tab");
  await expect(list).toBeHidden();
  await expect(field).not.toBeFocused();
  await expect(field).toHaveText("Default and full");
});

test("the list opens above the field near the bottom of the viewport @portability", async ({
  page,
}) => {
  const { field, list } = await openFormulaPage(page);
  // Below the field when there is room.
  await field.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await field.click();
  await expect(list).toBeVisible();
  await expect(list).toHaveAttribute("data-placement", "below");
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();

  // A viewport that ends 12 px under the field: no room below, plenty above.
  const fieldBottom = await field.evaluate((element) => {
    window.scrollTo({ top: 0, behavior: "instant" });
    return element.getBoundingClientRect().bottom;
  });
  await page.setViewportSize({ width: 1280, height: Math.ceil(fieldBottom) + 12 });
  await field.click();
  await expect(list).toBeVisible();
  await expect(list).toHaveAttribute("data-placement", "above");
  const [fieldBox, listBox] = await Promise.all([field.boundingBox(), list.boundingBox()]);
  expect(listBox!.y + listBox!.height).toBeLessThanOrEqual(fieldBox!.y);
  expect(listBox!.y).toBeGreaterThanOrEqual(0);
});

test("the active option scrolls into view in a list too short for every option @portability", async ({
  page,
}) => {
  const { field, list } = await openFormulaPage(page);
  await page.addStyleTag({ content: ".sw-select__list { max-height: 3rem; }" });
  await field.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("End");
  const inView = (name: string) =>
    list.evaluate((element, optionName) => {
      const option = Array.from(element.querySelectorAll('[role="option"]')).find(
        (candidate) => candidate.textContent === optionName,
      );
      if (option === undefined) return false;
      const outer = element.getBoundingClientRect();
      const inner = option.getBoundingClientRect();
      return inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
    }, name);
  await expect.poll(() => inView("Full only")).toBe(true);
  await page.keyboard.press("Home");
  await expect.poll(() => inView("Either engine")).toBe(true);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("tapping opens the list and tapping an option chooses it @portability", async ({ page }) => {
    const { field, list, status, option } = await openFormulaPage(page);
    const fullRows = await rowCount(page, "full");
    await field.tap();
    await expect(list).toBeVisible();
    await option("Full only").tap();
    await expect(list).toBeHidden();
    await expect(field).toHaveText("Full only");
    await expect(status).toHaveText(`${fullRows} functions`);
  });
});

// The filter's code loads on first use (or ahead, at low priority, when the
// page is idle); a press or click made before it arrives must act once.
for (const activation of ["Enter", "Space", "ArrowDown", "click"] as const) {
  test(`the engine filter opens once on ${activation} made before its code arrives @portability`, async ({
    page,
  }) => {
    await openFormulaPage(page);
    // Reload with the filter's code held until the reader has acted.
    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(/\/assets\/FormulaReference-[^/]+\.js$/, async (route) => {
      await released;
      await route.continue();
    });
    await page.reload();
    await waitForHydration(page);
    const { field, list } = engineFilter(
      page,
      page.getByRole("combobox", { name: "Available in" }),
    );
    // In page coordinates: focusing or opening the field may scroll the page.
    const placement = () =>
      field.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height };
      });
    const before = await placement();

    if (activation === "click") {
      await field.click();
    } else {
      await field.focus();
      await page.keyboard.press(activation === "Space" ? " " : activation);
    }
    release();

    await expect(list).toBeVisible();
    await expect(field).toHaveAttribute("aria-expanded", "true");
    // Once: a replayed event that toggled twice would have closed it again.
    await page.waitForTimeout(300);
    await expect(list).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(field).toBeFocused();
    // The server-rendered field and the hydrated one are the same size and place.
    expect(await placement()).toEqual(before);
  });
}
