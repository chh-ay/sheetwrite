import { beforeAll, expect, it } from "bun:test";

import { previewFormula } from "../src/functions.js";
import { initSheetwrite, isSheetwriteError, SheetwriteStore } from "../src/index.js";
import type { Store } from "../src/types/store.js";
import { makeWorkbook } from "./fixtures.js";

let store: SheetwriteStore;

beforeAll(async () => {
  await initSheetwrite();
  store = new SheetwriteStore(makeWorkbook(2));
});

it.each([
  ["a store that is not a SheetwriteStore", () => ({}) as Store, 0, 0, "s1", "invalid-argument"],
  ["a negative row", () => store, -1, 0, "s1", "invalid-argument"],
  ["a fractional column", () => store, 0, 1.5, "s1", "invalid-argument"],
  ["a missing sheet", () => store, 0, 0, "missing", "not-found"],
] as const)(
  "previewFormula rejects %s with a Sheetwrite error",
  (_, source, row, col, sheet, code) => {
    let error: unknown;
    try {
      previewFormula(source(), { sheet, row, col }, "=1");
    } catch (caught) {
      error = caught;
    }
    expect(isSheetwriteError(error)).toBe(true);
    expect(error).toMatchObject({ code });
  },
);

it("previewFormula calculates a formula at its cell", () => {
  expect(previewFormula(store, { sheet: "s1", row: 0, col: 0 }, "=ROW()*10")).toEqual({
    status: "value",
    value: 10,
  });
});
