import { beforeAll, expect, it } from "bun:test";

import { initSheetwrite, SheetwriteStore } from "../src/index.js";
import { makeWorkbook } from "./fixtures.js";

const address = (row: number, col: number) => ({ sheet: "s1", row, col });

const ROUNDED_PI = 3.142;

beforeAll(async () => {
  await initSheetwrite();
});

// The engine's own tests check the other functions against Excel results.
it("evaluates AVERAGE and ROUND(PI()) as Excel does, and recalculates them", () => {
  const store = new SheetwriteStore(makeWorkbook(12));
  store.applyTransaction({
    patches: [
      ...[1, 2, 3, 4].map((value, row) => ({
        op: "set" as const,
        addr: address(row, 0),
        value: { kind: "literal" as const, value },
      })),
      { op: "set", addr: address(0, 1), value: { kind: "formula", src: "=AVERAGE(A1:A4)" } },
      { op: "set", addr: address(1, 1), value: { kind: "formula", src: "=ROUND(PI(),3)" } },
    ],
  });
  expect([0, 1].map((row) => store.getCell(address(row, 1)).resolved)).toEqual([2.5, ROUNDED_PI]);

  store.applyTransaction({
    patches: [{ op: "set", addr: address(3, 0), value: { kind: "literal", value: 8 } }],
  });
  expect([0, 1].map((row) => store.getCell(address(row, 1)).resolved)).toEqual([3.5, ROUNDED_PI]);
  store.dispose();
});
