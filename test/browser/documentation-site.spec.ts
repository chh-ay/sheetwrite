import { readFileSync } from "node:fs";

import type { Page } from "@playwright/test";

import { expect, siteUrl, test, waitForHydration } from "./fixtures.js";

const SITE_TITLE = "Sheetwrite — Spreadsheet, data grid & workbook engine · XLSX/CSV";
const SITE_DESCRIPTION =
  "Spreadsheet and data-grid engine for multi-sheet workbooks, with XLSX/CSV exchange, Rust/WASM core, and React/Vue/Svelte framework adapters.";
const SOCIAL_IMAGE_ALT =
  "Sheetwrite multi-sheet workbook with selected formula cell and sheet tabs";

test("on a phone, documentation has a visible route back home and to the showcases", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/docs/start/first-grid/");
  await waitForHydration(page);
  await page.getByRole("link", { name: "Sheetwrite home", exact: true }).click();
  await expect(page).toHaveURL(siteUrl("/"));
  // Phones keep the site links in the header's menu.
  await page.getByRole("button", { name: "Site menu", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Site", exact: true })
    .getByRole("link", { name: "Docs", exact: true })
    .click();
  await expect(page).toHaveURL(siteUrl("/docs/"));
  await expect(
    page
      .locator("main")
      .getByRole("link", { name: /Getting started/ })
      .first(),
  ).toBeVisible();
  // Showcases is a tab of the documentation bar at every width.
  await page
    .getByRole("navigation", { name: "Documentation sections", exact: true })
    .getByRole("link", { name: "Showcases", exact: true })
    .click();
  await expect(page).toHaveURL(siteUrl("/showcases/"));
});

test("a moved page redirects permanently and forwards its old heading link", async ({
  page,
  request,
}) => {
  const redirect = await request.get("/docs/guides/configuration/", { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe("/docs/features/grid/options-and-presentation/");
  // The heading moved to another page than the redirect target; the target forwards it.
  await page.goto("/docs/guides/configuration/#datasource-pages");
  await expect(page).toHaveURL(/\/docs\/features\/data\/datasources\/#requests-and-pages$/);
  await expect(page.locator("#requests-and-pages")).toBeVisible();
});

test("feature overview cards lead to short examples and formatted result sheets", async ({
  page,
}) => {
  await page.goto("/docs/features/formatting/");
  await waitForHydration(page);
  await page
    .locator(".sw-section-cards")
    .getByRole("link", { name: /Number formats/ })
    .click();
  await expect(page).toHaveURL(/\/docs\/features\/formatting\/number-formats\/$/);
  const result = page.locator(".sw-grid-result").first();
  await expect(result.getByRole("columnheader", { name: "A", exact: true })).toBeVisible();
  await expect(result.getByRole("cell", { name: "1.234,50", exact: true })).toBeVisible();
  const setup = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "Full setup" }) })
    .first();
  await expect(setup).not.toHaveAttribute("open");
  await setup.locator("summary").click();
  await expect(setup.locator("pre")).toBeVisible();
});

