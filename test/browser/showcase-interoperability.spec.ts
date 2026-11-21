import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import fixtureManifest from "../../packages/xlsx/test/fixtures/manifest.json" with { type: "json" };
import { expect, test } from "./fixtures.js";

// The interoperability showcase in a real browser: XLSX and CSV through the
// browser's own file, inflate and download paths. Each format's rules are
// owned by packages/xlsx/test and packages/core/test (export, io-abort).

declare global {
  interface Window {
    __sheetwriteInteropGrid?: Grid;
  }
}

const ROUTE = "/showcases/interoperability/";
const HOSTILE_TEST_IDS = [
  "hostile-traversal",
  "hostile-doctype",
  "hostile-deep-xml",
  "hostile-compression-ratio",
  "hostile-corrupt-deflate",
  "interop-abort-report",
  "interop-cellcap-report",
  "interop-csvcap-report",
] as const;

/** Totals of the checked compatibility results file. */
interface CompatibilityTestSet {
  totalTests: number;
  publishedExamples: number;
  localPassed: number;
  unsupported: number;
  checksum: string;
}

async function bootInterop(page: Page): Promise<void> {
  await page.goto(ROUTE);
  await page.waitForSelector(".sw-si-grid canvas", { state: "attached", timeout: 15_000 });
  await expect(page.getByTestId("interop-status")).toContainText("Loaded:", { timeout: 15_000 });
}

/** Open a lab through its tile; one lab is open at a time, below the tiles. */
async function openLab(page: Page, lab: string): Promise<void> {
  const tile = page.getByTestId(`interop-lab-${lab}`);
  await tile.click();
  await expect(tile).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`#interop-lab-${lab}-panel`)).toBeVisible();
}

function sheetNames(page: Page): Promise<string[] | undefined> {
  return page.evaluate(() =>
    window.__sheetwriteInteropGrid?.store
      .getWorkbook()
      .sheets.map((sheet) => sheet.name)
      .sort(),
  );
}

function importedCell(page: Page, row: number, col: number): Promise<unknown> {
  return page.evaluate(
    ([at, column]) =>
      window.__sheetwriteInteropGrid?.store.getCell({ sheet: "imported", row: at, col: column })
        .resolved,
    [row, col] as const,
  );
}

test("the evidence vault reports the served checks; the lab tiles are tabs a link can open", async ({
  page,
}) => {
  await bootInterop(page);
  const vault = page.getByTestId("interop-lab-vault");
  await expect(vault).toHaveAttribute("aria-selected", "true");

  // Every figure comes from the checked results file the page links to.
  const href = await page.getByRole("link", { name: "Published checks" }).getAttribute("href");
  if (href === null) throw new Error("The published checks link has no href");
  const response = await page.request.get(new URL(href, page.url()).href);
  expect(response.ok()).toBe(true);
  const { testSet } = (await response.json()) as { testSet: CompatibilityTestSet };
  const figure = page.getByTestId("compatibility-results-summary");
  await expect(figure).toContainText(testSet.localPassed.toLocaleString("en-US"));
  await expect(figure).toContainText(
    `/ ${(testSet.totalTests - testSet.unsupported).toLocaleString("en-US")}`,
  );
  await expect(page.getByTestId("compatibility-test-set-checksum")).toHaveAttribute(
    "title",
    testSet.checksum,
  );
  await expect(page.getByTestId("compatibility-example-page")).toHaveText(
    `1–15 of ${testSet.publishedExamples.toLocaleString("en-US")}`,
  );

  await vault.focus();
  await page.keyboard.press("ArrowRight");
  const fixtures = page.getByTestId("interop-lab-fixtures");
  await expect(fixtures).toBeFocused();
  await expect(fixtures).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#interop-lab-vault-panel")).toBeHidden();
  await expect(page.locator("#interop-lab-fixtures-panel")).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.getByTestId("interop-lab-runtime")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(vault).toBeFocused();

  await page.evaluate(() => {
    window.location.hash = "delimited";
  });
  await expect(page.getByTestId("interop-lab-delimited")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("interop-lab-delimited")).toBeInViewport();
});

