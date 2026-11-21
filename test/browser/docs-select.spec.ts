import { expect, siteUrl, test, waitForHydration } from "./fixtures.js";

// The docs site's select (docs/src/components/Select.tsx) through the formula
// reference's engine filter. Its code loads on first use (or ahead, at low
// priority, when the page is idle); a press or click made before it arrives
// must act once. islands/client.tsx holds and replays it; Enter and Space also
// reach the check that leaves a native element's activation keys to the browser.

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
  const defaultRows = await page.locator('tr[data-engine="default"]').count();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(list).toBeHidden();
  await expect(field).toBeFocused();
  await expect(field).toHaveText("Default and full");
  await expect(page.locator(".sw-formula-filter").getByRole("status")).toHaveText(
    `${defaultRows} functions`,
  );
  await expect(page.locator('tr[data-engine="full"]:visible')).toHaveCount(0);
});
