import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { createGridFromSnapshot, initSheetwrite, type Grid } from "@sheetwrite/core";

import { installCanvasTestStubs } from "../../packages/core/src/testing.js";
import {
  applyNumberFormat,
  applyStyleCommand,
  createFormattingSnapshot,
  FORMATTING_SHEET,
  roundTripFormatting,
} from "../src/showcases/scenarios/formatting.js";

let restoreCanvas: () => void;
let grid: Grid | null = null;
let host: HTMLElement | null = null;

beforeAll(async () => {
  await initSheetwrite();
});
beforeEach(() => {
  restoreCanvas = installCanvasTestStubs();
});
afterEach(() => {
  grid?.destroy();
  host?.remove();
  grid = null;
  host = null;
  restoreCanvas();
});

it("round-trips live edits rather than the seed, including General overriding the currency column", async () => {
  host = document.createElement("div");
  document.body.append(host);
  grid = createGridFromSnapshot(host, createFormattingSnapshot(), { config: { toolbar: false } });
  applyStyleCommand(grid, "Italic");
  applyNumberFormat(grid, "General");
  const report = await roundTripFormatting(grid);

  expect(report.differences).toEqual([]);
  expect(report.byteLength).toBeGreaterThan(0);
  const sheet = report.snapshot.sheets.find(
    (candidate) => candidate.name === "Q1 operating budget",
  );
  const edited = sheet?.cells
    .flatMap((block) =>
      block.cells.map((entry) => ({
        ...entry,
        row: block.startRow + entry.rowOffset,
        col: block.startCol + entry.colOffset,
      })),
    )
    .find((entry) => entry.row === 2 && entry.col === 1);
  expect(edited?.style).toMatchObject({ italic: true, numberFormat: "General" });
  expect(edited?.value).toEqual({ kind: "literal", value: 84250 });
  expect(sheet?.columns[1]?.numberFormat).toBe("$#,##0.00");
  expect(
    grid.store.getCell({ sheet: FORMATTING_SHEET, row: 3, col: 1 }).style.numberFormat,
  ).toBeUndefined();
});
