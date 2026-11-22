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
  const shown_launchers = launchers.filter({ visible: true });
  const shown_owners = async () =>
    (await shown_launchers.evaluateAll((links) => links.map((link) => link.dataset.owner))).sort();
  const owners = CAPABILITY_OWNERS.map((owner) => owner.id).sort();
  expect(await shown_owners()).toEqual(owners);
  await expect(page.locator('main [role="grid"], main canvas')).toHaveCount(0);

  // No card clips its content at any common width (the theme changes colours, not layout).
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
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
    expect(clipped, `${width}px`).toEqual([]);
  }

  // Filters are toggle buttons that work from the keyboard and show focus.
  await page.setViewportSize({ width: 1440, height: 900 });
  const all_filter = page.getByRole("button", { name: "All", exact: true });
  const data_filter = page.getByRole("button", { name: "Data & scale", exact: true });
  await all_filter.focus();
  await page.keyboard.press("Tab");
  await expect(data_filter).toBeFocused();
  expect(await data_filter.evaluate((button) => getComputedStyle(button).outlineStyle)).not.toBe(
    "none",
  );
  await data_filter.press("Enter");
  await expect(data_filter).toHaveAttribute("aria-pressed", "true");
  await expect(all_filter).toHaveAttribute("aria-pressed", "false");
  // The filter shows exactly the cards its group labels, and some.
  await expect
    .poll(() =>
      shown_launchers
        .locator(".sw-hub-launch__meta")
        .evaluateAll((labels) => [...new Set(labels.map((label) => label.textContent?.trim()))]),
    )
    .toEqual(["Data & scale"]);
  const data_group = page.locator(".sw-hub-launch__meta", { hasText: /^\s*Data & scale\s*$/ });
  await expect(shown_launchers).toHaveCount(await launchers.filter({ has: data_group }).count());
  await all_filter.click();
  await expect(shown_launchers).toHaveCount(owners.length);
  // Every owning showcase URL resolves.
  for (const owner of CAPABILITY_OWNERS) {
    expect((await page.request.get(owner.href)).ok(), owner.href).toBe(true);
  }
});
