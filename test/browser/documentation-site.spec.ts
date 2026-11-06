import { readFileSync } from "node:fs";

import { expect, type Page, test } from "@playwright/test";

import { SITE_BASE, SITE_PORT, siteUrl } from "./playwright.config.js";

interface PageErrors {
  console: string[];
  page: string[];
}

function collectErrors(page: Page): PageErrors {
  const errors: PageErrors = { console: [], page: [] };
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
  return errors;
}

function docsUrl(path = ""): string {
  return siteUrl(`/docs/${path}`);
}

const SITE_TITLE = "Sheetwrite — Spreadsheet, data grid & workbook engine · XLSX/CSV";
const SITE_DESCRIPTION =
  "Spreadsheet and data-grid engine for multi-sheet workbooks, with XLSX/CSV exchange, Rust/WASM core, and React/Vue/Svelte framework adapters.";
const SOCIAL_IMAGE_ALT =
  "Sheetwrite multi-sheet workbook with selected formula cell and sheet tabs";

/** Interactive steps need attached listeners; the root component marks hydration. */
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15_000 });
}

const representativeRoutes = [
  "start/installation/",
  "reference/compatibility-limits/",
  "api/core/grid/",
] as const;

for (const [width, hasDesktopOutline] of [
  [390, false],
  [1440, true],
] as const) {
  test(`documentation has a visible route back home at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(docsUrl("api/core/grid/"));
    await waitForHydration(page);
    if (hasDesktopOutline) {
      await expect(
        page.getByRole("navigation", { name: "On this page", exact: true }),
      ).toBeVisible();
    }
    await page
      .getByRole("navigation", { name: "Product links" })
      .getByRole("link", { name: "Home", exact: true })
      .click();
    await expect(page).toHaveURL(siteUrl("/"));
    await page
      .getByRole("navigation", { name: "Site", exact: true })
      .getByRole("link", { name: "Docs", exact: true })
      .click();
    await expect(page).toHaveURL(docsUrl());
    await expect(page.getByRole("navigation", { name: "On this page", exact: true })).toHaveCount(
      0,
    );
    if (width < 1024) {
      await page.getByRole("button", { name: "Documentation menu", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Documentation", exact: true })
        .getByRole("link", { name: "Showcases", exact: true })
        .click();
    } else {
      await page
        .getByRole("navigation", { name: "Product links" })
        .getByRole("link", { name: "Showcases", exact: true })
        .click();
    }
    await expect(page).toHaveURL(siteUrl("/showcases/"));
  });
}

test("a moved page redirects permanently and forwards its old heading link", async ({
  page,
  request,
}) => {
  const redirect = await request.get(docsUrl("guides/configuration/"), { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe("/docs/features/grid/options-and-presentation/");

  // The heading moved to another page than the redirect target; the target forwards it.
  await page.goto(docsUrl("guides/configuration/#datasource-pages"));
  await expect(page).toHaveURL(/\/docs\/features\/data\/datasources\/#requests-and-pages$/);
  await expect(page.locator("#requests-and-pages")).toBeVisible();
});

test("feature overview cards lead to short examples and formatted result sheets", async ({
  page,
}) => {
  await page.goto(docsUrl("features/formatting/"));
  await waitForHydration(page);
  const cards = page.locator(".sw-section-cards");
  await cards.getByRole("link", { name: /Number formats/ }).click();
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

test("sidebar marks only the nearest documentation route as current", async ({ page }) => {
  for (const [path, label] of [
    ["start/first-grid/", "First grid"],
    ["api/core/", "@sheetwrite/core"],
    ["api/core/grid/", "@sheetwrite/core"],
  ] as const) {
    await page.goto(docsUrl(path));
    const navigation = page.getByRole("navigation", { name: "Documentation" });
    await expect(navigation.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
});

test("site root serves the product landing", async ({ page }) => {
  const errors = collectErrors(page);
  const wasmRequests: string[] = [];
  page.on("request", (request) => {
    if (/\.wasm(?:$|\?)/.test(request.url())) wasmRequests.push(request.url());
  });
  const response = await page.goto(siteUrl("/"));
  expect(response?.ok()).toBe(true);
  // Semantic contract: exactly one H1, and no live grid runtime on the landing.
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator("main canvas, main .sheetwrite")).toHaveCount(0);
  await expect(page.getByTestId("landing-product-story")).toBeVisible();
  expect(wasmRequests).toEqual([]);
  await expect(page).toHaveTitle(SITE_TITLE);
  for (const selector of [
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
  ]) {
    await expect(page.locator(selector)).toHaveAttribute("content", SITE_DESCRIPTION);
  }
  for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
    await expect(page.locator(selector)).toHaveAttribute("content", SITE_TITLE);
  }
  for (const selector of ['meta[property="og:image:alt"]', 'meta[name="twitter:image:alt"]']) {
    await expect(page.locator(selector)).toHaveAttribute("content", SOCIAL_IMAGE_ALT);
  }
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute("content", "630");
  const socialImageDimensions = await page.evaluate(async () => {
    const image = new Image();
    image.src = "/og-sheetwrite.webp";
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  expect(socialImageDimensions).toEqual({ width: 1200, height: 630 });
  const structuredData = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((scripts) => scripts.map((script) => JSON.parse(script.textContent ?? "null")));
  const graph: Array<Record<string, unknown>> = structuredData.flatMap(
    (entry) => entry?.["@graph"] ?? [],
  );
  expect(graph.find((entry) => entry["@type"] === "WebSite")).toBeDefined();
  // The published version must follow the packages, not a hand-copied number.
  const { version } = JSON.parse(
    readFileSync(new URL("../../packages/core/package.json", import.meta.url), "utf8"),
  ) as { version: string };
  expect(graph.find((entry) => entry["@type"] === "SoftwareSourceCode")).toMatchObject({
    codeRepository: "https://github.com/chh-ay/sheetwrite",
    license: "https://opensource.org/license/mit",
    version,
  });
  // Benchmark section publishes real generated numbers, never placeholders.
  await expect(page.locator("#benchmarks li").first()).toContainText(/\d/);
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
  await page.getByRole("link", { name: /Performance & scale/ }).click();
  await expect(page).toHaveURL(siteUrl("/showcases/performance/"));
  await page.goBack();
  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page).toHaveURL(docsUrl("start/installation/"));
});

test("landing animations are bounded, replayable, and reduced-motion complete", async ({
  page,
}) => {
  // The hero is a scripted timeline: each frame writes styles and text into its parts.
  const frameOf = (root: Element) =>
    [...root.querySelectorAll<HTMLElement>("[data-part]")]
      .map((part) => `${part.style.cssText}|${part.textContent}`)
      .join("\n");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(siteUrl("/"));
  await waitForHydration(page);
  const story = page.getByTestId("landing-product-story");
  // Reduced motion: the loop does not run, and the still picture is the finished
  // edit: the chart is in and the recalculated total shows.
  await expect(story).toHaveAttribute("data-landing-running", "false");
  await expect(story.locator('[data-part="d6"]')).toHaveText("$21,808");
  const still = await story.evaluate(frameOf);
  await page.waitForTimeout(400);
  expect(await story.evaluate(frameOf)).toBe(still);
  // Seeking in either direction must work without enabling animation.
  for (const selector of [".ha-acts", ".sw-arch__steps"]) {
    const chapters = page.locator(`${selector} button`);
    for (let index = (await chapters.count()) - 1; index >= 0; index--) {
      await chapters.nth(index).focus();
      await page.keyboard.press("Enter");
      await expect(chapters.nth(index)).toHaveAttribute("aria-current", "step");
      await expect(page.locator(`${selector} [aria-current="step"]`)).toHaveCount(1);
    }
  }
  await expect(story.locator('[data-part="d6"]')).toHaveText("$19,696");
  await expect(story).toHaveAttribute("data-landing-running", "false");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await story.getByRole("button", { name: "Replay animation" }).click();
  await expect(story).toHaveAttribute("data-landing-running", "true");
  const playing = await story.evaluate(frameOf);
  await expect.poll(() => story.evaluate(frameOf)).not.toBe(playing);
  // Off screen, the illustration stops; back on screen, it resumes.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(story).toHaveAttribute("data-landing-running", "false");
  const paused = await story.evaluate(frameOf);
  await page.waitForTimeout(400);
  expect(await story.evaluate(frameOf)).toBe(paused);
  await story.scrollIntoViewIfNeeded();
  await expect(story).toHaveAttribute("data-landing-running", "true");
  await expect.poll(() => story.evaluate(frameOf)).not.toBe(paused);
  await page.goto(docsUrl("start/installation/"));
  await expect(story).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        document.getAnimations().filter((animation) => animation.playState === "running").length,
    ),
  ).toBe(0);
});

test("landing tab lists follow arrow, Home, and End keys", async ({ page }) => {
  await page.goto(siteUrl("/"));
  await waitForHydration(page);
  for (const prefix of ["landing-story-", "landing-tab-"]) {
    const tabs = page.locator(`[role="tab"][id^="${prefix}"]`);
    const count = await tabs.count();
    expect(count).toBeGreaterThan(2);
    const expectActive = async (index: number) => {
      const tab = tabs.nth(index);
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(tab).toBeFocused();
      await expect(tab).toHaveAttribute("tabindex", "0");
      await expect(
        page.locator(`[role="tabpanel"][aria-labelledby="${await tab.getAttribute("id")}"]`),
      ).toHaveCount(1);
      await expect(tabs.and(page.locator('[aria-selected="true"]'))).toHaveCount(1);
    };
    await tabs.first().click();
    await expectActive(0);
    await page.keyboard.press("ArrowRight");
    await expectActive(1);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    // Left from the first tab wraps to the last.
    await expectActive(count - 1);
    await page.keyboard.press("Home");
    await expectActive(0);
    await page.keyboard.press("End");
    await expectActive(count - 1);
  }
});

test("unknown URLs serve the site 404 with a 404 status", async ({ page, request }) => {
  const response = await page.goto(siteUrl("/this-page-does-not-exist/"));
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Documentation", exact: true })).toBeVisible();
  expect((await request.get(siteUrl("/docs/proof/"))).status()).toBe(404);
});

test.describe("documentation site", () => {
  for (const route of representativeRoutes) {
    test(`documentation site renders /docs/${route} without browser errors`, async ({ page }) => {
      const errors = collectErrors(page);
      const escapedRequests: string[] = [];
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (
          url.origin === `http://localhost:${SITE_PORT}` &&
          url.pathname !== SITE_BASE &&
          !url.pathname.startsWith(`${SITE_BASE}/`)
        ) {
          escapedRequests.push(url.pathname);
        }
      });
      const response = await page.goto(docsUrl(route));
      expect(response?.ok()).toBe(true);
      await expect(page.locator("main h1")).toHaveCount(1);
      await expect(page.locator("main")).toBeVisible();
      expect(errors.page).toEqual([]);
      expect(errors.console).toEqual([]);
      const rootRelativeUrls = await page
        .locator('a[href^="/"], link[href^="/"], script[src^="/"]')
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("href") ?? element.getAttribute("src")),
        );
      expect(rootRelativeUrls.every((url) => url?.startsWith(`${SITE_BASE}/`))).toBe(true);
      expect(escapedRequests).toEqual([]);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `https://www.sheetwrite.dev/docs/${route}`,
      );
    });
  }

  test("framework tabs synchronize and persist across guides", async ({ page }) => {
    await page.goto(docsUrl("start/installation/"));
    await waitForHydration(page);
    const frameworkPanel = page.getByRole("tabpanel", { name: /^(Vanilla|React|Vue|Svelte)$/ });
    const expectStyledPanel = async (language: string) => {
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
      expect(colors.tokens.length).toBeGreaterThan(0);
      expect(colors.tokens.some((color) => color !== colors.code)).toBe(true);
    };
    const reactTab = page.getByRole("tab", { name: "React", exact: true });
    await expect(reactTab).toBeVisible();
    await reactTab.click();
    await expect(reactTab).toHaveAttribute("aria-selected", "true");
    await expect(frameworkPanel).toContainText("@sheetwrite/react");
    await expectStyledPanel("tsx");
    expect(await page.evaluate(() => localStorage.getItem("sheetwrite-framework"))).toBe("React");

    await page.goto(docsUrl("frameworks/lifecycle/"));
    await expect(page.getByRole("tab", { name: "React", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(frameworkPanel).toContainText("SheetwriteGrid");

    await page.getByRole("tab", { name: "Vue", exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem("sheetwrite-framework"))).toBe("Vue");
    await page.goto(docsUrl("start/installation/"));
    await expect(page.getByRole("tab", { name: "Vue", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expectStyledPanel("vue");
    await page.getByRole("tab", { name: "Svelte", exact: true }).click();
    await expectStyledPanel("svelte");
  });

  test("generated API indexes lead to focused, progressively disclosed symbol pages", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1568, height: 900 });
    await page.goto(docsUrl("api/core/"));
    await waitForHydration(page);
    await page.locator(`a[href="${SITE_BASE}/docs/api/core/grid/"]`).first().click();
    await expect(page).toHaveURL(/\/docs\/api\/core\/grid\/$/);
    await expect(page.locator("main h1")).toContainText("Grid");
    await expect(page.locator(".api-member[open]")).toHaveCount(0);
    // Signatures are for reading, so they carry no copy control; examples keep theirs,
    // also after in-site navigation. The CSS locator counts collapsed members too.
    await expect(page.locator(".api-member .copy, .api-declaration .copy")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy to clipboard" }).first()).toBeVisible();
    await page.locator("#grid-get-cell-at-point summary").click();
    await expect(page.locator("#grid-get-cell-at-point pre")).toContainText(
      "clientX: number, clientY: number",
    );
    await expect(page.locator(".api-declaration")).not.toHaveAttribute("open");
    await page.locator(".api-declaration summary").click();
    await expect(page.locator(".api-declaration .expressive-code")).toBeVisible();

    const layout = await page.evaluate(() => ({
      fits: document.documentElement.scrollWidth <= window.innerWidth,
    }));
    expect(layout.fits).toBe(true);
  });

  const searchTargets = {
    applyTransaction: `${SITE_BASE}/docs/api/core/grid/#applytransaction`,
    SnapshotValidationError: `${SITE_BASE}/docs/api/core/snapshot-validation-error/`,
  } as const;

  async function openSearch(page: Page) {
    // A concrete page: opening search mid /docs/ redirect re-render is racy.
    await page.goto(docsUrl("start/installation/"));
    await waitForHydration(page);
    await page
      .getByRole("button", { name: /search/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "Search documentation" });
    return { dialog, input: dialog.getByLabel("Search documentation") };
  }

  for (const [term, expectedHref] of Object.entries(searchTargets)) {
    test(`documentation search resolves ${term} to its generated anchor`, async ({ page }) => {
      const { dialog, input } = await openSearch(page);
      await input.pressSequentially(term, { delay: 20 });
      const matchingLink = dialog.locator(`a[href='${expectedHref}']`).first();
      await expect(matchingLink).toBeVisible({ timeout: 15_000 });
      await expect(dialog.locator("[data-action-error]")).toBeHidden();
      await matchingLink.click();
      await expect(page).toHaveURL(expectedHref);
      await expect(page.getByText(term).first()).toBeVisible();
    });
  }

  test("documentation search excludes browser-only test routes", async ({ page }) => {
    const { dialog, input } = await openSearch(page);
    // The query must first return real documentation results, or the check below proves nothing.
    // Both words are in the test route's title and in the kept-parts guide.
    await input.fill("XLSX verification");
    await expect(dialog.locator(`a[href^='${SITE_BASE}/docs/']`).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.locator(`a[href^='${SITE_BASE}/test/']`)).toHaveCount(0);
  });

  for (const missingIndex of [false, true]) {
    test(`documentation search reports ${missingIndex ? "an unbuilt index" : "a failed index"}`, async ({
      page,
    }) => {
      await page.route("**/pagefind/**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (missingIndex || pathname.endsWith(".pf_meta")) {
          await route.fulfill({
            status: missingIndex ? 404 : 503,
            body: "Unavailable",
          });
        } else {
          await route.continue();
        }
      });
      const { dialog, input } = await openSearch(page);
      await input.fill("applyTransaction");
      const error = dialog.locator("[data-action-error]");
      if (missingIndex) {
        await expect(dialog).toContainText(
          "Search becomes available after the static index is built.",
        );
        await expect(error).toBeHidden();
      } else {
        await expect(error).toBeVisible({ timeout: 15_000 });
        await expect(error).toHaveText(
          "Search failed; check your connection and change the query to try again.",
        );
        await expect(dialog).not.toContainText(
          "Search becomes available after the static index is built.",
        );
      }
    });
  }

  test("member deep links open the target row in view", async ({ page }) => {
    // The search-anchor form: the fragment targets a hidden h3, and the
    // following collapsed details row must open and scroll into view.
    await page.goto(docsUrl("api/core/grid/#applytransaction"));
    await waitForHydration(page);
    const member = page.locator("#grid-apply-transaction");
    await expect(member).toHaveAttribute("open", "");
    await expect(member).toBeInViewport();
    await expect(member.getByText("applyTransaction").first()).toBeVisible();
  });
});
