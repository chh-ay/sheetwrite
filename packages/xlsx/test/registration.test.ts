import { beforeAll, describe, expect, it } from "bun:test";

import type {
  Workbook,
  WorkbookSnapshot,
  XlsxTableExportBackend,
  XlsxTableImportBackend,
  XlsxWorkbookBackend,
} from "@sheetwrite/core";
import {
  fromXlsxTable,
  fromXlsxWorkbook,
  initSheetwrite,
  SheetwriteStore,
  setXlsxTableExportBackend,
  setXlsxTableImportBackend,
  setXlsxWorkbookBackend,
  toXlsxTable,
  toXlsxWorkbook,
} from "@sheetwrite/core";

beforeAll(async () => {
  await initSheetwrite();
});

function workbook(): Workbook {
  return {
    activeSheet: "s",
    sheets: [
      {
        id: "s",
        name: "Table",
        rowCount: 1,
        columns: [{ key: "value", header: "Value", width: 80, type: "text" }],
      },
    ],
  };
}

function workbook_snapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "s" },
    sheets: [
      {
        id: "s",
        name: "Workbook",
        order: 0,
        rowCount: 1,
        columns: [{ key: "value", header: "Value", width: 80, type: "text" }],
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
                value: { kind: "literal", value: "registered" },
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("XLSX package registration", () => {
  it("leaves literal and range-only workbooks engine-free and batches cells with names", async () => {
    const snapshot = workbook_snapshot();
    snapshot.workbook.namedRanges = [
      {
        name: "Target",
        range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      },
    ];
    const script = `
      import * as wasm from ${JSON.stringify(new URL("../../wasm/loader-node.mjs", import.meta.url).href)};
      import { initSheetwrite, isSheetwriteReady } from ${JSON.stringify(new URL("../../core/dist/index.js", import.meta.url).href)};
      import { sheetwriteWorkbookBackend as backend } from ${JSON.stringify(new URL("../src/workbook.js", import.meta.url).href)};
      const snapshot = ${JSON.stringify(snapshot)};
      const before = wasm.isLoaded();
      await backend.fromXlsxWorkbook(await backend.toXlsxWorkbook(snapshot));
      const afterRangeOnly = wasm.isLoaded();
      snapshot.sheets[0].cells[0].cells[0].value = { kind: "formula", src: "=LET(x,1,x+1)" };
      snapshot.workbook.namedRanges.push({ name: "Plus", formula: "=LAMBDA(v,v+1)" });
      await backend.fromXlsxWorkbook(await backend.toXlsxWorkbook(snapshot));
      const readyAfterTemporary = isSheetwriteReady();
      let instances = 0;
      let batches = 0;
      let scalars = 0;
      await initSheetwrite(undefined, {
        ...wasm,
        createEngine: async (...args) => {
          instances += 1;
          const engine = await wasm.createEngine(...args);
          return {
            ...engine,
            convertXlsxFormulas: (...args) => { batches += 1; return engine.convertXlsxFormulas(...args); },
            formulaToXlsx: (...args) => { scalars += 1; return engine.formulaToXlsx(...args); },
            formulaFromXlsx: (...args) => { scalars += 1; return engine.formulaFromXlsx(...args); },
          };
        },
      });
      const bytes = await backend.toXlsxWorkbook(snapshot);
      const exportBatches = batches;
      batches = 0;
      const restored = await backend.fromXlsxWorkbook(bytes);
      console.log(JSON.stringify({
        before, afterRangeOnly, readyAfterTemporary, instances, exportBatches,
        importBatches: batches, scalars,
        cell: restored.sheets[0].cells[0].cells[0].value,
        name: restored.workbook.namedRanges.find((named) => named.name === "Plus"),
      }));
    `;
    const process = Bun.spawn([Bun.which("bun") ?? "bun", "--eval", script], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
    expect(JSON.parse(stdout)).toEqual({
      before: false,
      afterRangeOnly: false,
      readyAfterTemporary: false,
      instances: 1,
      exportBatches: 1,
      importBatches: 1,
      scalars: 0,
      cell: { kind: "formula", src: "=LET(x,1,x+1)" },
      name: { name: "Plus", formula: "=LAMBDA(v,v+1)" },
    });
  });

  it("keeps the root side-effect free and registers every backend idempotently", async () => {
    const store = new SheetwriteStore(workbook());
    const snapshot = workbook_snapshot();
    const table_export_backend: XlsxTableExportBackend = {
      name: "root-side-effect-tripwire-export",
      toXlsxTable: async () => new Uint8Array([1]),
    };
    const table_import_backend: XlsxTableImportBackend = {
      name: "root-side-effect-tripwire-import",
      fromXlsxTable: async () => ({ rowCount: 0, columns: {} }),
    };
    const workbook_backend: XlsxWorkbookBackend = {
      name: "root-side-effect-tripwire-workbook",
      toXlsxWorkbook: async () => new Uint8Array([2]),
      fromXlsxWorkbook: async () => snapshot,
    };
    setXlsxTableExportBackend(table_export_backend);
    setXlsxTableImportBackend(table_import_backend);
    setXlsxWorkbookBackend(workbook_backend);

    // Dynamic import is the behavior under test: registration must not occur on root load.
    const xlsx = await import("../src/index.js");
    await expect(toXlsxTable(store.getWorkbook(), store)).resolves.toEqual(new Uint8Array([1]));
    await expect(fromXlsxTable(new Uint8Array())).resolves.toEqual({ rowCount: 0, columns: {} });
    await expect(toXlsxWorkbook(snapshot)).resolves.toEqual(new Uint8Array([2]));
    await expect(fromXlsxWorkbook(new Uint8Array())).resolves.toBe(snapshot);

    xlsx.registerXlsxBackends();
    xlsx.registerXlsxBackends();
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 0 },
          value: { kind: "literal", value: "registered" },
        },
      ],
    });
    const table_bytes = await toXlsxTable(store.getWorkbook(), store);
    expect(table_bytes[0]).toBe(0x50);
    expect(await fromXlsxTable(table_bytes)).toEqual({
      rowCount: 1,
      columns: { Value: ["registered"] },
    });
    const workbook_bytes = await toXlsxWorkbook(snapshot);
    expect((await fromXlsxWorkbook(workbook_bytes)).sheets[0]!.cells[0]!.cells[0]!.value).toEqual({
      kind: "literal",
      value: "registered",
    });

    setXlsxTableExportBackend(null as never);
    setXlsxTableImportBackend(null as never);
    setXlsxWorkbookBackend(null as never);
    store.dispose();
  });
});
