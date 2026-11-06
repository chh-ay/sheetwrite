import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as Core from "@sheetwrite/core";
import * as Adapter from "@sheetwrite/core/adapter";
import * as Shell from "@sheetwrite/core/shell";
import * as Xlsx from "@sheetwrite/xlsx";
import * as Charts from "@sheetwrite/charts";
import * as ReactAdapter from "@sheetwrite/react";
import * as VueAdapter from "@sheetwrite/vue";
import { load } from "@sheetwrite/wasm";

const entries = {
  "@sheetwrite/core": Core,
  "@sheetwrite/xlsx": Xlsx,
  "@sheetwrite/charts": Charts,
  "@sheetwrite/core/adapter": Adapter,
  "@sheetwrite/core/shell": Shell,
  "@sheetwrite/react": ReactAdapter,
  "@sheetwrite/vue": VueAdapter,
};

for (const [name, entry] of Object.entries(entries)) {
  if (Object.keys(entry).length === 0) {
    throw new Error(`${name} has no runtime exports`);
  }
}

const forbiddenCoreExports = [
  "Patch",
  "LegacyDataSource",
  "toXlsx",
  "fromXlsx",
  "XlsxBackend",
  "XlsxImportBackend",
  "setXlsxBackend",
  "setXlsxImportBackend",
  "setXlsxTableExportBackend",
  "setXlsxTableImportBackend",
  "setXlsxWorkbookBackend",
  "setChartRendererFactory",
  "setChartViewProviderFactory",
  "registerQueryCommands",
];
for (const name of forbiddenCoreExports) {
  if (name in Core) throw new Error(`@sheetwrite/core still exports removed ${name}`);
}
for (const name of ["toXlsxTable", "fromXlsxTable", "toXlsxWorkbook", "fromXlsxWorkbook"]) {
  if (typeof Reflect.get(Core, name) !== "function") {
    throw new Error(`@sheetwrite/core is missing canonical runtime export ${name}`);
  }
}

await load();

let uninitializedError;
try {
  new Core.SheetwriteStore({
    activeSheet: "s",
    sheets: [{ id: "s", name: "S", rowCount: 1, columns: [] }],
  });
} catch (error) {
  uninitializedError = error;
}
if (!String(uninitializedError?.message).includes("does not initialize core")) {
  throw new Error("SheetwriteStore must require initSheetwrite() even after the engine's load()");
}

await Core.initSheetwrite({ addons: [Xlsx.xlsxAddon(), Charts.chartsAddon()] });

const cssUrl = import.meta.resolve("@sheetwrite/core/styles.css");
const css = await readFile(fileURLToPath(cssUrl), "utf8");
if (!css.includes(".sheetwrite")) {
  throw new Error("The packed core stylesheet is missing Sheetwrite rules");
}

const shellCssUrl = import.meta.resolve("@sheetwrite/core/shell.css");
const shellCss = await readFile(fileURLToPath(shellCssUrl), "utf8");
if (!shellCss.includes(".sheetwrite-shell")) {
  throw new Error("The packed shell stylesheet is missing shell rules");
}

const wasmUrl = import.meta.resolve("@sheetwrite/wasm/wasm");
const wasm = await readFile(fileURLToPath(wasmUrl));
if (wasm.length < 8 || wasm.subarray(0, 4).toString("hex") !== "0061736d") {
  throw new Error("The packed WASM export is not a WebAssembly binary");
}

const historyWasm = await readFile(
  fileURLToPath(import.meta.resolve("@sheetwrite/wasm/history/wasm")),
);
if (historyWasm.subarray(0, 4).toString("hex") !== "0061736d") {
  throw new Error("The packed history kernel export is not a WebAssembly binary");
}

