import { expect, type Page, test } from "@playwright/test";
import {
  ANALYSIS_SHEET_ID,
  buildOrdersLedger,
  FORMULA_PANELS,
  ORDER_ROWS,
  REGIONS,
} from "../../docs/src/showcases/scenarios/formulas.js";
import type { Grid } from "../../packages/core/src/types.js";
import { siteUrl } from "./playwright.config.js";

declare global {
  interface Window {
    __sheetwriteFormulasGrid?: Grid;
  }
}

const ROUTE = siteUrl("/showcases/formulas/");

interface BootErrors {
  console: string[];
  page: string[];
}

function collectErrors(page: Page): BootErrors {
  const errors: BootErrors = { console: [], page: [] };
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
  return errors;
}

function panel(id: string) {
  const found = FORMULA_PANELS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown panel ${id}`);
  return found;
}

/** Reads `rows` × `cols` resolved values from the Analysis sheet in the live Grid. */
async function readBlock(page: Page, row: number, col: number, rows: number, cols: number) {
  return page.evaluate(
    ({ sheet, row, col, rows, cols }) => {
      const grid = window.__sheetwriteFormulasGrid;
      if (!grid) throw new Error("Formula Grid is not mounted");
      return Array.from({ length: rows }, (_, r) =>
        Array.from(
          { length: cols },
          (_, c) => grid.store.getCell({ sheet, row: row + r, col: col + c }).resolved,
        ),
      );
    },
    { sheet: ANALYSIS_SHEET_ID, row, col, rows, cols },
  );
}

/** Revenue per region straight from the generated ledger, independent of the engine. */
function regionRevenue(apacUnitFactor = 1): Map<string, number> {
  const ledger = buildOrdersLedger();
  const totals = new Map<string, number>();
  for (let row = 0; row < ORDER_ROWS; row++) {
    const region = ledger.region[row]!;
    const units =
      region === "APAC"
        ? Math.round((ledger.units[row] ?? 0) * apacUnitFactor)
        : (ledger.units[row] ?? 0);
    totals.set(region, (totals.get(region) ?? 0) + units * (ledger.price[row] ?? 0));
  }
  return totals;
}

async function bootFormulas(page: Page): Promise<void> {
  await expect(page.getByTestId(`formulas-recipe-${FORMULA_PANELS[0]!.id}`)).toBeEnabled({
    timeout: 30_000,
  });
}

test("the full engine computes the dashboard and every panel follows one edit", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(ROUTE);
  await bootFormulas(page);

  // GROUPBY: one row per region (sorted) plus a total, equal to sums over the raw ledger.
  const region = panel("region");
  const expected = regionRevenue();
  const block = await readBlock(page, region.row, region.col, REGIONS.length + 1, 2);
  const byRegion = new Map(block.map(([label, value]) => [String(label), value]));
  for (const name of REGIONS) expect(byRegion.get(name)).toBe(expected.get(name));
  expect(byRegion.get("Total")).toBe([...expected.values()].reduce((sum, value) => sum + value));

  // Every panel shows a result: an error at its anchor means the formula or its data are wrong.
  const failing: string[] = [];
  for (const candidate of FORMULA_PANELS) {
    const anchor = (await readBlock(page, candidate.row, candidate.col, 1, 1))[0]?.[0];
    if (typeof anchor === "string" && anchor.startsWith("#")) {
      failing.push(`${candidate.id}: ${anchor}`);
    }
  }
  expect(failing).toEqual([]);

  // The APAC promotion is one transaction; GROUPBY and the A11# spill reference follow it.
  const top = panel("top");
  const best = panel("best");
  await page.getByTestId("formulas-promotion").click();
  await expect(page.getByTestId("formulas-recalc")).toContainText("APAC promotion");
  const promoted = regionRevenue(1.2);
  const after = new Map(
    (await readBlock(page, region.row, region.col, REGIONS.length + 1, 2)).map(([label, value]) => [
      String(label),
      value,
    ]),
  );
  expect(after.get("APAC")).toBe(promoted.get("APAC"));
  expect(after.get("EMEA")).toBe(expected.get("EMEA"));
  const [ranked] = await readBlock(page, top.row, top.col, 1, 2);
  const [bestRow] = await readBlock(page, best.row, best.col, 1, 2);
  expect(bestRow).toEqual(ranked);

  // Undo restores the original totals.
  await page.getByTestId("formulas-promotion").click();
  await expect
    .poll(async () => (await readBlock(page, region.row + 1, region.col + 1, 1, 1))[0]?.[0])
    .toBe(block[1]?.[1]);

  // A visitor formula evaluates in the playground cell.
  await page.getByTestId("formulas-draft").fill("=ROWS(UNIQUE(Orders!B1:B20000))");
  await page.getByTestId("formulas-run").click();
  await expect(page.getByTestId("formulas-draft-result")).toContainText(`${REGIONS.length} ·`);

  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("arriving from a default-engine page loads the full engine", async ({ page }) => {
  const errors = collectErrors(page);
  // The performance page selects the default engine. Follow the real links to
  // the formula page: the hub card opens it as a new document.
  await page.goto(siteUrl("/showcases/performance/"));
  await page.waitForSelector('[data-testid="scale-grid"] canvas', { state: "attached" });
  await page
    .getByRole("navigation", { name: "Site" })
    .getByRole("link", { name: "Showcases" })
    .click();
  await expect(page).toHaveURL(/\/showcases\/$/);
  await page.locator('main a[data-owner="formulas"]').click();
  await expect(page).toHaveURL(new RegExp(`${new URL(ROUTE).pathname}$`));
  await bootFormulas(page);
  await expect(page.getByTestId("formulas-recalc")).toContainText("First calculation");

  expect(errors.page).toEqual([]);
});
