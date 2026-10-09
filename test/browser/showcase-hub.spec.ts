import { expect, type Page, test } from "@playwright/test";
import { CAPABILITY_OWNERS } from "../../docs/src/showcases/capabilities.js";
import { siteUrl } from "./playwright.config.js";

interface BootErrors {
  console: string[];
  page: string[];
}

function collectErrors(page: Page): BootErrors {
  const errors: BootErrors = { console: [], page: [] };
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => {
    errors.page.push(error.message);
  });
  return errors;
}

test("hub links every showcase, filters accessibly, and never clips a card", async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(siteUrl("/showcases/"));
  await page.waitForLoadState("networkidle");

  const site = page.getByRole("navigation", { name: "Site" });
  await expect(site.getByRole("link", { name: "Showcases" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator("main h1")).toHaveCount(1);

  // One launcher per showcase owner. The live engine view launches from the landing page.
  const launchers = page.locator("main a[data-owner]");
  const owners = CAPABILITY_OWNERS.filter((owner) => owner.id !== "engine")
    .map((owner) => owner.id)
    .sort();
  expect(
    (await launchers.evaluateAll((links) => links.map((link) => link.dataset.owner))).sort(),
  ).toEqual(owners);

  // The hub is a static launcher: it must not mount a Grid or a renderer.
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
  const workbookFilter = page.getByRole("button", { name: "Workbook", exact: true });
  await expect(allFilter).toHaveAttribute("aria-pressed", "true");
  await allFilter.focus();
  await page.keyboard.press("Tab");
  await expect(dataFilter).toBeFocused();
  const focusStyle = await dataFilter.evaluate((button) => {
    const style = getComputedStyle(button);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(focusStyle.outlineWidth).not.toBe("0px");
  await dataFilter.press("Enter");
  await expect(dataFilter).toHaveAttribute("aria-pressed", "true");
  await expect(allFilter).toHaveAttribute("aria-pressed", "false");
  await expect(launchers).toHaveCount(2);

  await workbookFilter.click();
  await expect(workbookFilter).toHaveAttribute("aria-pressed", "true");
  await expect(launchers).toHaveCount(1);
  await expect(launchers).toHaveAttribute("data-owner", "interoperability");
  await allFilter.click();
  await expect(launchers).toHaveCount(owners.length);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("every owning showcase URL stays resolvable", async ({ request }) => {
  for (const owner of CAPABILITY_OWNERS) {
    const response = await request.get(siteUrl(owner.href));
    expect(response.ok(), `${owner.href} must resolve`).toBe(true);
  }
});
