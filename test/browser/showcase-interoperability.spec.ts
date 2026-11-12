import { fileURLToPath } from "node:url";

import { expect, type Page, test } from "@playwright/test";

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
/** The limits the security lab runs beside its hostile files. */
const LIMIT_TEST_IDS = [
  "interop-abort-report",
  "interop-cellcap-report",
  "interop-csvcap-report",
] as const;

interface BootErrors {
  console: string[];
  page: string[];
}

/** Totals of the checked compatibility results file. */
interface CompatibilityTestSet {
  totalTests: number;
  publishedExamples: number;
  formulaTests: number;
  editSequenceTests: number;
  workbookTests: number;
  localPassed: number;
  unsupported: number;
  reviewedResults: number;
  knownDifferences: number;
  checksum: string;
}

/** Fetches the checked results file the vault's "Published checks" link serves. */
async function servedCompatibilityTestSet(page: Page): Promise<CompatibilityTestSet> {
  const href = await page.getByRole("link", { name: "Published checks" }).getAttribute("href");
  if (href === null) throw new Error("The published checks link has no href");
  const response = await page.request.get(new URL(href, page.url()).href);
  expect(response.ok()).toBe(true);
  const results = (await response.json()) as { testSet: CompatibilityTestSet };
  return results.testSet;
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

/** Open a lab through its tile; one lab is open at a time, below the tiles. */
async function openLab(page: Page, lab: string): Promise<void> {
  const tile = page.getByTestId(`interop-lab-${lab}`);
  await tile.click();
  await expect(tile).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`#interop-lab-${lab}-panel`)).toBeVisible();
}

