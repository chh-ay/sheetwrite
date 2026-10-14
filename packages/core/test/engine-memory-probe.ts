// Each engine is selected once in a fresh process, as in an application.
import assert from "node:assert/strict";
import * as formulas from "@sheetwrite/formulas";
import * as wasm from "@sheetwrite/wasm";
import type { EngineInstance } from "@sheetwrite/wasm";
import { DatasourceController } from "../src/datasource-controller.js";
import { releaseEngineMemory } from "../src/engine-memory.js";
import { getEngine } from "../src/engine.js";
import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { DataSourcePage, DocumentOp } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

const engineName = process.argv[2];
if (engineName !== "wasm" && engineName !== "formulas") throw new Error("Expected an engine name");
const provider = engineName === "formulas" ? formulas : wasm;
let failImportAt: number | undefined;
let candidateCreated: PromiseWithResolvers<void> | undefined;
await initSheetwrite(undefined, {
  ...provider,
  async createEngine(source): Promise<EngineInstance> {
    const instance = await provider.createEngine(source);
    const importStore = instance.CellStore.importMemoryState;
    let importedStores = 0;
    instance.CellStore.importMemoryState = (bytes: Uint8Array) => {
      importedStores += 1;
      if (importedStores === failImportAt)
        return importStore(bytes.subarray(0, bytes.byteLength - 1));
      return importStore(bytes);
    };
    candidateCreated?.resolve();
    return instance;
  },
});

const dense = new SheetwriteStore(makeWorkbook(8));
const pagedWorkbook = makeWorkbook(1_000_000);
const paged = new SheetwriteStore(pagedWorkbook, undefined, { storage: "paged", chunkRows: 4 });
const address = { sheet: "s1", row: 0, col: 0 };
const range = { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 7, col: 2 } };
dense.applyTransaction({
  patches: [
    {
      op: "set",
      addr: address,
      value: { kind: "literal", value: "survives" },
      style: { italic: true },
    },
    { op: "set", addr: { ...address, col: 1 }, value: { kind: "formula", src: "=NOW()" } },
  ],
});
const history = dense.captureRangeHistory(range);
if (!history) throw new Error("Expected compact history");
const edit: DocumentOp = { op: "set", addr: address, value: { kind: "literal", value: "unsaved" } };
paged.applyTransaction({ patches: [edit] });
const denseBefore = dense.exportSnapshot();
const statsBefore = dense.getRangeMutationAllocationStats();
const previousMemory = getEngine().getMemory();
let changes = 0;
const stopDense = dense.on("change", () => {
  changes += 1;
});
const stopPaged = paged.on("change", () => {
  changes += 1;
});

try {
  failImportAt = 2;
  await assert.rejects(releaseEngineMemory(), /live stores are unchanged/);
  assert.equal(getEngine().getMemory(), previousMemory);
  assert.deepEqual(dense.exportSnapshot(), denseBefore);
  assert.deepEqual(dense.getRangeMutationAllocationStats(), statsBefore);
  assert.equal(paged.getCell(address).resolved, "unsaved");
  assert.equal(paged.getCellLoadState(address), "local-edit");
  assert.equal(changes, 0);
  failImportAt = undefined;
  await releaseEngineMemory();
  assert.deepEqual(dense.exportSnapshot(), denseBefore);
  assert.equal(paged.getCell(address).resolved, "unsaved");
  dense.applyTransaction({ patches: [{ op: "clearRange", range, contents: true, style: true }] });
  dense.applyTransaction({ patches: [history.toDocumentOp(range)] });
  assert.equal(dense.getCell(address).resolved, "survives");
  assert.deepEqual(dense.getCell(address).style, { italic: true });

  const page = Promise.withResolvers<DataSourcePage>();
  const errors: unknown[] = [];
  const memoryBeforeLoad = getEngine().getMemory();
  const controller = new DatasourceController(
    {
      loadable: paged,
      activeSheet: () => "s1",
      rowCount: () => 1_000_000,
      columns: () => {
        const sheet = pagedWorkbook.sheets[0];
        if (!sheet) throw new Error("Expected paged metadata");
        return sheet.columns;
      },
      revision: () => 0,
      isCellNewerThan: () => false,
      retainRevision: () => () => {},
      onRowsLoaded: () => {
        assert.equal(getEngine().getMemory(), memoryBeforeLoad);
      },
      onError: (_request, error) => errors.push(error),
      datasource: {
        capabilities: { protocol: 2, columns: "windowed" },
        getRows: (request) => {
          return page.promise.then((resolved) => ({ ...resolved, columns: request.columns }));
        },
      },
    },
    1_000_000,
  );
  try {
    controller.ensureLoaded(4, 5, [0]);
    candidateCreated = Promise.withResolvers<void>();
    let settled = false;
    const release = releaseEngineMemory().then((report) => {
      settled = true;
      return report;
    });
    await candidateCreated.promise;
    // Instantiation has completed; only the active datasource request can block cutover.
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(getEngine().getMemory(), memoryBeforeLoad);
    page.resolve({
      protocol: 2,
      start: 4,
      columns: [],
      rows: [{ name: "arrived before cutover" }],
    });
    await release;
    assert.equal(paged.getCell({ ...address, row: 4 }).resolved, "arrived before cutover");
    assert.equal(paged.getCell(address).resolved, "unsaved");
    assert.deepEqual(errors, []);
  } finally {
    controller.destroy();
  }
  process.stdout.write(
    `${JSON.stringify({ engine: engineName, atomic: true, waitedForPage: true })}\n`,
  );
} finally {
  stopDense();
  stopPaged();
  history.dispose();
  dense.dispose();
  paged.dispose();
}
