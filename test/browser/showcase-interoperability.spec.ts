import { expect, type Page, test } from "@playwright/test";
import type { Grid } from "../../packages/core/src/types.js";
import { siteUrl } from "./playwright.config.js";

declare global {
  interface Window {
    __sheetwriteInteropGrid?: Grid;
  }
}

const ROUTE = siteUrl("/showcases/interoperability/");
const HOSTILE_FIXTURE_IDS = [
  "traversal",
  "doctype",
  "deep-xml",
  "compression-ratio",
  "corrupt-deflate",
] as const;

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

async function bootInterop(page: Page, url = ROUTE): Promise<void> {
  await page.goto(url);
  await page.waitForSelector(".sw-si-grid canvas", { state: "attached", timeout: 15_000 });
  await expect
    .poll(() => page.locator('[data-testid="interop-status"]').textContent(), {
      timeout: 15_000,
      message: "interoperability workbench never finished booting",
    })
    .toContain("Loaded:");
}

async function chooseFilter(page: Page, testId: string, label: string): Promise<void> {
  const summary = page.getByTestId(testId);
  await summary.click();
  await summary.locator("..").getByRole("button", { name: label, exact: true }).click();
  await expect(summary).toBeFocused();
}

async function openDisclosure(page: Page, testId: string): Promise<void> {
  const disclosure = page.getByTestId(testId);
  if ((await disclosure.getAttribute("open")) === null) {
    await disclosure.locator(":scope > summary").click();
  }
  await expect(disclosure).toHaveAttribute("open", "");
}

