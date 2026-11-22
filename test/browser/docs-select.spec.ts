import { expect, type Page, test } from "@playwright/test";

import { siteUrl, waitForHydration } from "./fixtures.js";

// The engine filter on the formula reference exercises Select.tsx, the WAI-ARIA
// select-only combobox that showcases also use. Its code loads on first use; a
// press or click made before it arrives must act once (islands/client.tsx).
// Base test: each reload aborts lazy imports, which Firefox reports as page errors.

const FORMULA_PAGE = siteUrl("/docs/reference/formula-functions/math/");
/** Longer than a replayed event's second toggle would take to close the list. */
const REPLAY_SETTLE_MS = 300;

test("the engine filter opens once on an input made before its code arrives, then chooses and filters @portability", async ({
  page,
}) => {
  await page.goto(FORMULA_PAGE);
  const field = page.getByRole("combobox", { name: "Available in" });
  // The closed list is hidden; include it so its state stays checkable.
  const list = page.getByRole("listbox", { name: "Available in", includeHidden: true });
  for (const activation of ["Enter", " ", "ArrowDown", "click"] as const) {
    // Reload with the filter's code held until the reader has acted.
    const { promise: released, resolve: release } = Promise.withResolvers<void>();
    await page.route(/\/assets\/FormulaReference-[^/]+\.js$/, async (route) => {
      await released;
      await route.continue();
    });
    await page.reload();
    await waitForHydration(page);
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
      await page.keyboard.press(activation);
    }
    release();

    await expect(list, activation).toBeVisible();
    await expect(field).toHaveAttribute("aria-expanded", "true");
    // Once: a replayed event that toggled twice would have closed it again.
    await page.waitForTimeout(REPLAY_SETTLE_MS);
    await expect(list, activation).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(field).toBeFocused();
    await expect(field).toHaveText("Either engine");
    // The server-rendered field and the hydrated one are the same size and place.
    expect(await placement(), activation).toEqual(before);
    await page.unrouteAll();
  }

  // Choosing an option filters the table, and focus stays on the field.
  const default_rows = await page.locator('tr[data-engine="default"]').count();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(list).toBeHidden();
  await expect(field).toBeFocused();
  await expect(field).toHaveText("Default and full");
  await expect(page.locator(".sw-formula-filter").getByRole("status")).toHaveText(
    `${default_rows} functions`,
  );
  await expect(page.locator('tr[data-engine="full"]:visible')).toHaveCount(0);
});

function engine_filter(page: Page) {
  const field = page.getByRole("combobox", { name: "Available in" });
  const list = page.getByRole("listbox", { name: "Available in", includeHidden: true });
  return {
    field,
    list,
    status: page.locator(".sw-formula-filter").getByRole("status"),
    option: (name: string) => list.getByRole("option", { name, exact: true, includeHidden: true }),
    /** The option aria-activedescendant points at, or null while it points nowhere. */
    activeOption: () =>
      field.evaluate((element) => {
        const id = element.getAttribute("aria-activedescendant");
        return id === null ? null : (document.getElementById(id)?.textContent ?? "missing");
      }),
  };
}

/** Too little room under the field for the open list. */
const ROOM_BELOW_PX = 12;
/** Layout rounds boxes to device pixels. */
const BOX_ROUNDING_PX = 1;

