import { readFileSync } from "node:fs";

import type { Page } from "@playwright/test";

import { expect, siteUrl, test, waitForHydration } from "./fixtures.js";

// The served site: routes, redirects, head metadata, real layout and the real
// Pagefind index. Unit tests own the logic (docs/test moved-pages,
// search-ranking, outline, navigation; scripts/prepare-docs-deployment owns
// served redirects and 404 status); these keep what needs the built site.

/** Just below the sticky header, where lib/shell.ts reads the current heading. */
const READING_LINE_PX = 80;

test("an old heading link is forwarded, and a long outline keeps the entry being read in view", async ({
  page,
}) => {
  // The heading moved to another page than the redirect target; the target forwards it.
  await page.goto("/docs/guides/configuration/#datasource-pages");
  await expect(page).toHaveURL(/\/docs\/features\/data\/datasources\/#requests-and-pages$/);
  await expect(page.locator("#requests-and-pages")).toBeInViewport();

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
  await page.evaluate(
    ({ heading, line }) => {
      const top = document.getElementById(heading)?.getBoundingClientRect().top ?? 0;
      window.scrollTo(0, window.scrollY + top - line);
    },
    { heading: id, line: READING_LINE_PX },
  );
  await expect(last).toHaveAttribute("aria-current", "location");
  const [railBox, lastBox] = await Promise.all([rail.boundingBox(), last.boundingBox()]);
  expect(lastBox && railBox && lastBox.y + lastBox.height <= railBox.y + railBox.height).toBe(true);
  await expect(rail).toHaveAttribute("data-more", "start");
});

test("the landing loads no grid runtime, matches its files, and its story reel holds for the reader", async ({
  page,
}) => {
  const wasmRequests: string[] = [];
  page.on("request", (request) => {
    if (/\.wasm(?:$|\?)/.test(request.url())) wasmRequests.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await waitForHydration(page);
  // Exactly one H1, and no live grid runtime on the landing.
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator("main canvas, main .sheetwrite")).toHaveCount(0);
  expect(wasmRequests).toEqual([]);
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute("content", "630");
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

  // A focused story link must not be removed by an automatic story change.
  const reel = page.locator(".sw-reel");
  await reel.scrollIntoViewIfNeeded();
  const timer = reel.locator(".sw-reel__timer");
  await expect(timer).toHaveCount(1);
  await reel.locator(".sw-reel__copy a").focus();
  await expect(timer).toHaveCount(0);
  const pause = reel.getByRole("button", { name: "Pause stories" });
  await pause.click();
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  await blurFocus(page);
  await expect(timer).toHaveCount(0);
  await pause.click();
  await blurFocus(page);
  await expect(pause).toHaveAttribute("aria-pressed", "false");
  await expect(timer).toHaveCount(1);
});

async function blurFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

test("every page starts with a skip link, and a phone has a route back home and to the showcases", async ({
  page,
}) => {
  // One page per layout: landing, hub, showcase, framework page, docs shell.
  for (const path of [
    "/",
    "/showcases/",
    "/showcases/sort/",
    "/react/",
    "/docs/start/first-grid/",
  ]) {
    await page.goto(path);
    await waitForHydration(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content", exact: true });
    await expect(skip, path).toBeFocused();
    await expect(skip, path).toBeInViewport();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => document.activeElement?.closest("#main-content") !== null),
      path,
    ).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole("link", { name: "Sheetwrite home", exact: true }).click();
  await expect(page).toHaveURL(siteUrl("/"));
  // Phones keep the site links in the header's menu.
  await page.getByRole("button", { name: "Site menu", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Site", exact: true })
    .getByRole("link", { name: "Docs", exact: true })
    .click();
  await expect(page).toHaveURL(siteUrl("/docs/"));
  // Showcases is a tab of the documentation bar at every width.
  await page
    .getByRole("navigation", { name: "Documentation sections", exact: true })
    .getByRole("link", { name: "Showcases", exact: true })
    .click();
  await expect(page).toHaveURL(siteUrl("/showcases/"));
});

test("a guide has one heading, a canonical URL and its section icon; sidebar icons centre on their first line", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/docs/start/installation/");
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://www.sheetwrite.dev/docs/start/installation/",
  );
  const eyebrow = page.locator(".sw-document__eyebrow");
  await expect(eyebrow).toHaveText("Getting started");
  // The same glyph as the section's row in the sidebar (the phone menu holds a copy).
  const sidebarGlyph = await page
    .locator('.sw-sidebar__nav a[href="/docs/start/"] > .sw-icon use')
    .first()
    .getAttribute("href");
  await expect(eyebrow.locator(".sw-icon use")).toHaveAttribute("href", sidebarGlyph ?? "");
  expect(await misplacedIcons(page)).toEqual([]);
  // This section's sidebar holds a label that wraps; its icon stays on the first line.
  await page.goto("/docs/concepts/");
  expect(await misplacedIcons(page, { wraps: true })).toEqual([]);

  // A tab's landing page has no eyebrow, so no icon stands alone above its title.
  await page.goto("/docs/");
  await expect(page.locator(".sw-document__eyebrow")).toHaveCount(0);
  await expect(page.locator(".sw-document__header > svg")).toHaveCount(0);
});

/** Layout rounds boxes to device pixels. */
const ICON_CENTRE_TOLERANCE_PX = 1;

/**
 * Labels of the eyebrow and visible sidebar rows whose icon is not centred on
 * the label's first line. With `wraps`, at least one label must wrap.
 */
async function misplacedIcons(page: Page, { wraps = false } = {}): Promise<string[]> {
  const rows = await page
    .locator(".sw-document__eyebrow, .sw-sidebar__nav a:has(> .sw-icon)")
    .evaluateAll((labels) =>
      // Rows inside a closed group have no box.
      labels
        .filter((label) => label.getClientRects().length > 0)
        .map((label) => {
          const icon = label.querySelector(".sw-icon")?.getBoundingClientRect();
          const text = [...label.childNodes].filter(
            (node) => !(node instanceof SVGElement) && node.textContent?.trim(),
          );
          const range = document.createRange();
          range.setStartBefore(text[0] ?? label);
          range.setEndAfter(text.at(-1) ?? label);
          const lines = [...range.getClientRects()].filter((rect) => rect.height > 0);
          const first = lines[0];
          return {
            label: label.textContent?.trim() ?? "",
            lines: new Set(lines.map((rect) => Math.round(rect.top))).size,
            offset:
              icon === undefined || first === undefined
                ? Number.NaN
                : icon.top + icon.height / 2 - (first.top + first.height / 2),
          };
        }),
    );
  if (wraps) expect(rows.some((row) => row.lines > 1)).toBe(true);
  return rows
    .filter((row) => !(Math.abs(row.offset) <= ICON_CENTRE_TOLERANCE_PX))
    .map((row) => row.label);
}

test("a code-name title wraps between its words, never inside one", async ({ page }) => {
  for (const [width, route] of [
    [1440, "api/react-styles-dashboard-css/"],
    [390, "api/core-browser/indexed-db-pending-commit-storage-error-code/"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/docs/${route}`);
    // Each run of the title's text between break points sits on one line.
    const splitRuns = await page
      .locator("main h1 > span")
      .first()
      .evaluate((title) =>
        [...title.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
          .filter((node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            return (
              new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size > 1
            );
          })
          .map((node) => node.textContent),
      );
    expect(splitRuns, `${route} at ${width} px`).toEqual([]);
  }
});

test("generated API pages filter their outline and show member signatures", async ({ page }) => {
  await page.setViewportSize({ width: 1568, height: 900 });
  await page.goto("/docs/api/core/");
  await waitForHydration(page);
  // The outline lists only the symbol groups the filter shows.
  const outline = page.getByRole("navigation", { name: "On this page", exact: true });
  const classes = outline.getByRole("link", { name: "Classes", exact: true });
  await expect(classes).toHaveCount(1);
  const filter = page.getByRole("searchbox", { name: "Filter exported symbols" });
  await filter.fill("createGrid");
  await expect(classes).toHaveCount(0);
  const hiddenTargets = await outline.locator("a").evaluateAll((links) =>
    links.filter((link) => {
      const target = document.getElementById(link.getAttribute("href")?.slice(1) ?? "");
      return target === null || target.hidden;
    }),
  );
  expect(hiddenTargets).toHaveLength(0);
  await filter.fill("");

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
  // Type links in signatures are underlined, not marked by colour alone.
  await page.goto("/docs/api/charts/create-chart-renderer/");
  expect(
    await page
      .locator(".api-sig__type a")
      .first()
      .evaluate((element) => getComputedStyle(element).textDecorationLine),
  ).toBe("underline");
});

/** The first Pagefind query loads the index; a cold load can take a while in CI. */
const SEARCH_TIMEOUT_MS = 15_000;

async function openSearch(page: Page, { hydrated = true } = {}) {
  // A concrete page: opening search mid /docs/ redirect re-render is racy.
  await page.goto("/docs/start/installation/");
  if (hydrated) await waitForHydration(page);
  await page
    .getByRole("button", { name: /search/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Search documentation" });
  return { dialog, input: dialog.getByLabel("Search documentation") };
}

test("documentation search over the real index: typed early, ranked, keyboard driven", async ({
  page,
}) => {
  // No wait for hydration: a reader types as soon as the dialog opens.
  const { dialog } = await openSearch(page, { hydrated: false });
  await page.keyboard.type("XLOOKUP");
  const field = page.getByRole("combobox", { name: "Search documentation" });
  const results = dialog.getByRole("listbox", { name: "Search results" }).getByRole("option");
  await expect(field).toHaveValue("XLOOKUP");
  await expect(results.first()).toHaveAttribute(
    "href",
    "/docs/reference/formula-functions/lookup-reference/#fn-xlookup",
    { timeout: SEARCH_TIMEOUT_MS },
  );

  // Code names rank their API page first; words and questions their guide.
  // search-ranking.test.ts owns the ranking rules; these rows prove the real index feeds them.
  for (const [query, href] of [
    ["createGrid", "/docs/api/core/create-grid/"],
    ["autofilter", "/docs/features/data/autofilter/"],
    ["how do I use sheetwrite with react", "/docs/frameworks/react/"],
    ["how do I use sheetwrite with svelte", "/docs/frameworks/svelte/"],
    ["how to use conditional formatting", "/docs/features/formatting/conditional-formats/"],
  ] as const) {
    await field.fill(query);
    await expect
      .poll(async () => (await results.first().getAttribute("href"))?.split("#")[0], query)
      .toBe(href);
  }

  // Test routes stay out of the index. Both words are in the test route's
  // title and in the kept-parts guide, so real results come back.
  await field.fill("XLSX verification");
  await expect(dialog.locator("a[href^='/docs/']").first()).toBeVisible();
  await expect(dialog.locator("a[href^='/test/']")).toHaveCount(0);

  await field.fill("qqzzxx");
  await expect(dialog.getByRole("status")).toHaveText("No results for “qqzzxx”.");
  await expect(results).toHaveCount(0);

  // A symbol resolves to its member anchor; arrows move the choice and Enter opens it.
  const anchor = "/docs/api/core/grid/#applytransaction";
  await field.fill("applyTransaction");
  await expect(results.first()).toHaveAttribute("href", anchor);
  await expect(results.first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await expect(results.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(results.first()).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("ArrowUp");
  await expect(results.first()).toHaveAttribute("aria-selected", "true");
  await expect(dialog.locator("[data-action-error]")).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(siteUrl(anchor));
  // The anchor is a hidden search target; the member card after it is marked and in view.
  await expect(page.locator("#grid-apply-transaction")).toHaveAttribute("data-revealed", "");
  await expect(page.locator("#grid-apply-transaction")).toBeInViewport();
});

test.describe(() => {
  // A missing page or index logs its failed request to the console.
  test.use({ allowErrors: true });

  test("unknown URLs serve the site 404, and search reports a failed or an unbuilt index", async ({
    page,
    request,
  }) => {
    const response = await page.goto("/this-page-does-not-exist/");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Documentation", exact: true })).toBeVisible();
    expect((await request.get("/docs/proof/")).status()).toBe(404);

    const unbuilt = "Search becomes available after the static index is built.";
    for (const missingIndex of [false, true]) {
      await page.unrouteAll();
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
      if (missingIndex) {
        await expect(dialog).toContainText(unbuilt);
        await expect(error).toBeHidden();
      } else {
        await expect(error).toHaveText(
          "Search failed; check your connection and change the query to try again.",
          { timeout: SEARCH_TIMEOUT_MS },
        );
        await expect(dialog).not.toContainText(unbuilt);
      }
    }
  });
});
