import { expect, type Page, test } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

// Browser contracts for the docs page features: the Try it playground on a
// runnable example (run, edit, error, reset), the page actions (Edit on
// GitHub, Report a problem) and the changelog feed.

const FIRST_GRID_URL = siteUrl("/docs/start/first-grid/");
/** The engine loads on the first run; a cold run can take a few seconds in CI. */
const RUN_TIMEOUT_MS = 30_000;

/** Interactive steps need attached listeners; the root component marks hydration. */
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15_000 });
}

/** The script files a page has requested so far. */
function scriptRequests(page: Page): string[] {
  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(new URL(request.url()).pathname);
  });
  return scripts;
}

test("Try it runs the example, reruns an edit, reports an error at its line, and resets", async ({
  page,
}) => {
  const scripts = scriptRequests(page);
  await page.goto(FIRST_GRID_URL);
  await waitForHydration(page);
  // Nothing of the playground loads before the reader asks for it.
  expect(scripts.filter((path) => /Playground|run-example|sucrase/i.test(path))).toEqual([]);

  const tryIt = page.getByRole("button", { name: "Try it" }).first();
  await tryIt.click();
  const playground = page.getByRole("region", { name: "Complete first grid" });
  const status = playground.getByRole("status");
  await expect(status).toHaveText(/^Ran in \d+ ms/, { timeout: RUN_TIMEOUT_MS });
  const frame = playground.frameLocator("iframe");
  await expect(frame.locator("#grid canvas").first()).toBeAttached();

  const editor = playground.getByRole("textbox", { name: "Code of Complete first grid" });
  const original = await editor.inputValue();
  expect(original).toContain("createGrid(host, { workbook, data })");

  await editor.fill(
    `${original}\nconsole.log("total", grid.store.getCell({ sheet: "sales", row: 0, col: 1 }).resolved);`,
  );
  await playground.getByRole("button", { name: "Run" }).click();
  await expect(status).toHaveText(/^Ran in \d+ ms, 1 console line\.$/, { timeout: RUN_TIMEOUT_MS });
  await expect(playground.getByRole("list", { name: "Console output" })).toHaveText("total 12");

  await editor.fill(
    "const first = 1;\nconst second = first + 1;\nthrow new RangeError(`broken at ${second}`);",
  );
  await editor.press("Control+Enter");
  const alert = playground.getByRole("alert");
  await expect(alert).toContainText("RangeError broken at 2", { timeout: RUN_TIMEOUT_MS });
  await expect(alert.getByRole("button", { name: "Line 3" })).toBeVisible();
  await expect(status).toHaveText("The example stopped with an error.");

  await editor.fill("const value: number = ;");
  await playground.getByRole("button", { name: "Run" }).click();
  await expect(alert).toContainText("SyntaxError", { timeout: RUN_TIMEOUT_MS });
  await expect(alert.getByRole("button", { name: "Line 1" })).toBeVisible();

  await playground.getByRole("button", { name: "Reset" }).click();
  await expect(editor).toHaveValue(original);
  await expect(alert).toHaveCount(0);
  await expect(status).toHaveText(/^Ran in \d+ ms/, { timeout: RUN_TIMEOUT_MS });
  await expect(frame.locator("#grid canvas").first()).toBeAttached();
});

/** The feature pages with a runnable example, each in a closed "Full setup" disclosure. */
const RUNNABLE_FEATURE_PAGES = [
  "/docs/features/formatting/conditional-formats/",
  "/docs/features/formatting/number-formats/",
  "/docs/features/formulas/dynamic-arrays-and-spills/",
  "/docs/features/analysis/charts/",
  "/docs/features/analysis/pivot-tables/",
];