// Chromium only: the keys are handled in script, alike in every engine.
test("the engine filter follows the select-only combobox pattern: state, keys, typeahead, closing, placement", async ({
  page,
}) => {
  await page.goto(FORMULA_PAGE);
  await waitForHydration(page);
  const { field, list, status, option, activeOption: active_option } = engine_filter(page);
  await expect(field).toMatchAriaSnapshot(`- combobox "Available in": Either engine`);
  await expect(field).toHaveAttribute("aria-expanded", "false");
  await expect(field).not.toHaveAttribute("aria-activedescendant");

  // The list opens on the current value; moving is not choosing.
  await field.focus();
  await page.keyboard.press("ArrowDown");
  await expect(list).toMatchAriaSnapshot(`
    - listbox "Available in":
      - option "Either engine" [selected]
      - option "Default and full"
      - option "Full only"
  `);
  await expect.poll(active_option).toBe("Either engine");
  for (const [key, expected] of [
    ["ArrowDown", "Default and full"],
    ["ArrowDown", "Full only"],
    ["ArrowDown", "Full only"],
    ["ArrowUp", "Default and full"],
    ["Home", "Either engine"],
    ["End", "Full only"],
    ["PageUp", "Either engine"],
    ["PageDown", "Full only"],
  ] as const) {
    await page.keyboard.press(key);
    await expect.poll(active_option, `${key} moves to ${expected}`).toBe(expected);
  }
  await expect(field).toHaveText("Either engine");

  // Enter and Space choose; Escape closes without choosing.
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(field).toHaveText("Default and full");
  await expect(option("Default and full")).toHaveAttribute("aria-selected", "true");
  await expect(option("Either engine")).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press(" ");
  await expect.poll(active_option).toBe("Default and full");
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

  // Typing opens on the matching option; a second letter within the window extends the search.
  await page.keyboard.press("e");
  await expect(list).toBeVisible();
  await expect.poll(active_option).toBe("Either engine");
  await page.keyboard.press("Escape");
  await page.keyboard.type("de");
  await expect.poll(active_option).toBe("Default and full");
  // Tab picks the active option, as the pattern does, and moves focus on.
  await page.keyboard.press("Tab");
  await expect(list).toBeHidden();
  await expect(field).not.toBeFocused();
  await expect(field).toHaveText("Default and full");
  await expect(status).toHaveText(
    `${await page.locator('tr[data-engine="default"]').count()} functions`,
  );

  // A press outside closes without choosing.
  await field.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await field.click();
  await expect(list).toHaveAttribute("data-placement", "below");
  await page.getByRole("heading", { level: 1 }).click();
  await expect(list).toBeHidden();
  await expect(field).toHaveText("Default and full");

  // A viewport that ends just under the field: the list opens above it.
  const field_bottom = await field.evaluate((element) => {
    window.scrollTo({ top: 0, behavior: "instant" });
    return element.getBoundingClientRect().bottom;
  });
  await page.setViewportSize({ width: 1280, height: Math.ceil(field_bottom) + ROOM_BELOW_PX });
  await field.click();
  await expect(list).toHaveAttribute("data-placement", "above");
  const [field_box, list_box] = await Promise.all([field.boundingBox(), list.boundingBox()]);
  if (field_box === null || list_box === null) throw new Error("The field or its list has no box.");
  expect(list_box.y + list_box.height).toBeLessThanOrEqual(field_box.y);
  expect(list_box.y).toBeGreaterThanOrEqual(0);
  await page.keyboard.press("Escape");

  // A list too short for every option scrolls the active one into view.
  await page.addStyleTag({ content: ".sw-select__list { max-height: 3rem; }" });
  await page.keyboard.press("Enter");
  const in_view = (name: string) =>
    list.evaluate(
      (element, { optionName: option_name, rounding }) => {
        const target = [...element.querySelectorAll('[role="option"]')].find(
          (candidate) => candidate.textContent === option_name,
        );
        if (target === undefined) return false;
        const outer = element.getBoundingClientRect();
        const inner = target.getBoundingClientRect();
        return inner.top >= outer.top - rounding && inner.bottom <= outer.bottom + rounding;
      },
      { optionName: name, rounding: BOX_ROUNDING_PX },
    );
  await page.keyboard.press("End");
  await expect.poll(() => in_view("Full only")).toBe(true);
  await page.keyboard.press("Home");
  await expect.poll(() => in_view("Either engine")).toBe(true);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  // @portability: WebKit chooses an option on tap only through `on:click` (Select.tsx).
  test("tapping opens the list and tapping an option chooses it @portability", async ({ page }) => {
    await page.goto(FORMULA_PAGE);
    await waitForHydration(page);
    const { field, list, status, option } = engine_filter(page);
    const full_rows = await page.locator('tr[data-engine="full"]').count();
    await field.tap();
    await expect(list).toBeVisible();
    await option("Full only").tap();
    await expect(list).toBeHidden();
    await expect(field).toHaveText("Full only");
    await expect(status).toHaveText(`${full_rows} functions`);
  });
});