test("@portability the evidence vault answers from the checked data and browses its checks", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page, `${ROUTE}?compatibility=producer.google-sheets`);
  await expect(page.locator("select")).toHaveCount(0);
  const vault = page.locator("#interop-lab-vault-panel");
  await expect(vault).toBeVisible();

  // Every figure comes from the file the page links to.
  const testSet = await servedCompatibilityTestSet(page);
  const applicable = testSet.totalTests - testSet.unsupported;
  const figure = page.getByTestId("compatibility-results-summary");
  await expect(figure).toContainText(testSet.localPassed.toLocaleString("en-US"));
  await expect(figure).toContainText(`/ ${applicable.toLocaleString("en-US")}`);
  // No known-difference count while there are none.
  if (testSet.knownDifferences === 0) await expect(figure).not.toContainText("known difference");
  for (const count of [testSet.formulaTests, testSet.editSequenceTests, testSet.workbookTests]) {
    await expect(vault.locator(".sw-vault-kinds")).toContainText(count.toLocaleString("en-US"));
  }
  await expect(vault).toContainText(
    `${testSet.unsupported.toLocaleString("en-US")} checks don't apply`,
  );
  if (testSet.reviewedResults === 0) {
    await expect(vault).toContainText("No results from Excel, Google Sheets and LibreOffice");
  }
  await expect(page.getByTestId("compatibility-test-set-checksum")).toHaveAttribute(
    "title",
    testSet.checksum,
  );

  // A page of 15 checks, with the pager.
  const rows = page.getByTestId("compatibility-results-table").locator("tbody th button");
  await expect(rows).toHaveCount(15);
  const pager = page.getByTestId("compatibility-example-page");
  await expect(pager).toHaveText(`1–15 of ${testSet.publishedExamples.toLocaleString("en-US")}`);
  const firstName = await rows.first().textContent();
  await vault.getByRole("button", { name: "Next checks" }).click();
  await expect(pager).toHaveText(/^16–30 of /u);
  await expect(rows.first()).not.toHaveText(firstName ?? "");
  await vault.getByRole("button", { name: "Previous checks" }).click();
  await expect(rows.first()).toHaveText(firstName ?? "");

  // Choosing a check opens it beside the table.
  const detail = vault.locator(".sw-vault-detail").getByTestId("compatibility-result-detail");
  await rows.nth(2).click();
  await expect(rows.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(detail).toContainText("Expected");
  await expect(detail).toContainText("No recorded result yet");

  // Search, the kind segments and the result menu narrow the table.
  await page.getByTestId("compatibility-search").fill("VLOOKUP");
  await expect(rows.first()).toContainText("VLOOKUP");
  await page.getByTestId("compatibility-search").fill("");
  await page.getByTestId("compatibility-kind-workbook").click();
  await expect(page.getByTestId("compatibility-kind-workbook")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(detail).toContainText("Workbook");
  await page.getByTestId("compatibility-kind-all").click();
  await page.getByRole("combobox", { name: "Result" }).click();
  await page.getByRole("option", { name: "Not applicable" }).click();
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  await expect(detail).toContainText("Not applicable");

  // `?compatibility=` opened its feature record under the boundary columns.
  const record = page.getByTestId("compatibility-detail");
  await expect(record).toContainText("Recorded public Google Sheets export");
  await expect(record).toContainText("The checked source");
  await expect(page.getByTestId("compatibility-producer.google-sheets")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // On a phone the check opens as a sheet that Escape closes, and nothing
  // overflows the page.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("combobox", { name: "Result" }).click();
  await page.getByRole("option", { name: "Any result" }).click();
  await rows.first().click();
  const sheet = page.locator(".sw-vault-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("compatibility-result-detail")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
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
    {
      source: "=SORT(A1#)",
      // MS-XLSX §2.2.2: SORT is a future worksheet function.
      stored: "_xlfn._xlws.SORT(_xlfn.ANCHORARRAY(A1))",
      encoding: "anchorarray",
    },
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

test("@portability File import opens the native picker from the keyboard and replaces the live workbook", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page);

  // The showcase registers its optional backend on its first XLSX action.
  await openLab(page, "fixtures");
  const load = page.getByTestId("fixture-libreoffice-rich-load");
  await expect(load).toBeEnabled({ timeout: 20_000 });
  await load.click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__sheetwriteInteropGrid?.store
          .getWorkbook()
          .sheets.map((sheet) => sheet.name)
          .sort(),
      ),
    )
    .toEqual(["Calc", "Hidden", "Inputs"]);

  await page.evaluate(() => {
    const grid = window.__sheetwriteInteropGrid;
    if (!grid) throw new Error("Expected live interoperability grid");
    grid.setConfig({ ribbon: true });
  });
  const ribbon = page.locator(".sw-si-grid .sheetwrite-ribbon");
  const fileTab = ribbon.getByRole("tab", { name: "File", exact: true });
  await fileTab.focus();
  await fileTab.press("Enter");
  const command = ribbon.getByRole("button", { name: "Import XLSX", exact: true });
  await expect(command).toBeEnabled();
  await expect(command).toHaveAccessibleName("Import XLSX");
  await command.focus();
  const chooserReady = page.waitForEvent("filechooser");
  await command.press("Enter");
  const chooser = await chooserReady;
  await chooser.setFiles(
    fileURLToPath(
      new URL("../../packages/xlsx/test/fixtures/shared-formula.xlsx", import.meta.url),
    ),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__sheetwriteInteropGrid?.store
          .getWorkbook()
          .sheets.map((sheet) => sheet.name)
          .sort(),
      ),
    )
    .toEqual(["Fixture"]);
  expect(
    await page.evaluate(() => {
      const grid = window.__sheetwriteInteropGrid;
      if (!grid) throw new Error("Expected imported grid");
      return grid.store.getCell({ sheet: grid.getActiveSheet(), row: 2, col: 1 }).resolved;
    }),
  ).toBe(6);
  await expect
    .poll(() =>
      page.evaluate(() => window.__sheetwriteInteropGrid?.getCommandState("undo").disabled),
    )
    .toBe(true);
  await expect(ribbon).toBeVisible();
  expect(errors.page).toEqual([]);
});