test("@portability a committed fixture imports with its coded warnings, and File › Import XLSX opens the native picker from the keyboard", async ({
  page,
}) => {
  await bootInterop(page);
  // The showcase registers its optional backend on its first XLSX action.
  await openLab(page, "fixtures");
  const load = page.getByTestId("fixture-libreoffice-rich-load");
  await expect(load).toBeEnabled({ timeout: 20_000 });
  await load.click();
  await expect
    .poll(() => sheetNames(page), { timeout: 15_000 })
    .toEqual(["Calc", "Hidden", "Inputs"]);
  const fixture = fixtureManifest.positive.find((entry) => entry.file === "libreoffice-rich.xlsx");
  if (!fixture) throw new Error("The fixture manifest must include the imported workbook");
  await openLab(page, "warnings");
  const codes = await page
    .getByTestId("interop-warnings")
    .locator(".sw-si-warncode")
    .allTextContents();
  for (const warning of fixture.expectedWarnings) {
    expect(codes.map((code) => code.trim())).toContain(warning.split(":")[0]?.trim());
  }

  await page.evaluate(() => window.__sheetwriteInteropGrid?.setConfig({ ribbon: true }));
  const ribbon = page.locator(".sw-si-grid .sheetwrite-ribbon");
  const fileTab = ribbon.getByRole("tab", { name: "File", exact: true });
  await fileTab.focus();
  await fileTab.press("Enter");
  const command = ribbon.getByRole("button", { name: "Import XLSX", exact: true });
  await expect(command).toBeEnabled();
  await command.focus();
  const chooserReady = page.waitForEvent("filechooser");
  await command.press("Enter");
  const chooser = await chooserReady;
  await chooser.setFiles(
    fileURLToPath(
      new URL("../../packages/xlsx/test/fixtures/shared-formula.xlsx", import.meta.url),
    ),
  );
  await expect.poll(() => sheetNames(page)).toEqual(["Fixture"]);
  expect(
    await page.evaluate(() => {
      const grid = window.__sheetwriteInteropGrid;
      if (!grid) throw new Error("Expected imported grid");
      return grid.store.getCell({ sheet: grid.getActiveSheet(), row: 2, col: 1 }).resolved;
    }),
  ).toBe(6);
  // A replaced workbook starts a new history.
  await expect
    .poll(() =>
      page.evaluate(() => window.__sheetwriteInteropGrid?.getCommandState("undo").disabled),
    )
    .toBe(true);
});

test("one run stops every hostile file and limit in the browser", async ({ page }) => {
  await bootInterop(page);
  await openLab(page, "security");
  await page.getByTestId("interop-hostile-run").click();
  for (const id of HOSTILE_TEST_IDS) {
    await expect(page.getByTestId(id), id).toHaveAttribute("data-state", "rejected", {
      timeout: 20_000,
    });
  }
  await expect(page.getByTestId("interop-abort-report")).toContainText("AbortError");
  await expect(page.getByTestId("interop-cellcap-report")).toContainText("XlsxResourceError");
  await expect(page.getByTestId("interop-csvcap-report")).toContainText(
    "DelimitedTextResourceError",
  );
});

test("a chosen CSV file rebuilds the live workbench, and the 0.5.0 streamed CSV demo loads 200,000 sales records", async ({
  page,
}) => {
  await bootInterop(page);
  await page.getByTestId("interop-file-input").setInputFiles({
    name: "quarter-sales.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("customer,units,revenue\nAlder Design,12,3400\nHarbor Studio,7,2050"),
  });
  await expect(page.getByTestId("interop-status")).toContainText("Loaded: quarter-sales.csv");
  await expect.poll(() => importedCell(page, 0, 0)).toBe("Alder Design");
  await expect.poll(() => importedCell(page, 1, 2)).toBe(2050);

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
