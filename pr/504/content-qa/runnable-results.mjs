// QA script: runs each docs page's runnable example through "Try it" and
// compares the grid it makes (read from the screen-reader mirror) with the
// result table the page shows under the example. Saves a screenshot each.
//
//   node runnable-results.mjs <origin> <output-directory> <chromium|firefox>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, firefox } from "@playwright/test";

const [origin = "", outputDirectory = "", browserName = "chromium"] = process.argv.slice(2);
if (origin === "" || outputDirectory === "") {
  throw new Error("Usage: node runnable-results.mjs <origin> <output-directory> <chromium|firefox>");
}
mkdirSync(outputDirectory, { recursive: true });
const RUN_TIMEOUT_MS = 60_000;
const SETTLE_MS = 1_500;
const PAGES = [
  "/docs/start/first-grid/",
  "/docs/features/formatting/conditional-formats/",
  "/docs/features/formatting/number-formats/",
  "/docs/features/formulas/dynamic-arrays-and-spills/",
  "/docs/features/analysis/charts/",
  "/docs/features/analysis/pivot-tables/",
];

/**
 * The body cells of the page's result table for the runnable example: the
 * last `figure.sw-grid-result` before it (pages show the result above the
 * "Full setup" that holds the runnable code), by row, without decoration.
 */
function expectedTable(page) {
  return page.evaluate(() => {
    const runnable = document.querySelector(".sw-runnable");
    if (runnable === null) return null;
    const before = [...document.querySelectorAll("figure.sw-grid-result")].filter(
      (figure) => figure.compareDocumentPosition(runnable) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const table = before.at(-1)?.querySelector("table");
    if (table === undefined || table === null) return null;
    return [...table.querySelectorAll("tbody tr")]
      .filter((row) => row.getAttribute("aria-hidden") !== "true")
      .map((row) =>
        [...row.children]
          .filter((cell) => cell.getAttribute("aria-hidden") !== "true" && cell.tagName === "TD")
          .map((cell) => cell.textContent.trim()),
      )
      .filter((cells) => cells.length > 0);
  });
}

/** The grid's cells as the screen-reader mirror holds them, by row. */
function mirrorCells(frame) {
  return frame.evaluate(() =>
    [...document.querySelectorAll('[role="row"]')]
      .map((row) => [...row.querySelectorAll('[role="gridcell"]')].map((cell) => cell.textContent.trim()))
      .filter((cells) => cells.length > 0),
  );
}

const launcher = browserName === "firefox" ? firefox : chromium;
const browser = await launcher.launch();
const report = [];
try {
  for (const path of PAGES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    await page.goto(new URL(path, origin).href, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Try it" }).first().click();
    const playground = page.locator(".sw-playground").first();
    await playground.getByRole("status").filter({ hasText: /^Ran in/ }).waitFor({ timeout: RUN_TIMEOUT_MS });
    await page.waitForTimeout(SETTLE_MS);
    const frameHandle = await playground.locator("iframe").elementHandle();
    const frame = await frameHandle?.contentFrame();
    const actual = frame === null || frame === undefined ? null : await mirrorCells(frame);
    const expected = await expectedTable(page);
    const alerts = await playground.getByRole("alert").allTextContents();
    const mismatches = [];
    for (const [rowIndex, row] of (expected ?? []).entries()) {
      for (const [colIndex, text] of row.entries()) {
        const shown = actual?.[rowIndex]?.[colIndex] ?? "";
        if (text !== shown) mismatches.push({ row: rowIndex + 1, col: colIndex + 1, expected: text, shown });
      }
    }
    const slug = path.replace(/^\/docs\//, "").replace(/\/$/, "").replaceAll("/", "-");
    await playground.screenshot({ path: join(outputDirectory, `${browserName}-${slug}.png`) });
    report.push({ path, browser: browserName, alerts, consoleErrors, expected, actual, mismatches });
    await page.close();
  }
} finally {
  await browser.close();
}
writeFileSync(join(outputDirectory, `${browserName}-report.json`), JSON.stringify(report, null, 2));
for (const entry of report) {
  process.stdout.write(
    `${entry.browser} ${entry.path}: ${entry.mismatches.length === 0 && entry.expected !== null ? "PASS" : "CHECK"} expectedRows=${entry.expected?.length ?? "none"} mismatches=${entry.mismatches.length} alerts=${entry.alerts.length} consoleErrors=${entry.consoleErrors.length}\n`,
  );
}
