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

test("hub launches every owning showcase without errors", async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1568, height: 844 });
  await page.goto(siteUrl("/showcases/"));
  await page.waitForLoadState("networkidle");

  await expect(page.locator("main h1")).toHaveText("Eight real experiences. Pick your proof.");
  // The Showcases link is page-current on the hub itself.
  await expect(page.locator('.sw-product-nav a[aria-current="page"]')).toHaveText("Showcases");

  // Capability examples and framework integrations each occupy one desktop row.
  const launchers = page.locator(".sw-hub-scenes .sw-hub-launch");
  await expect(launchers).toHaveCount(8);
  await expect(launchers.first()).toHaveAttribute("data-owner", "performance");
  const launcherGeometry = await launchers.evaluateAll((links) =>
    links.map((link) => {
      const bounds = link.getBoundingClientRect();
      return {
        bottom: Math.round(bounds.bottom),
        height: Math.round(bounds.height),
        top: Math.round(bounds.top),
        width: Math.round(bounds.width),
      };
    }),
  );
  expect(new Set(launcherGeometry.map(({ width }) => width)).size).toBe(1);
  expect(new Set(launcherGeometry.map(({ height }) => height)).size).toBe(1);
  expect(
    [...new Set(launcherGeometry.map(({ top }) => top))].map(
      (top) => launcherGeometry.filter((card) => card.top === top).length,
    ),
  ).toEqual([4, 4]);
  expect(Math.min(...launcherGeometry.map(({ height }) => height))).toBeGreaterThanOrEqual(320);
  const galleryWidth = await page
    .locator(".sw-hub-scenes")
    .evaluate((gallery) => Math.round(gallery.getBoundingClientRect().width));
  expect(galleryWidth).toBeGreaterThanOrEqual(1568 - 96);
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const overflow = await launchers.evaluateAll((cards) =>
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
      expect(overflow, `${width}px ${theme} cards must not clip content`).toEqual([]);
      await expect(page.locator(".sw-hub-scene").first()).toBeVisible();
      await expect(page.locator(".sw-hub__owner-count").first()).toBeVisible();
      const columns = await launchers.evaluateAll(
        (cards) => new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left))).size,
      );
      expect(columns).toBe(width >= 1280 ? 4 : width >= 640 ? 2 : 1);
    }
  }
  await page.setViewportSize({ width: 1568, height: 844 });
  const bodyFontSizes = await page
    .locator(".sw-hub-launch__body > strong, .sw-hub-launch__summary")
    .evaluateAll((labels) =>
      labels.map((label) => Number.parseFloat(getComputedStyle(label).fontSize)),
    );
  expect(Math.min(...bodyFontSizes)).toBeGreaterThanOrEqual(14);

  // The hub is a static launcher: previews do not eagerly mount a Grid or a
  // renderer surface.
  await expect(page.locator('main [role="grid"], main canvas')).toHaveCount(0);

  // Selection, keyboard activation, and focus-visible treatment are explicit.
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
  await expect(dataFilter).toHaveAttribute("aria-pressed", "false");
  await expect(launchers).toHaveCount(1);
  await expect(launchers).toHaveAttribute("data-owner", "interoperability");
  await expect(page.getByText("1 / 8 shown")).toBeVisible();
  await allFilter.click();
  await expect(allFilter).toHaveAttribute("aria-pressed", "true");
  await expect(launchers).toHaveCount(8);

  // Landmarks and headings: one h1, labelled sections, real list semantics.
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Site" })).toBeVisible();

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("every owning showcase URL stays resolvable", async ({ request }) => {
  for (const owner of CAPABILITY_OWNERS) {
    const response = await request.get(siteUrl(owner.href));
    expect(response.ok(), `${owner.href} must resolve`).toBe(true);
  }
});

test("all four capability routes share one readable scenario scope list", async ({ page }) => {
  await page.setViewportSize({ width: 1568, height: 900 });
  for (const route of ["performance", "database", "interoperability", "collaboration"]) {
    await page.goto(siteUrl(`/showcases/${route}/`));
    const hero = page.locator(".sw-capability-hero");
    await expect(hero).toHaveCount(1);
    const facts = hero.locator(".sw-capability-hero__facts > div");
    await expect(facts).toHaveCount(4);
    const geometry = await facts.evaluateAll((items) =>
      items.map((item) => {
        const bounds = item.getBoundingClientRect();
        return { left: Math.round(bounds.left), top: Math.round(bounds.top) };
      }),
    );
    expect(new Set(geometry.map(({ left }) => left)).size, `${route} hero columns`).toBe(1);
    expect(new Set(geometry.map(({ top }) => top)).size, `${route} hero rows`).toBe(4);
  }
});
