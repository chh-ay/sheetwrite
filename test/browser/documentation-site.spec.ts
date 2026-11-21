import { readFileSync } from "node:fs";

import type { Page } from "@playwright/test";

import { expect, siteUrl, test, waitForHydration } from "./fixtures.js";

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
  // The heading stayed on the redirect target under a new id; the fragment follows it.
  await page.goto("/docs/guides/collaboration/#revisions");
  await expect(page).toHaveURL(/\/docs\/features\/collaboration\/#restoring-versions$/);
  await expect(page.locator("#restoring-versions")).toBeInViewport();
});

test("a long outline keeps the entry being read in view and shows that more entries follow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/docs/releases/0.7.0/");
  await waitForHydration(page);
  const rail = page.getByRole("navigation", { name: "On this page" });
  // The outline is longer than its column, so it scrolls there.
  expect(await rail.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect(rail).toHaveAttribute("data-more", "end");
  // Read down to the last entry: it is marked and shown inside the column.
  const last = rail.getByRole("link").last();
  const id = decodeURIComponent((await last.getAttribute("href"))?.slice(1) ?? "");
  // Its heading just below the sticky header, where lib/shell.ts reads.
  await page.evaluate((heading) => {
    const top = document.getElementById(heading)?.getBoundingClientRect().top ?? 0;
    window.scrollTo(0, window.scrollY + top - 80);
  }, id);
  await expect(last).toHaveAttribute("aria-current", "location");
  const [railBox, lastBox] = await Promise.all([rail.boundingBox(), last.boundingBox()]);
  expect(lastBox && railBox && lastBox.y + lastBox.height <= railBox.y + railBox.height).toBe(true);
  await expect(rail).toHaveAttribute("data-more", "start");
});

test("the landing loads no grid runtime, and its social image and version match the files", async ({
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
  for (const [selector, content] of [
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

test("generated API pages show member signatures and mark member deep links", async ({ page }) => {
  await page.setViewportSize({ width: 1568, height: 900 });
  await page.goto("/docs/api/core/");
  await waitForHydration(page);
  await page.locator('a[href="/docs/api/core/grid/"]').first().click();
  await expect(page).toHaveURL(/\/docs\/api\/core\/grid\/$/);
  await expect(page.locator("main h1")).toContainText("Grid");
  // Signatures are for reading, so they carry no copy control; examples keep
  // theirs, also after in-site navigation.
  await expect(page.locator(".api-member .copy, .api-declaration .copy")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy to clipboard" }).first()).toBeVisible();
  // Member signatures are visible without a click.
  await expect(page.locator("#grid-get-cell-at-point pre")).toContainText(
    "clientX: number, clientY: number",
  );
  await expect(page.locator(".api-declaration")).not.toHaveAttribute("open");
  await page.locator(".api-declaration summary").click();
  await expect(page.locator(".api-declaration .expressive-code")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // A fragment targets a hidden search anchor; the following member card is
  // marked and in view.
  await page.goto("/docs/api/core/grid/#applytransaction");
  await waitForHydration(page);
  const member = page.locator("#grid-apply-transaction");
  await expect(member).toHaveAttribute("data-revealed", "");
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

test("search keeps what is typed as it opens and ranks the exact name first", async ({ page }) => {
  // No wait for hydration: a reader types as soon as the dialog opens.
  await page.goto("/docs/start/installation/");
  await page
    .getByRole("button", { name: /search/i })
    .first()
    .click();
  await page.keyboard.type("XLOOKUP");
  const field = page.getByRole("combobox", { name: "Search documentation" });
  const results = page.getByRole("listbox", { name: "Search results" }).getByRole("option");

  await expect(field).toHaveValue("XLOOKUP");
  await expect(results.first()).toHaveAttribute(
    "href",
    "/docs/reference/formula-functions/lookup-reference/#fn-xlookup",
    { timeout: 15_000 },
  );

  await field.fill("createGrid");
  await expect(results.first()).toHaveAttribute("href", "/docs/api/core/create-grid/");
});

test("arrow keys move through search results and Enter opens one", async ({ page }) => {
  const { dialog, input } = await openSearch(page);
  await input.pressSequentially("createGrid", { delay: 20 });
  const results = dialog.getByRole("option");
  await expect(results.first()).toHaveAttribute("href", "/docs/api/core/create-grid/", {
    timeout: 15_000,
  });
  await expect(results.first()).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ArrowDown");
  await expect(results.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(results.first()).toHaveAttribute("aria-selected", "false");
  const href = await results.nth(1).getAttribute("href");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(siteUrl(href ?? ""));
});

test("a search with no match says so", async ({ page }) => {
  const { dialog, input } = await openSearch(page);
  await input.fill("qqzzxx");

  await expect(dialog.getByRole("status")).toHaveText("No results for “qqzzxx”.", {
    timeout: 15_000,
  });
  await expect(dialog.getByRole("option")).toHaveCount(0);
});

test("everyday words and questions find their guide among the first three pages", async ({
  page,
}) => {
  for (const [query, guide] of [
    ["charts", "/docs/features/analysis/charts/"],
    ["import xlsx", "/docs/import-export/xlsx-import/"],
    ["datasource", "/docs/features/data/datasources/"],
    ["autofilter", "/docs/features/data/autofilter/"],
    ["how do I use sheetwrite with react", "/docs/frameworks/react/"],
  ] as const) {
    const { dialog, input } = await openSearch(page);
    await input.fill(query);
    const results = dialog.getByRole("option");
    await expect(results.first()).toBeVisible({ timeout: 15_000 });
    const pages = new Set<string>();
    for (const href of await results.evaluateAll((options) =>
      options.map((option) => option.getAttribute("href") ?? ""),
    )) {
      pages.add(href.split("#")[0] ?? href);
    }
    expect([...pages].slice(0, 3), query).toContain(guide);
  }
});

test("a query that names a framework or a feature guide lists that guide first", async ({
  page,
}) => {
  for (const [query, guide] of [
    ["how do I use sheetwrite with react", "/docs/frameworks/react/"],
    ["how do I use sheetwrite with svelte", "/docs/frameworks/svelte/"],
    ["how do I add a chart", "/docs/features/analysis/charts/"],
    ["how to use conditional formatting", "/docs/features/formatting/conditional-formats/"],
  ] as const) {
    const { dialog, input } = await openSearch(page);
    await input.fill(query);
    const first = dialog.getByRole("option").first();
    await expect(first).toBeVisible({ timeout: 15_000 });
    expect((await first.getAttribute("href"))?.split("#")[0], query).toBe(guide);
  }
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
