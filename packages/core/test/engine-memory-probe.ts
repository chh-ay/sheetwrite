// Each engine is selected once in a fresh process, as in an application.
import assert from "node:assert/strict";

import * as formulas from "@sheetwrite/formulas";
import type { EngineInstance } from "@sheetwrite/wasm";
import * as wasm from "@sheetwrite/wasm";

import { DatasourceController } from "../src/datasource-controller.js";
import { getEngine } from "../src/engine.js";
import { initSheetwrite } from "../src/grid.js";
import { releaseEngineMemory } from "../src/index.js";
import { SheetwriteStore } from "../src/store.js";
import type { DataSourcePage, DocumentOp } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

const engine_name = process.argv[2];
if (engine_name !== "wasm" && engine_name !== "formulas")
  throw new Error("Expected an engine name");

const provider = engine_name === "formulas" ? formulas : wasm;
let fail_import_at: number | undefined;
let grow_candidate = false;
let candidate_created: PromiseWithResolvers<void> | undefined;
const NativeInstance = WebAssembly.Instance;
let instances_created = 0;

WebAssembly.Instance = class extends NativeInstance {
  constructor(module: WebAssembly.Module, imports?: WebAssembly.Imports) {
    super(module, imports);
    instances_created += 1;
  }
};

await initSheetwrite({
  engine: {
    ...provider,
    async createEngine(source): Promise<EngineInstance> {
      const instance = await provider.createEngine(source);
      if (grow_candidate) instance.getMemory().grow(128);

      const import_store = instance.CellStore.importMemoryState;
      let imported_stores = 0;
      instance.CellStore.importMemoryState = (bytes: Uint8Array) => {
        imported_stores += 1;
        if (imported_stores === fail_import_at)
          return import_store(bytes.subarray(0, bytes.byteLength - 1));
        return import_store(bytes);
      };

      candidate_created?.resolve();
      return instance;
    },
  },
});

assert.equal(instances_created, 1, "Core boot must not eagerly instantiate the public singleton");

if (engine_name === "formulas") assert.ok(formulas.functionNames().includes("GROUPBY"));

const public_store = new provider.CellStore();
public_store.free();
assert.equal(instances_created, 2, "Published exports must share one lazily initialized instance");
WebAssembly.Instance = NativeInstance;

const dense = new SheetwriteStore(makeWorkbook(8));
const paged_workbook = makeWorkbook(1_000_000);
const paged = new SheetwriteStore(paged_workbook, undefined, { storage: "paged", chunkRows: 4 });
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

const dense_before = dense.exportSnapshot();
const stats_before = dense.getRangeMutationAllocationStats();
const previous_memory = getEngine().getMemory();
let changes = 0;
const stop_dense = dense.on("change", () => {
  changes += 1;
});
const stop_paged = paged.on("change", () => {
  changes += 1;
});

/** A discarded release leaves the engine, both stores and their events untouched. */
function assert_unchanged(): void {
  assert.equal(getEngine().getMemory(), previous_memory);
  assert.deepEqual(dense.exportSnapshot(), dense_before);
  assert.deepEqual(dense.getRangeMutationAllocationStats(), stats_before);
  assert.equal(paged.getCell(address).resolved, "unsaved");
  assert.equal(paged.getCellLoadState(address), "local-edit");
  assert.equal(changes, 0);
}

