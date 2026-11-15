import { expect, it } from "bun:test";

import {
  fromXlsxTable,
  fromXlsxWorkbook,
  initSheetwrite,
  SheetwriteStore,
  toXlsxTable,
  toXlsxWorkbook,
} from "@sheetwrite/core";

import { xlsxAddon } from "../src/index.js";
import { book, sheet, valuesOf } from "./workbook-fixtures.js";

it("installs every backend through initSheetwrite, and a repeated install is a no-op", async () => {
  await initSheetwrite({ addons: [xlsxAddon()] });
  await initSheetwrite({ addons: [xlsxAddon()] });

  const snapshot = book([
    sheet("s", "Table", [["registered"]], {
      columns: [{ key: "value", header: "Value", width: 80, type: "text" }],
    }),
  ]);
  const store = SheetwriteStore.fromSnapshot(snapshot);
  const tableBytes = await toXlsxTable(store.getWorkbook(), store);
  expect(await fromXlsxTable(tableBytes)).toEqual({
    rowCount: 1,
    columns: { Value: ["registered"] },
  });
  expect(valuesOf(await fromXlsxWorkbook(await toXlsxWorkbook(snapshot)))).toEqual([
    { kind: "literal", value: "registered" },
  ]);
  store.dispose();
});
