import { afterEach, beforeEach, expect, test } from "bun:test";

import { installCanvasTestStubs } from "../../packages/core/src/testing.js";
import {
  createSpreadsheetScenario,
  SALES_ROWS,
  salesOrder,
  SUMMARY_SHEET,
  type SpreadsheetScenario,
} from "../src/showcases/scenarios/spreadsheet.js";

let restoreCanvas: () => void;
let scenario: SpreadsheetScenario | null = null;
let host: HTMLElement;
beforeEach(() => {
  restoreCanvas = installCanvasTestStubs();
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  scenario?.dispose();
  scenario = null;
  host.remove();
  restoreCanvas();
});

test("the summary sheet's cross-sheet formulas agree with the sales ledger", async () => {
  scenario = createSpreadsheetScenario(host);
  await scenario.ready;
  const grid = scenario.grid();
  if (grid === null) throw new Error("shell did not mount");
  const value = (row: number, col: number) =>
    grid.store.getCell({ sheet: SUMMARY_SHEET, row, col }).resolved;

  const expected = new Map<string, { units: number; revenue: number }>();
  for (let index = 0; index < SALES_ROWS; index += 1) {
    const order = salesOrder(index);
    const totals = expected.get(order.region) ?? { units: 0, revenue: 0 };
    totals.units += order.units;
    totals.revenue += order.units * order.price;
    expected.set(order.region, totals);
  }

  let row = 1;
  for (const [region, totals] of expected) {
    expect(value(row, 0)).toBe(region);
    expect(value(row, 1)).toBe(totals.units);
    expect(value(row, 2)).toBeCloseTo(totals.revenue, 6);
    row += 1;
  }
  const revenue = [...expected.values()].reduce((sum, totals) => sum + totals.revenue, 0);
  expect(value(row, 0)).toBe("Total");
  expect(value(row, 2)).toBeCloseTo(revenue, 6);
  expect(value(row, 3)).toBeCloseTo(1, 12);
});