try {
  grow_candidate = true;
  const skipped = await releaseEngineMemory();
  assert.equal(skipped.stores, 0, "A larger replacement must be discarded atomically");
  assert.equal(skipped.wasmBytesAfter, skipped.wasmBytesBefore);
  assert_unchanged();
  grow_candidate = false;

  fail_import_at = 2;
  await assert.rejects(releaseEngineMemory(), /live stores are unchanged/);
  assert_unchanged();

  fail_import_at = undefined;
  await releaseEngineMemory();
  assert.deepEqual(dense.exportSnapshot(), dense_before);
  assert.equal(paged.getCell(address).resolved, "unsaved");
  // A paged store keeps taking edits after the cutover (its dirty preflight follows the new instance).
  const after_release = { sheet: "s1", row: 1, col: 0 };
  paged.applyTransaction({
    patches: [
      { op: "set", addr: after_release, value: { kind: "literal", value: "after release" } },
    ],
  });
  assert.equal(paged.getCell(after_release).resolved, "after release");

  dense.applyTransaction({ patches: [{ op: "clearRange", range, contents: true, style: true }] });
  dense.applyTransaction({ patches: [history.toDocumentOp(range)] });
  assert.equal(dense.getCell(address).resolved, "survives");
  assert.deepEqual(dense.getCell(address).style, { italic: true });

  const page = Promise.withResolvers<DataSourcePage>();
  const errors: unknown[] = [];
  const memory_before_load = getEngine().getMemory();
  const controller = new DatasourceController(
    {
      loadable: paged,
      activeSheet: () => "s1",
      rowCount: () => 1_000_000,
      columns: () => {
        const sheet = paged_workbook.sheets[0];
        if (!sheet) throw new Error("Expected paged metadata");

        return sheet.columns;
      },
      revision: () => 0,
      isCellNewerThan: () => false,
      retainRevision: () => () => {},
      onRowsLoaded: () => {
        assert.equal(getEngine().getMemory(), memory_before_load);
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
    candidate_created = Promise.withResolvers<void>();
    let settled = false;
    const release = releaseEngineMemory().then((report) => {
      settled = true;
      return report;
    });
    await candidate_created.promise;

    // Drain instantiation microtasks so only the datasource request can block cutover.
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(getEngine().getMemory(), memory_before_load);

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
} finally {
  stop_dense();
  stop_paged();
  history.dispose();
  dense.dispose();
  paged.dispose();
}

await releaseEngineMemory();

const million_rows = 1_000_000;
const empty = new SheetwriteStore(makeWorkbook(million_rows));
let fresh_store_bytes: number;

try {
  const report = await releaseEngineMemory();
  assert.ok(
    report.wasmBytesAfter <= report.wasmBytesBefore,
    "Empty dense release must not grow memory",
  );
  fresh_store_bytes = report.wasmBytesBefore;
} finally {
  empty.dispose();
}

const source = {
  rowCount: million_rows,
  columns: { amount: new Float64Array(million_rows).fill(17) },
};
const entire_sheet = {
  sheet: "s1",
  start: { row: 0, col: 0 },
  end: { row: million_rows - 1, col: 2 },
};

for (const keep_history of [false, true]) {
  await releaseEngineMemory();
  const store = new SheetwriteStore(makeWorkbook(million_rows), source);
  const retained = keep_history ? store.captureRangeHistory(entire_sheet) : null;

  try {
    store.applyTransaction({
      patches: [
        {
          op: "clearRange",
          range: { ...entire_sheet, start: { row: keep_history ? 0 : 10, col: 0 } },
          contents: true,
          style: true,
        },
      ],
    });

    const report = await releaseEngineMemory();
    const fresh_floor = fresh_store_bytes + (retained?.byteLength ?? 0);
    assert.ok(report.wasmBytesAfter <= report.wasmBytesBefore, "Release must not grow memory");
    assert.ok(
      report.wasmBytesAfter <= fresh_floor * 1.1,
      "Import must stay near the fresh allocation floor",
    );

    if (retained) {
      assert.equal(store.getCell({ sheet: "s1", row: million_rows - 1, col: 1 }).resolved, null);
      assert.equal(store.getRangeMutationAllocationStats().historyMaterializations, 0);
    } else {
      assert.equal(store.getCell({ sheet: "s1", row: 9, col: 1 }).resolved, 17);
      assert.equal(store.getCell({ sheet: "s1", row: 10, col: 1 }).resolved, null);
    }
  } finally {
    retained?.dispose();
    store.dispose();
  }
}

process.stdout.write(
  `${JSON.stringify({ engine: engine_name, atomic: true, waitedForPage: true })}\n`,
);