// Packed core must find the packed history kernel when a diff first runs.
const { HistoryArchive, MemoryHistoryStorage } = await import("@sheetwrite/core/history");
const historySnapshot = {
  schemaVersion: 1,
  documentId: "packed",
  version: 0,
  workbook: { activeSheet: "s" },
  sheets: [
    {
      id: "s",
      name: "S",
      order: 0,
      rowCount: 1,
      columns: [{ key: "a", header: "A", width: 80, type: "number" }],
      cells: [],
    },
  ],
};
const archive = await HistoryArchive.open({
  documentId: "packed",
  storage: new MemoryHistoryStorage(),
});
await archive.initialize(historySnapshot, 0);
const before = await archive.saveVersion("Before", "packed", 0);
await archive.record({
  baseRevision: 0,
  revision: 1,
  mutationId: "packed-1",
  authorId: "packed",
  time: 1,
  operations: [
    { op: "set", addr: { sheet: "s", row: 0, col: 0 }, value: { kind: "literal", value: 1 } },
  ],
});
const after = await archive.saveVersion("After", "packed", 1);
const historyDiff = await archive.diffVersions({ from: before.id, to: after.id });
if (historyDiff.cells.flags.length !== 1 || historyDiff.authors[0] !== "packed") {
  throw new Error("The packed history diff did not report the changed cell");
}

const tableWorkbook = {
  activeSheet: "table",
  sheets: [
    {
      id: "table",
      name: "Table",
      rowCount: 1,
      columns: [{ key: "value", header: "Value", width: 80, type: "text" }],
    },
  ],
};
const store = new Core.SheetwriteStore(tableWorkbook);
store.applyTransaction({
  patches: [
    {
      op: "set",
      addr: { sheet: "table", row: 0, col: 0 },
      value: { kind: "literal", value: "packed" },
    },
  ],
});
const tableBytes = await Core.toXlsxTable(store.getWorkbook(), store);
const tableData = await Core.fromXlsxTable(tableBytes);
if (tableData.columns.Value?.[0] !== "packed") {
  throw new Error("Packed table XLSX round-trip changed the value");
}
store.dispose();

// The packed charts add-on must let packed core open live views of a packed store.
const chartStore = new Core.SheetwriteStore({
  activeSheet: "chart",
  sheets: [
    {
      id: "chart",
      name: "Chart",
      rowCount: 2,
      columns: [{ key: "amount", header: "Amount", width: 80, type: "number" }],
      charts: [
        {
          id: "packed",
          kind: "column",
          anchor: { row: 0, col: 0, offsetX: 0, offsetY: 0, width: 320, height: 200 },
          series: [
            {
              name: "Amount",
              values: { sheet: "chart", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
            },
          ],
        },
      ],
    },
  ],
});
const chartViews = Core.openChartViews(chartStore);
chartStore.applyTransaction({
  patches: [
    { op: "set", addr: { sheet: "chart", row: 1, col: 0 }, value: { kind: "literal", value: 5 } },
  ],
});
const packedChartValues = chartViews.get({ sheet: "chart", id: "packed" })?.series[0]?.values;
if (JSON.stringify(packedChartValues) !== JSON.stringify([null, 5])) {
  throw new Error(`Packed chart view resolved ${JSON.stringify(packedChartValues)}`);
}
chartViews.dispose();
chartStore.dispose();

const workbookSnapshot = {
  schemaVersion: 1,
  workbook: { activeSheet: "calc" },
  sheets: [
    {
      id: "calc",
      name: "Calc",
      order: 0,
      rowCount: 1,
      columns: [{ key: "result", header: "Result", width: 80, type: "number" }],
      cells: [
        {
          startRow: 0,
          startCol: 0,
          rowCount: 1,
          colCount: 1,
          cells: [
            {
              rowOffset: 0,
              colOffset: 0,
              value: { kind: "formula", src: "=1+1" },
            },
          ],
        },
      ],
    },
  ],
};
const workbookBytes = await Core.toXlsxWorkbook(workbookSnapshot);
const importedWorkbook = await Core.fromXlsxWorkbook(workbookBytes);
if (importedWorkbook.sheets[0]?.cells[0]?.cells[0]?.value?.src !== "=1+1") {
  throw new Error("Packed workbook XLSX round-trip changed the formula");
}

console.log("Packed runtime, CSS, and WASM checks passed");
