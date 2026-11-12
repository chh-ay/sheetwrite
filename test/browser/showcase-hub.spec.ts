import { CAPABILITY_OWNERS } from "../../docs/src/showcases/capabilities.js";
import { expect, test } from "./fixtures.js";

test("hub links every showcase, filters accessibly, and never clips a card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/showcases/");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Showcases" }),
  ).toHaveAttribute("aria-current", "page");

  // One launcher per showcase owner, and no Grid or renderer on the static hub.
  // The cards are static markup: a filter hides the others.
  const launchers = page.locator("main a[data-owner]");
  const shownLaunchers = launchers.filter({ visible: true });
  const shownOwners = async () =>
    (await shownLaunchers.evaluateAll((links) => links.map((link) => link.dataset.owner))).sort();
  const owners = CAPABILITY_OWNERS.map((owner) => owner.id).sort();
  expect(await shownOwners()).toEqual(owners);
  await expect(page.locator('main [role="grid"], main canvas')).toHaveCount(0);

  // No card clips its content at any common width, in either theme.
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const clipped = await launchers.evaluateAll((cards) =>
        cards.flatMap((card) =>
          [card, ...card.querySelectorAll("*")]
            .filter(
              (element) =>
                element.getClientRects().length > 0 &&
                (element.scrollWidth > element.clientWidth ||
                  element.scrollHeight > element.clientHeight),
            )
            .map((element) => element.textContent?.trim()),
        ),
      );
      expect(clipped, `${width}px ${theme}`).toEqual([]);
    }
  }

  // Filters are toggle buttons that work from the keyboard and show focus.
  await page.setViewportSize({ width: 1440, height: 900 });
  const allFilter = page.getByRole("button", { name: "All", exact: true });
  const dataFilter = page.getByRole("button", { name: "Data & scale", exact: true });
  await allFilter.focus();
  await page.keyboard.press("Tab");
  await expect(dataFilter).toBeFocused();
  expect(await dataFilter.evaluate((button) => getComputedStyle(button).outlineStyle)).not.toBe(
    "none",
  );
  await dataFilter.press("Enter");
  await expect(dataFilter).toHaveAttribute("aria-pressed", "true");
  await expect(allFilter).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(shownOwners)
    .toEqual(["data-tools", "database", "host-rows", "performance", "queries", "sort"]);
  await allFilter.click();
  await expect(shownLaunchers).toHaveCount(owners.length);

  // Every owning showcase URL resolves.
  for (const owner of CAPABILITY_OWNERS) {
    expect((await page.request.get(owner.href)).ok(), owner.href).toBe(true);
  }
});