test("@portability compatibility results expose every truthful state from checked data", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page, `${ROUTE}?compatibility=producer.google-sheets`);
  await expect(page.locator("select")).toHaveCount(0);

  const inventoryDetail = page.getByTestId("compatibility-detail");
  await expect(inventoryDetail).toContainText("Recorded public Google Sheets export");
  await expect(inventoryDetail).toContainText(
    "No Google Sheets import or resave behavior is claimed.",
  );
  await expect(inventoryDetail).toContainText("Open the checked source");

  const boundaryStatus = inventoryDetail.locator(".sw-si-compat__mode > span");
  await expect(boundaryStatus).toHaveCount(1);
  await expect(boundaryStatus).toHaveText("Supported with warning");
  expect(
    await page.locator(".sw-si-inventory .sw-si-compat__record-status").count(),
  ).toBeGreaterThan(0);

  await chooseFilter(page, "inventory-behavior-filter", "All behavior scopes");
  await chooseFilter(page, "inventory-status-filter", "Supported");
  const evaluatedBoundary = page
    .locator('.sw-si-inventory button[data-status="supported"][data-result="evaluated"]')
    .first();
  await evaluatedBoundary.click();
  await expect(boundaryStatus).toHaveCount(1);
  await expect(boundaryStatus).toHaveText("Supported · Evaluated");
  await expect(evaluatedBoundary).toHaveAccessibleName(/Supported · Evaluated/u);

  const summary = page.getByTestId("compatibility-results-summary");
  await expect(summary).toContainText("2,350");
  await expect(summary).toContainText("2,000");
  await expect(summary).toContainText("250");
  await expect(summary).toContainText("100");
  await expect(summary).toContainText("2,290 of 2,290 supported tests passed locally");
  await expect(summary).toContainText("0 reviewed results");
  await expect(summary).toContainText("2,290 supported tests still lack");
  await expect(summary).toContainText("60 unsupported tests");
  await expect(page.getByTestId("compatibility-test-set-checksum")).toHaveText(
    "bdf94c76df81ea1fa2e1bf96a557c41b21a0f11ea11ae612fcccc35157d7275a",
  );

  const detail = page.getByTestId("compatibility-result-detail");

  // Shared local pass: a local result is real, while incumbent app observations
  // remain explicitly unavailable.
  await expect(detail).toHaveAttribute("data-behavior", "shared");
  await expect(detail).toHaveAttribute("data-status", /local-pass/u);
  await expect(page.getByTestId("app-result-excel-desktop")).toHaveAttribute(
    "data-state",
    "unavailable",
  );
  await expect(page.getByTestId("app-result-google-sheets")).toContainText(
    "no reviewed result file is attached",
  );

  const appRows = detail.locator(".sw-si-results__apps > ul > li");
  await expect(appRows.first()).toHaveAttribute("data-testid", "app-result-sheetwrite");
  await expect(appRows).toHaveCount(4);
  await expect(page.getByTestId("app-result-excel-web")).toHaveCount(0);
  const localResult = page.getByTestId("app-result-sheetwrite");
  await expect(localResult).toHaveAttribute("data-state", "local-pass");
  await expect(localResult).toContainText("Local check passed");
  await expect(page.getByTestId("app-result-sheetwrite-capture")).toBeVisible();

  const splitGeometry = await page.evaluate(() => {
    const measure = (selector: string) => {
      const shell = document.querySelector(selector);
      const records = shell?.querySelector(".sw-si-compat__records");
      const detailPanel = shell?.querySelector(".sw-si-compat__detail");
      if (!(shell instanceof HTMLElement) || !(records instanceof HTMLElement)) {
        throw new Error(`missing compatibility split: ${selector}`);
      }
      if (!(detailPanel instanceof HTMLElement)) {
        throw new Error(`missing compatibility detail: ${selector}`);
      }
      return {
        shellHeight: shell.clientHeight,
        recordsHeight: records.clientHeight,
        detailHeight: detailPanel.clientHeight,
        detailScrollHeight: detailPanel.scrollHeight,
      };
    };
    return {
      viewportHeight: window.innerHeight,
      results: measure(".sw-si-results"),
      inventory: measure(".sw-si-inventory"),
    };
  });
  expect(splitGeometry.results.shellHeight).toBeLessThan(splitGeometry.viewportHeight);
  expect(splitGeometry.inventory.shellHeight).toBeLessThan(splitGeometry.viewportHeight);
  expect(
    Math.abs(splitGeometry.results.recordsHeight - splitGeometry.results.detailHeight),
  ).toBeLessThanOrEqual(1);
  expect(splitGeometry.results.detailScrollHeight).toBeGreaterThan(
    splitGeometry.results.detailHeight,
  );
  expect(
    Math.abs(splitGeometry.inventory.recordsHeight - splitGeometry.inventory.detailHeight),
  ).toBeLessThanOrEqual(1);

  // The checked set currently carries exact tolerance only. Exercise that
  // truthful comparison boundary rather than inventing a numeric tolerance.
  await expect(page.getByTestId("compatibility-tolerance")).toHaveText("Exact type and value");

  // Excel-specific behavior exists, but no reviewed Excel result is attached.
  await chooseFilter(page, "compatibility-behavior-filter", "Excel-specific behavior");
  await expect(detail).toHaveAttribute("data-behavior", "excel");
  await expect(detail).toHaveAttribute("data-status", /known-difference/u);
  await expect(page.getByTestId("known-difference")).toContainText("1900-02-29");
  await expect(page.getByTestId("known-difference")).toContainText("Microsoft Excel desktop");
  await expect(page.getByTestId("known-difference")).not.toContainText(
    "Microsoft Excel for the web",
  );
  await expect(page.getByTestId("app-result-excel-desktop")).toContainText("Result unavailable");

  // The separate checked feature boundary records the Google-only scope and
  // still renders it as unavailable rather than claiming an executed result.
  await chooseFilter(page, "inventory-status-filter", "All statuses");
  await chooseFilter(page, "inventory-behavior-filter", "Google Sheets-specific behavior");
  await expect(inventoryDetail).toContainText("Recorded public Google Sheets export");
  await expect(inventoryDetail).toContainText("missing bytes display unavailable status");

  await chooseFilter(page, "inventory-behavior-filter", "All behavior scopes");
  await chooseFilter(page, "inventory-status-filter", "Unsupported");
  const unsupportedBoundary = page
    .locator('.sw-si-inventory button[data-status="unsupported"][data-result="unsupported"]')
    .first();
  await expect(unsupportedBoundary).toBeVisible();
  await unsupportedBoundary.click();
  const unsupportedBadges = inventoryDetail.locator(".sw-si-compat__mode > span");
  await expect(unsupportedBadges).toHaveCount(1);
  await expect(unsupportedBadges).toHaveText("Unsupported · not claimed");
  // Known difference.
  await chooseFilter(page, "compatibility-behavior-filter", "All behavior scopes");
  await chooseFilter(page, "compatibility-status-filter", "Known difference");
  await expect(detail).toHaveAttribute("data-status", /known-difference/u);
  await expect(page.getByTestId("known-difference")).toBeVisible();

  // Explicit unsupported nonclaim.
  await chooseFilter(page, "compatibility-status-filter", "Unsupported / not claimed");
  await expect(detail).toHaveAttribute("data-status", /unsupported/u);
  await expect(detail).toContainText("excluded from the pass percentage");

  // Warning behavior, with a real workbook-operation preview from checked data.
  await chooseFilter(page, "compatibility-status-filter", "Warning behavior");
  await expect(detail).toHaveAttribute("data-status", /warning/u);
  await expect(detail).toContainText("Warning behavior check");
  await expect(page.getByTestId("compatibility-workbook-preview")).toContainText('"warnings"');

  // Regression is a tested empty state: there are no reviewed external results,
  // therefore there can be no reviewed regression record.
  await chooseFilter(page, "compatibility-status-filter", "Regression");
  await expect(page.getByTestId("compatibility-results-empty")).toContainText(
    "No reviewed regressions are recorded",
  );
  await expect(page.locator(".sw-si-results .sw-si-compat__records button")).toHaveCount(0);

  // Function/feature filtering and case selection work through the keyboard.
  await chooseFilter(page, "compatibility-status-filter", "All result states");
  const featureFilter = page.getByTestId("compatibility-feature-filter");
  await chooseFilter(page, "compatibility-feature-filter", "Function · ABS");
  const absResults = page.locator(".sw-si-results .sw-si-compat__records button");
  await expect(absResults).toHaveCount(1);
  await expect(absResults.first()).toContainText("ABS");
  await featureFilter.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("compatibility-behavior-filter")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("compatibility-status-filter")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(absResults.first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(detail).toContainText("ABS");

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("live round-trip preserves formulas, the merge, and frozen rows after an edit", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page);

  // Edit through the real shell chrome: name box jump, formula-bar commit.
  await page.fill(".sheetwrite-shell-namebox", "B2");
  await page.press(".sheetwrite-shell-namebox", "Enter");
  await page.fill(".sheetwrite-shell-formula", "Edited task chair");
  await page.press(".sheetwrite-shell-formula", "Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteInteropGrid?.store.getCell({ sheet: "orders", row: 1, col: 1 })
            .resolved,
      ),
    )
    .toBe("Edited task chair");

  await page.click('[data-testid="interop-roundtrip"]');
  const report = page.locator('[data-testid="interop-roundtrip-report"]');
  await expect(report).toBeVisible({ timeout: 15_000 });
  await expect(report).toHaveAttribute("data-state", "pass");
  // Canonical document ships 21 formulas across the interchange and analytical sheets.
  await expect(page.locator('[data-testid="interop-roundtrip-formulas"]')).toHaveText("21/21");
  // The warnings panel now reflects the round-trip operation, not the empty state.
  await expect(page.locator('[data-testid="interop-warnings"]')).not.toContainText(
    "No interchange operation has run yet",
  );

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("committed LibreOffice fixture imports live with structured coded warnings", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page);

  await openDisclosure(page, "interop-fixtures-disclosure");
  const load = page.locator('[data-testid="fixture-libreoffice-rich-load"]');
  await expect(load).toBeEnabled({ timeout: 20_000 });
  await load.click();

  await expect
    .poll(() => page.locator('[data-testid="interop-source"]').textContent(), { timeout: 15_000 })
    .toContain("libreoffice-rich.xlsx");

  // Supported features arrive intact: the committed fixture's three worksheets
  // (including the hidden one) exist in the live workbook after import.
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__sheetwriteInteropGrid?.store
            .getWorkbook()
            .sheets.map((sheet) => sheet.name)
            .sort(),
        ),
      { timeout: 15_000 },
    )
    .toEqual(["Calc", "Hidden", "Inputs"]);

  // The import reports its fidelity losses as structured, coded warnings —
  // every rendered warning carries a code chip from the public warning union.
  const warnings = page.locator('[data-testid="interop-warnings"]');
  await expect(warnings).toContainText("libreoffice-rich.xlsx");
  const codes = await warnings.locator(".sw-si-warncode").allTextContents();
  expect(codes.length).toBeGreaterThan(0);
  const VALID_CODES = [
    "boolean-literal",
    "rich-text",
    "hyperlink",
    "unsupported-cell-value",
    "unsupported-feature",
    "external-relationship",
    "external-formula",
    "format-loss",
    "validation-loss",
    "invalid-metadata",
  ];
  for (const code of codes) {
    expect(VALID_CODES).toContain(code.trim());
  }
  await page.waitForSelector(".sw-si-grid canvas", { state: "attached", timeout: 15_000 });

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("hostile packages, aborted signals, and resource ceilings are rejected with typed errors", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page);

  await openDisclosure(page, "interop-limits-disclosure");

  await page.click('[data-testid="interop-hostile-run"]');
  for (const id of HOSTILE_FIXTURE_IDS) {
    await expect
      .poll(() => page.locator(`[data-testid="hostile-${id}"]`).getAttribute("data-state"), {
        timeout: 20_000,
        message: `hostile package ${id} was not rejected`,
      })
      .toBe("rejected");
  }

  await page.click('[data-testid="interop-abort-demo"]');
  const abortReport = page.locator('[data-testid="interop-abort-report"]');
  await expect(abortReport).toBeVisible({ timeout: 15_000 });
  await expect(abortReport).toHaveAttribute("data-state", "pass");
  await expect(abortReport).toContainText(/AbortError|SheetwriteError/);
  await expect(abortReport).toContainText(/abort/i);

  await page.click('[data-testid="interop-cellcap-demo"]');
  const cellCap = page.locator('[data-testid="interop-cellcap-report"]');
  await expect(cellCap).toBeVisible({ timeout: 15_000 });
  await expect(cellCap).toHaveAttribute("data-state", "pass");
  await expect(cellCap).toContainText("XlsxResourceError");
  await expect(cellCap).toContainText("maxCells");

  await page.click('[data-testid="interop-csvcap-demo"]');
  const csvCap = page.locator('[data-testid="interop-csvcap-report"]');
  await expect(csvCap).toHaveAttribute("data-state", "pass");
  await expect(csvCap).toContainText("DelimitedTextResourceError");

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("CSV export neutralizes injection payloads and pasted CSV rebuilds the workbench", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page);

  await openDisclosure(page, "interop-delimited-disclosure");

  await page.click('[data-testid="interop-csv-export"]');
  const proof = page.locator('[data-testid="interop-injection-proof"]');
  await expect(proof).toBeVisible();
  // The stored literal starts with `=`; the hardened CSV path prefixes `'`.
  await expect(proof).toContainText("'=HYPERLINK(");
  await expect(page.locator('[data-testid="interop-csv-output"]')).toBeVisible();

  // TSV of the current selection goes through the clipboard-dialect exporter.
  await page.click(".sw-si-grid", { position: { x: 120, y: 80 } });
  await page.click('[data-testid="interop-tsv-export"]');
  await expect(page.locator('[data-testid="interop-tsv-output"]')).toBeVisible();

  await page.fill(
    '[data-testid="interop-csv-input"]',
    "region,units,revenue\neu-west,12,3400\nus-east,7,2050",
  );
  await page.click('[data-testid="interop-csv-import"]');
  await expect
    .poll(() => page.locator('[data-testid="interop-source"]').textContent(), { timeout: 15_000 })
    .toContain("Pasted CSV (2 rows)");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteInteropGrid?.store.getCell({ sheet: "imported", row: 0, col: 0 })
            .resolved,
      ),
    )
    .toBe("eu-west");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteInteropGrid?.store.getCell({ sheet: "imported", row: 1, col: 2 })
            .resolved,
      ),
    )
    .toBe(2050);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});