test("site root serves the product landing with its search and social metadata", async ({
  page,
}) => {
  const wasmRequests: string[] = [];
  page.on("request", (request) => {
    if (/\.wasm(?:$|\?)/.test(request.url())) wasmRequests.push(request.url());
  });
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  // Exactly one H1, and no live grid runtime on the landing.
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator("main canvas, main .sheetwrite")).toHaveCount(0);
  await expect(page.getByTestId("landing-product-story")).toBeVisible();
  expect(wasmRequests).toEqual([]);
  await expect(page).toHaveTitle(SITE_TITLE);
  for (const [selector, content] of [
    ['meta[name="description"]', SITE_DESCRIPTION],
    ['meta[property="og:description"]', SITE_DESCRIPTION],
    ['meta[name="twitter:description"]', SITE_DESCRIPTION],
    ['meta[property="og:title"]', SITE_TITLE],
    ['meta[name="twitter:title"]', SITE_TITLE],
    ['meta[property="og:image:alt"]', SOCIAL_IMAGE_ALT],
    ['meta[name="twitter:image:alt"]', SOCIAL_IMAGE_ALT],
    ['meta[property="og:image:width"]', "1200"],
    ['meta[property="og:image:height"]', "630"],
  ] as const) {
    await expect(page.locator(selector)).toHaveAttribute("content", content);
  }
  const socialImageDimensions = await page.evaluate(async () => {
    const image = new Image();
    image.src = "/og-sheetwrite.webp";
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  expect(socialImageDimensions).toEqual({ width: 1200, height: 630 });
  const graph: Array<Record<string, unknown>> = (
    await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((scripts) => scripts.map((script) => JSON.parse(script.textContent ?? "null")))
  ).flatMap((entry) => entry?.["@graph"] ?? []);
  expect(graph.find((entry) => entry["@type"] === "WebSite")).toBeDefined();
  // The published version follows the packages, not a hand-copied number.
  const { version } = JSON.parse(
    readFileSync(new URL("../../packages/core/package.json", import.meta.url), "utf8"),
  ) as { version: string };
  expect(graph.find((entry) => entry["@type"] === "SoftwareSourceCode")).toMatchObject({
    codeRepository: "https://github.com/chh-ay/sheetwrite",
    license: "https://opensource.org/license/mit",
    version,
  });
  // The benchmark section publishes real generated numbers, never placeholders.
  await expect(page.locator("#benchmarks li").first()).toContainText(/\d/);
  await page.getByRole("link", { name: /Performance & scale/ }).click();
  await expect(page).toHaveURL(siteUrl("/showcases/performance/"));
  await page.goBack();
  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page).toHaveURL(siteUrl("/docs/start/installation/"));
});

test("documentation pages render one heading and a canonical URL", async ({ page }) => {
  for (const route of [
    "start/installation/",
    "reference/compatibility-limits/",
    "api/core/grid/",
  ]) {
    const response = await page.goto(`/docs/${route}`);
    expect(response?.ok(), route).toBe(true);
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://www.sheetwrite.dev/docs/${route}`,
    );
  }
});

test("framework tabs synchronize and persist across guides", async ({ page }) => {
  await page.goto("/docs/start/installation/");
  await waitForHydration(page);
  const frameworkPanel = page.getByRole("tabpanel", { name: /^(Vanilla|React|Vue|Svelte)$/ });
  const tab = (name: string) => page.getByRole("tab", { name, exact: true });
  const storedFramework = () => page.evaluate(() => localStorage.getItem("sheetwrite-framework"));
  const expectHighlighted = async (language: string) => {
    const colors = await frameworkPanel
      .locator(`pre[data-language="${language}"] .code`)
      .first()
      .evaluate((code) => ({
        code: getComputedStyle(code).color,
        tokens: Array.from(
          code.querySelectorAll<HTMLElement>("span[style]"),
          (token) => getComputedStyle(token).color,
        ),
      }));
    expect(colors.tokens.some((color) => color !== colors.code)).toBe(true);
  };
  await tab("React").click();
  await expect(tab("React")).toHaveAttribute("aria-selected", "true");
  await expect(frameworkPanel).toContainText("@sheetwrite/react");
  await expectHighlighted("tsx");
  expect(await storedFramework()).toBe("React");

  await page.goto("/docs/frameworks/lifecycle/");
  await expect(tab("React")).toHaveAttribute("aria-selected", "true");
  await expect(frameworkPanel).toContainText("SheetwriteGrid");
  await tab("Vue").click();
  expect(await storedFramework()).toBe("Vue");
  await page.goto("/docs/start/installation/");
  await expect(tab("Vue")).toHaveAttribute("aria-selected", "true");
  await expectHighlighted("vue");
  await tab("Svelte").click();
  await expectHighlighted("svelte");
});