test("committed LibreOffice fixture imports live with structured coded warnings", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page);

  await openLab(page, "fixtures");
  const load = page.locator('[data-testid="fixture-libreoffice-rich-load"]');
  await expect(load).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByTestId("interop-lab-fixtures")).toContainText("3 hashes match");
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
  await openLab(page, "warnings");
  const warnings = page.locator('[data-testid="interop-warnings"]');
  await expect(warnings).toBeVisible();
  await expect(page.getByTestId("interop-warning-count")).toContainText(fixture.file);
  const codes = await warnings.locator(".sw-si-warncode").allTextContents();
  for (const warning of fixture.expectedWarnings) {
    expect(codes.map((code) => code.trim())).toContain(warning.split(":")[0]?.trim());
  }
  await page.waitForSelector(".sw-si-grid canvas", { state: "attached", timeout: 15_000 });

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("one run stops every hostile file and limit with a typed error", async ({ page }) => {
  const errors = collectErrors(page);
  await bootInterop(page);

  await openLab(page, "security");
  const total = HOSTILE_FIXTURE_IDS.length + LIMIT_TEST_IDS.length;
  const figure = page.getByTestId("interop-attacks-figure");
  await expect(figure).toContainText("attacks, not run yet");
  await page.getByTestId("interop-hostile-run").click();
  for (const id of HOSTILE_FIXTURE_IDS) {
    await expect
      .poll(() => page.locator(`[data-testid="hostile-${id}"]`).getAttribute("data-state"), {
        timeout: 20_000,
        message: `hostile package ${id} was not rejected`,
      })
      .toBe("rejected");
  }
  for (const id of LIMIT_TEST_IDS) {
    await expect(page.getByTestId(id)).toHaveAttribute("data-state", "rejected", {
      timeout: 15_000,
    });
  }
  await expect(page.getByTestId("interop-abort-report")).toContainText("AbortError");
  await expect(page.getByTestId("interop-cellcap-report")).toContainText("XlsxResourceError");
  await expect(page.getByTestId("interop-cellcap-report")).toContainText("maxCells");
  await expect(page.getByTestId("interop-csvcap-report")).toContainText(
    "DelimitedTextResourceError",
  );
  await expect(figure).toContainText(`${total}`);
  await expect(figure).toContainText("attacks stopped in this run");
  await expect(page.getByTestId("interop-lab-security")).toContainText(
    `${total} / ${total} stopped`,
  );

  // On a phone the attacks become cards that fit the page.
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("the lab tiles are tabs: arrow keys move between labs, one open at a time", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page);
  const vault = page.getByTestId("interop-lab-vault");
  await expect(vault).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#interop-lab-vault-panel")).toBeVisible();

  await vault.focus();
  await page.keyboard.press("ArrowRight");
  const fixtures = page.getByTestId("interop-lab-fixtures");
  await expect(fixtures).toBeFocused();
  await expect(fixtures).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#interop-lab-vault-panel")).toBeHidden();
  await expect(page.locator("#interop-lab-fixtures-panel")).toBeVisible();
  await page.keyboard.press("End");
  const runtime = page.getByTestId("interop-lab-runtime");
  await expect(runtime).toBeFocused();
  await expect(page.getByTestId("interop-isolation")).toBeVisible();
  await expect(page.getByTestId("interop-isolation-error")).toContainText(
    "XLSX add-on not installed",
  );
  await page.keyboard.press("Home");
  await expect(vault).toBeFocused();
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("CSV and TSV export, the injection probe and pasted CSV rebuild the live workbench", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootInterop(page);

  await openLab(page, "delimited");

  await page.click('[data-testid="interop-csv-export"]');
  await expect(page.locator('[data-testid="interop-csv-output"]')).toBeVisible();
  await expect(page.locator('[data-testid="interop-csv-output"]')).toContainText("OP-1041");
  await expect(page.locator('[data-testid="interop-csv-output"]')).not.toContainText("HYPERLINK");

  // TSV of the current selection goes through the clipboard-dialect exporter.
  await page.click(".sw-si-grid", { position: { x: 120, y: 80 } });
  await page.click('[data-testid="interop-tsv-export"]');
  await expect(page.locator('[data-testid="interop-tsv-output"]')).toBeVisible();

  // Formula-like text leaves as text.
  await page.getByTestId("interop-injection-load").click();
  await expect(page.getByTestId("interop-status")).toContainText("Loaded: CSV and TSV");
  await page.getByTestId("interop-injection-export").click();
  await expect(page.getByTestId("interop-injection-proof")).toContainText("'=HYPERLINK(");

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
