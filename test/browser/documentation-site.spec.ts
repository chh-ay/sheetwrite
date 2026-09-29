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

const SITE_TITLE = "Sheetwrite — Spreadsheet, data grid & multi-sheet workbook engine · XLSX/CSV";
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
  const productStory = page.getByTestId("landing-product-story");
  await expect(productStory).toBeVisible();
  await expect(productStory).toHaveAttribute("data-landing-phase", "resolve", { timeout: 10_000 });
  await expect(productStory.getByText("Illustrative product view")).toBeVisible();
  await expect(productStory.getByText(/static Sheetwrite composition/i)).toBeVisible();
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
  expect(structuredData).toHaveLength(1);
  expect(
    structuredData[0]?.["@graph"]?.map((entry: { "@type": string }) => entry["@type"]),
  ).toEqual(["WebSite", "SoftwareSourceCode"]);
  expect(structuredData[0]?.["@graph"]?.[1]).toMatchObject({
    codeRepository: "https://github.com/chh-ay/sheetwrite",
    license: "https://opensource.org/license/mit",
    programmingLanguage: ["TypeScript", "Rust"],
    runtimePlatform: ["Web", "WebAssembly"],
    version: "0.1.0",
  });
  // Benchmark section publishes real generated numbers, never placeholders.
  const benchStats = page.locator("#benchmarks .sw-bench-stats li");
  await expect(benchStats.first()).toBeVisible();
  await expect(page.locator("#benchmarks")).toContainText("See how we measured it.");
  // Feature navigation: four focused proofs and four adapter workbenches link out.
  await expect(page.locator("main a[data-proof]")).toHaveCount(4);
  await expect(page.locator("main a[data-framework]")).toHaveCount(4);
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
  await page.getByRole("link", { name: /Performance & scale/ }).click();
  await expect(page).toHaveURL(siteUrl("/showcases/performance/"));
  await page.goBack();
  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page).toHaveURL(docsUrl("start/installation/"));
});

test("landing choreography is bounded, replayable, and reduced-motion complete", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(siteUrl("/"));
  await waitForHydration(page);
  const story = page.getByTestId("landing-product-story");
  await expect(story).toHaveAttribute("data-landing-phase", "resolve");
  const expectCompletedDrawing = async () => {
    await expect(story.locator(".sw-workbook-stage__reference-range")).toHaveCSS("opacity", "1");
    await expect
      .poll(() =>
        story
          .locator(".sw-sheet-row > .is-selected")
          .evaluate((cell) => getComputedStyle(cell, "::after").opacity),
      )
      .toBe("1");
  };
  await expectCompletedDrawing();
  const reduced = await story.evaluate((root) => ({
    running: root
      .getAnimations({ subtree: true })
      .filter((animation) => animation.playState === "running").length,
    nodes: root.querySelectorAll("*").length,
  }));
  expect(reduced.running).toBe(0);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  const box = await story.boundingBox();
  if (!box) throw new Error("landing product story has no bounds");
  await page.mouse.move(box.x + box.width * 0.78, box.y + box.height * 0.28);
  await expect
    .poll(() =>
      story.evaluate((root) => Number.parseFloat(root.style.getPropertyValue("--sw-pointer-x"))),
    )
    .toBeGreaterThan(76);
  await expect
    .poll(() =>
      story.evaluate((root) => Number.parseFloat(root.style.getPropertyValue("--sw-pointer-x"))),
    )
    .toBeLessThan(80);
  await expect
    .poll(() =>
      story.evaluate((root) => Number.parseFloat(root.style.getPropertyValue("--sw-pointer-y"))),
    )
    .toBeGreaterThan(26);
  await expect
    .poll(() =>
      story.evaluate((root) => Number.parseFloat(root.style.getPropertyValue("--sw-pointer-y"))),
    )
    .toBeLessThan(30);
  await story.getByRole("button", { name: "Replay visual explanation" }).click();
  await expect(story).toHaveAttribute("data-landing-phase", /enter|select/);
  await expect(story).toHaveAttribute("data-landing-running", "true");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(story).toHaveAttribute("data-landing-running", "false");
  await story.scrollIntoViewIfNeeded();
  await expect(story).toHaveAttribute("data-landing-running", "true");
  expect(await story.locator("*").count()).toBe(reduced.nodes);
  await expectCompletedDrawing();
  await expect(story).toHaveAttribute("data-landing-running", "false");
  await page.goto(docsUrl("start/installation/"));
  await expect(story).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        document.getAnimations().filter((animation) => animation.playState === "running").length,
    ),
  ).toBe(0);
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
        `https://sheetwrite.vercel.app/docs/${route}`,
      );
    });
  }

  test("framework tabs synchronize and persist across guides", async ({ page }) => {
    await page.goto(docsUrl("start/installation/"));
    await waitForHydration(page);
    const expectStyledPanel = async (language: string) => {
      const panel = page.getByRole("tabpanel");
      await expect(panel.locator(".frame.is-terminal .sr-only")).toHaveCSS("position", "absolute");
      const colors = await panel
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
    await expect(page.getByRole("tabpanel")).toContainText("@sheetwrite/react");
    await expectStyledPanel("tsx");
    expect(await page.evaluate(() => localStorage.getItem("sheetwrite-framework"))).toBe("React");

    await page.goto(docsUrl("frameworks/lifecycle/"));
    await expect(page.getByRole("tab", { name: "React", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tabpanel")).toContainText("SheetwriteGrid");

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
    await expect(page.getByRole("button", { name: /copy/i })).toHaveCount(0);
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

  for (const [term, expectedHref] of Object.entries(searchTargets)) {
    test(`documentation search resolves ${term} to its generated anchor`, async ({ page }) => {
      // A concrete page: opening search mid /docs/ redirect re-render is racy.
      await page.goto(docsUrl("start/installation/"));
      await waitForHydration(page);
      await page
        .getByRole("button", { name: /search/i })
        .first()
        .click();
      const search = page.locator('input[placeholder="Search APIs, guides, and examples"]');
      await search.fill(term);
      const matchingLink = page.locator(`a[href='${expectedHref}']`);
      await expect(matchingLink.first()).toBeVisible({ timeout: 15_000 });
    });
  }

  test("documentation search excludes browser-only test routes", async ({ page }) => {
    await page.goto(docsUrl("start/installation/"));
    await waitForHydration(page);
    await page
      .getByRole("button", { name: /search/i })
      .first()
      .click();
    await page
      .locator('input[placeholder="Search APIs, guides, and examples"]')
      .fill("XLSX browser verification");
    await expect(page.locator(`a[href^='${SITE_BASE}/test/']`)).toHaveCount(0);
  });

  test("member deep links open and emphasize the target row", async ({ page }) => {
    // The search-anchor form: the fragment targets a hidden h3, and the
    // following collapsed details row must open and carry the emphasis flag.
    await page.goto(docsUrl("api/core/grid/#applytransaction"));
    await waitForHydration(page);
    const member = page.locator("#grid-apply-transaction");
    await expect(member).toHaveAttribute("open", "");
    await expect(member).toHaveAttribute("data-revealed", "");
    await expect(member.locator(".expressive-code").first()).toBeVisible();
  });
});