for (const path of RUNNABLE_FEATURE_PAGES) {
  test(`the runnable example on ${path} runs without an error`, async ({ page }) => {
    await page.goto(siteUrl(path));
    await waitForHydration(page);
    // The button shows under the closed "Full setup" disclosure, and runs it without opening it.
    await expect(page.locator(".sw-runnable details").first()).not.toHaveAttribute("open");
    const tryIt = page.getByRole("button", { name: "Try it" }).first();
    await expect(tryIt).toBeVisible();
    await tryIt.click();
    const playground = page.locator(".sw-playground");
    await expect(playground.getByRole("status")).toHaveText(/^Ran in \d+ ms/, {
      timeout: RUN_TIMEOUT_MS,
    });
    await expect(playground.getByRole("alert")).toHaveCount(0);
    await expect(playground.frameLocator("iframe").locator("#grid canvas").first()).toBeAttached();
  });
}

test("on a phone the editor wraps long lines in both layers, like the page's code block", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(FIRST_GRID_URL);
  await waitForHydration(page);
  await page.getByRole("button", { name: "Try it" }).first().click();
  const editor = page.locator(".sw-playground__editor").first();
  await expect(page.locator(".sw-playground").getByRole("status")).toHaveText(/^Ran in/, {
    timeout: RUN_TIMEOUT_MS,
  });
  const layout = await editor.evaluate((element) => {
    const pre = element.querySelector("pre");
    const textarea = element.querySelector("textarea");
    if (pre === null || textarea === null) throw new Error("The editor has no layers");
    return {
      fits:
        element.scrollWidth <= element.clientWidth && textarea.scrollWidth <= textarea.clientWidth,
      preHeight: pre.getBoundingClientRect().height,
      textHeight: textarea.scrollHeight,
    };
  });
  expect(layout.fits).toBe(true);
  // Both layers wrap to the same rows, so the coloured text stays under the caret.
  expect(Math.abs(layout.preHeight - layout.textHeight)).toBeLessThanOrEqual(1);
});

test("a page without a runnable example loads none of the playground", async ({ page }) => {
  const scripts = scriptRequests(page);
  await page.goto(siteUrl("/docs/start/installation/"));
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: "Try it" })).toHaveCount(0);
  expect(
    scripts.filter((path) => /RunnableCode|Playground|run-example|sucrase/i.test(path)),
  ).toEqual([]);
});

test("page actions edit the source file and report a problem with the page", async ({ page }) => {
  await page.goto(FIRST_GRID_URL);
  const edit = page.getByRole("link", { name: "Edit on GitHub" });
  await expect(edit).toHaveAttribute(
    "href",
    "https://github.com/chh-ay/sheetwrite/edit/develop/docs/src/content/docs/start/first-grid.md",
  );
  const report = new URL(
    (await page.getByRole("link", { name: "Report a problem" }).getAttribute("href")) ?? "",
  );
  expect(`${report.origin}${report.pathname}`).toBe(
    "https://github.com/chh-ay/sheetwrite/issues/new",
  );
  // The documentation form adds the documentation labels.
  expect(report.searchParams.get("template")).toBe("documentation.yml");
  expect(report.searchParams.get("pages")).toBe(
    "Your first grid: https://www.sheetwrite.dev/docs/start/first-grid/",
  );

  // A generated page has no source file to edit.
  await page.goto(siteUrl("/docs/api/core/"));
  await expect(page.getByRole("link", { name: "Report a problem" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit on GitHub" })).toHaveCount(0);
});

test("the changelog links its RSS feed", async ({ page, request }) => {
  await page.goto(siteUrl("/docs/releases/"));
  await expect(
    page.locator('head link[rel="alternate"][type="application/rss+xml"]'),
  ).toHaveAttribute("href", "/changelog/rss.xml");
  await expect(page.getByRole("link", { name: "changelog RSS feed" })).toHaveAttribute(
    "href",
    "/changelog/rss.xml",
  );
  // Feed readers read the served HTML: the link is in its head, not only in the hydrated page.
  const html = await (await request.get(siteUrl("/docs/releases/"))).text();
  expect(html.slice(0, html.indexOf("</head>"))).toContain('type="application/rss+xml"');

  const feed = await request.get(siteUrl("/changelog/rss.xml"));
  expect(feed.ok()).toBe(true);
  expect(feed.headers()["content-type"]).toMatch(/xml/);
  expect(await feed.text()).toContain('<rss version="2.0"');
});
