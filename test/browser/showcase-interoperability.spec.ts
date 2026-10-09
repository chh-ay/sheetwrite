import { expect, type Page, test } from "@playwright/test";
import compatibilityResults from "../../docs/src/generated/compatibility-results.json" with {
  type: "json",
};
import type { Grid } from "../../packages/core/src/types.js";
import fixtureManifest from "../../packages/xlsx/test/fixtures/manifest.json" with { type: "json" };
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

  // The summary renders the checked results file; take the expected numbers from it.
  const { testSet } = compatibilityResults as unknown as {
    testSet: {
      totalTests: number;
      formulaTests: number;
      editSequenceTests: number;
      workbookTests: number;
      localPassed: number;
      unsupported: number;
      reviewedResults: number;
      checksum: string;
    };
  };
  const supported = testSet.totalTests - testSet.unsupported;
  expect(testSet.localPassed).toBeLessThanOrEqual(supported);
  const summary = page.getByTestId("compatibility-results-summary");
  for (const count of [
    testSet.totalTests,
    testSet.formulaTests,
    testSet.editSequenceTests,
    testSet.workbookTests,
  ]) {
    await expect(summary).toContainText(count.toLocaleString("en-US"));
  }
  await expect(summary).toContainText(
    `${testSet.localPassed.toLocaleString("en-US")} of ${supported.toLocaleString("en-US")}`,
  );
  await expect(summary).toContainText(
    `${testSet.reviewedResults.toLocaleString("en-US")} reviewed`,
  );
  await expect(page.getByTestId("compatibility-test-set-checksum")).toHaveText(testSet.checksum);

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
  await expect(page.locator(".sheetwrite-shell-namebox")).toHaveValue("A1");
  await expect(page.locator(".sheetwrite-shell-formula")).toHaveValue("Order");
  await expect(page.getByTestId("interop-source")).toContainText("Q1 2026");
  expect(
    await page.evaluate(
      () =>
        window.__sheetwriteInteropGrid?.store
          .getWorkbook()
          .sheets.find((sheet) => sheet.id === "orders")?.rowCount,
    ),
  ).toBe(49);

  // Edit through the real shell chrome: name box jump, formula-bar commit.
  await page.fill(".sheetwrite-shell-namebox", "B3");
  await page.press(".sheetwrite-shell-namebox", "Enter");
  await page.fill(".sheetwrite-shell-formula", "Edited task chair");
  await page.press(".sheetwrite-shell-formula", "Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteInteropGrid?.store.getCell({ sheet: "orders", row: 2, col: 1 })
            .resolved,
      ),
    )
    .toBe("Edited task chair");

  await page.click('[data-testid="interop-roundtrip"]');
  const report = page.locator('[data-testid="interop-roundtrip-report"]');
  await expect(report).toBeVisible({ timeout: 15_000 });
  await expect(report).toHaveAttribute("data-state", "pass");
  // Every formula in the document survives the round trip.
  const preserved = await page.locator('[data-testid="interop-roundtrip-formulas"]').textContent();
  const [kept, total] = (preserved ?? "").split("/").map(Number);
  expect(total).toBeGreaterThan(0);
  expect(kept).toBe(total);
  const matched = ((await page.getByTestId("interop-roundtrip-cells").textContent()) ?? "")
    .split("/")
    .map(Number);
  expect(matched[0]).toBe(matched[1]);
  expect(matched[1]).toBeGreaterThan(350);
  const sourceProof = page.getByTestId("interop-spill-proof");
  // The bytes the page exported are read back, so the ANCHORARRAY encoding is
  // shown from the file itself, not from a claim in prose.
  const spillExamples = [
    { source: "={1,2;3,4}", stored: "{1,2;3,4}", encoding: "plain" },
    { source: "=SUM(A1#)", stored: "SUM(_xlfn.ANCHORARRAY(A1))", encoding: "anchorarray" },
    { source: "=SORT(A1#)", stored: "SORT(_xlfn.ANCHORARRAY(A1))", encoding: "anchorarray" },
  ];
  for (const example of spillExamples) {
    const row = sourceProof.locator("tbody tr").filter({ hasText: example.source });
    await expect(row.locator("td")).toHaveText([example.source, example.stored, example.source]);
    await expect(row).toHaveAttribute("data-matched", "true");
    await expect(row).toHaveAttribute("data-exported", "found");
    await expect(row).toHaveAttribute("data-spill-encoding", example.encoding);
  }
  await expect(page.getByTestId("interop-spill-file-check")).toContainText(
    "3 of 3 example formulas found in the bytes this page just wrote; 2 stored as _xlfn.ANCHORARRAY(...)",
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

  const fixture = fixtureManifest.positive.find((entry) => entry.file === "libreoffice-rich.xlsx");
  if (!fixture) throw new Error("The fixture manifest must include the imported workbook");
  await openDisclosure(page, "interop-warnings-disclosure");
  const warnings = page.locator('[data-testid="interop-warnings"]');
  await expect(warnings).toBeVisible();
  await expect(warnings).toContainText(fixture.file);
  const codes = await warnings.locator(".sw-si-warncode").allTextContents();
  for (const warning of fixture.expectedWarnings) {
    expect(codes.map((code) => code.trim())).toContain(warning.split(":")[0]?.trim());
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
  await page.getByTestId("interop-injection-load").click();
  await expect(page.getByTestId("interop-status")).toContainText("Loaded: Security lab");
  await page.getByTestId("interop-injection-export").click();
  await expect(page.getByTestId("interop-injection-proof")).toContainText("'=HYPERLINK(");

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

test("CSV and TSV export and pasted CSV rebuild the live workbench", async ({ page }) => {
  const errors = collectErrors(page);
  await bootInterop(page);

  await openDisclosure(page, "interop-delimited-disclosure");

  await page.click('[data-testid="interop-csv-export"]');
  await expect(page.locator('[data-testid="interop-csv-output"]')).toBeVisible();
  await expect(page.locator('[data-testid="interop-csv-output"]')).toContainText("OP-1041");
  await expect(page.locator('[data-testid="interop-csv-output"]')).not.toContainText("HYPERLINK");

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

test("file selection and a stage drop import CSV with a visible fidelity report", async ({
  page,
}) => {
  await bootInterop(page);
  const csv = "customer,units,revenue\nAlder Design,12,3400\nHarbor Studio,7,2050";
  await page.getByTestId("interop-file-input").setInputFiles({
    name: "quarter-sales.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByTestId("interop-status")).toContainText("Loaded: quarter-sales.csv");
  await expect(page.getByTestId("interop-file-report")).toContainText("6 stored cells");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteInteropGrid?.store.getCell({ sheet: "imported", row: 1, col: 2 })
            .resolved,
      ),
    )
    .toBe(2050);
  await page.evaluate((text) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], "dropped-sales.csv", { type: "text/csv" }));
    document
      .querySelector('[data-testid="interop-drop-stage"]')
      ?.dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );
  }, csv);
  await expect(page.getByTestId("interop-status")).toContainText("Loaded: dropped-sales.csv");
  await expect(page.getByTestId("interop-file-report")).toContainText("dropped-sales.csv");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteInteropGrid?.store.getCell({ sheet: "imported", row: 0, col: 0 })
            .resolved,
      ),
    )
    .toBe("Alder Design");
});

test("0.5.0 streamed CSV demo loads 200,000 sales records and measures this browser", async ({
  page,
}) => {
  await bootInterop(page);
  await page.getByTestId("interop-bulk-import").click();
  await expect(page.getByTestId("interop-bulk-report")).toContainText("200,000 rows × 10 columns", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("interop-bulk-report")).toContainText(/\d+ ms CSV parse/u);
  await expect(page.getByTestId("interop-status")).toContainText("Loaded: Generated sales ledger", {
    timeout: 30_000,
  });
  const lastOrder = await page.evaluate(() => {
    const grid = window.__sheetwriteInteropGrid;
    if (!grid) throw new Error("The imported Grid is not available");
    return {
      rows: grid.store.getWorkbook().sheets.find((sheet) => sheet.id === "imported")?.rowCount,
      order: grid.store.getCell({ sheet: "imported", row: 199_999, col: 0 }).resolved,
      net: grid.store.getCell({ sheet: "imported", row: 199_999, col: 9 }).resolved,
    };
  });
  expect(lastOrder).toEqual({ rows: 200_000, order: "OP-299999", net: 17_835 });
});