test("generated API pages disclose symbols progressively and open member deep links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1568, height: 900 });
  await page.goto("/docs/api/core/");
  await waitForHydration(page);
  await page.locator('a[href="/docs/api/core/grid/"]').first().click();
  await expect(page).toHaveURL(/\/docs\/api\/core\/grid\/$/);
  await expect(page.locator("main h1")).toContainText("Grid");
  await expect(page.locator(".api-member[open]")).toHaveCount(0);
  // Signatures are for reading, so they carry no copy control; examples keep
  // theirs, also after in-site navigation.
  await expect(page.locator(".api-member .copy, .api-declaration .copy")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy to clipboard" }).first()).toBeVisible();
  await page.locator("#grid-get-cell-at-point summary").click();
  await expect(page.locator("#grid-get-cell-at-point pre")).toContainText(
    "clientX: number, clientY: number",
  );
  await expect(page.locator(".api-declaration")).not.toHaveAttribute("open");
  await page.locator(".api-declaration summary").click();
  await expect(page.locator(".api-declaration .expressive-code")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // A fragment targets a hidden h3; the following collapsed row opens in view.
  await page.goto("/docs/api/core/grid/#applytransaction");
  await waitForHydration(page);
  const member = page.locator("#grid-apply-transaction");
  await expect(member).toHaveAttribute("open", "");
  await expect(member).toBeInViewport();
});

async function openSearch(page: Page) {
  // A concrete page: opening search mid /docs/ redirect re-render is racy.
  await page.goto("/docs/start/installation/");
  await waitForHydration(page);
  await page
    .getByRole("button", { name: /search/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Search documentation" });
  return { dialog, input: dialog.getByLabel("Search documentation") };
}

test("documentation search resolves symbols to their anchors and leaves out test routes", async ({
  page,
}) => {
  for (const [term, href] of [
    ["applyTransaction", "/docs/api/core/grid/#applytransaction"],
    ["SnapshotValidationError", "/docs/api/core/snapshot-validation-error/"],
  ] as const) {
    const { dialog, input } = await openSearch(page);
    await input.pressSequentially(term, { delay: 20 });
    const match = dialog.locator(`a[href='${href}']`).first();
    await expect(match).toBeVisible({ timeout: 15_000 });
    await expect(dialog.locator("[data-action-error]")).toBeHidden();
    await match.click();
    await expect(page).toHaveURL(siteUrl(href));
    await expect(page.getByText(term).first()).toBeVisible();
  }
  // The query must first return real documentation results, or the check
  // below proves nothing. Both words are in the test route's title and in the
  // kept-parts guide.
  const { dialog, input } = await openSearch(page);
  await input.fill("XLSX verification");
  await expect(dialog.locator("a[href^='/docs/']").first()).toBeVisible({ timeout: 15_000 });
  await expect(dialog.locator("a[href^='/test/']")).toHaveCount(0);
});

test.describe(() => {
  // A missing page or index logs its failed request to the console.
  test.use({ allowErrors: true });

  test("unknown URLs serve the site 404 with a 404 status", async ({ page, request }) => {
    const response = await page.goto("/this-page-does-not-exist/");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Documentation", exact: true })).toBeVisible();
    expect((await request.get("/docs/proof/")).status()).toBe(404);
  });

  for (const missingIndex of [false, true]) {
    test(`documentation search reports ${missingIndex ? "an unbuilt index" : "a failed index"}`, async ({
      page,
    }) => {
      await page.route("**/pagefind/**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (missingIndex || pathname.endsWith(".pf_meta")) {
          await route.fulfill({ status: missingIndex ? 404 : 503, body: "Unavailable" });
        } else {
          await route.continue();
        }
      });
      const { dialog, input } = await openSearch(page);
      await input.fill("applyTransaction");
      const error = dialog.locator("[data-action-error]");
      const unbuilt = "Search becomes available after the static index is built.";
      if (missingIndex) {
        await expect(dialog).toContainText(unbuilt);
        await expect(error).toBeHidden();
      } else {
        await expect(error).toHaveText(
          "Search failed; check your connection and change the query to try again.",
          { timeout: 15_000 },
        );
        await expect(dialog).not.toContainText(unbuilt);
      }
    });
  }
});
