// Eight-hour history session: retained storage, memory, replay and engine-instance
// cost, restore and diff time, plus incremental bundle and diff kernel sizes. Usage:
//   bun bench/src/version-history-bench.ts [--base <develop checkout>]
// With --base, the default entry of that checkout is measured for comparison.
import { heapStats } from "bun:jsc";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { brotliCompressSync, gzipSync } from "node:zlib";

import { getEngine, prepareEngineInstance } from "../../packages/core/src/engine.js";
import { initSheetwrite } from "../../packages/core/src/grid.js";
import {
  HistoryArchive,
  type HistoryRestoreScope,
  MemoryHistoryStorage,
} from "../../packages/core/src/history-archive.js";
import type { CellValue } from "../../packages/core/src/types/cell.js";
import type { SnapshotCell, WorkbookSnapshot } from "../../packages/core/src/types/document.js";
import type { Grid } from "../../packages/core/src/types/grid.js";
import type { CommittedTransaction } from "../../packages/core/src/types/transaction.js";
import { median } from "./stats.js";

const ROWS = 5000;
const COLS = 20;
const TRANSACTIONS = 12_000;
const SESSION_MS = 8 * 60 * 60 * 1000;
const TRANSACTION_BYTES = 512;

/** Retained-storage target for this session, recorded in #228. */
const MAX_RETAINED_BYTES = 20 * 1024 * 1024;

/** Peak memory is sampled every this many transactions. */
const SAMPLE_EVERY = 125;

const INSTANCE_SAMPLES = 21;
const REPLAY_SAMPLES = 5;
const GC_TURNS = 3;

const ROOT = resolve(import.meta.dir, "../..");

const { values: options } = parseArgs({ options: { base: { type: "string" } } });

/** Process memory counters; `wasmBytes` is the document engine's linear memory. */
interface Observation {
  rssBytes: number;
  heapBytes: number;
  externalBytes: number;
  wasmBytes: number;
}

function observation(): Observation {
  const heap = heapStats();

  return {
    rssBytes: process.memoryUsage().rss,
    heapBytes: heap.heapSize,
    externalBytes: heap.extraMemorySize,
    wasmBytes: getEngine().getMemory().buffer.byteLength,
  };
}

function maximum(left: Observation, right: Observation): Observation {
  return {
    rssBytes: Math.max(left.rssBytes, right.rssBytes),
    heapBytes: Math.max(left.heapBytes, right.heapBytes),
    externalBytes: Math.max(left.externalBytes, right.externalBytes),
    wasmBytes: Math.max(left.wasmBytes, right.wasmBytes),
  };
}

async function collectGarbage(): Promise<void> {
  for (let turn = 0; turn < GC_TURNS; turn++) {
    const next = Promise.withResolvers<void>();
    setImmediate(next.resolve);
    await next.promise;
    Bun.gc(true);
  }
}

function cellValue(row: number, col: number): CellValue {
  if (col === COLS - 1) {
    return { kind: "formula", src: `=SUM(B${row + 1}:S${row + 1})` };
  }

  if (col === 0) {
    return { kind: "literal", value: `Account ${row.toString().padStart(5, "0")}` };
  }

  return { kind: "literal", value: ((row * 7919 + col * 104729) % 1_000_000) / 100 };
}

/** 100,000 cells: text keys, numbers with a style on every fifth column, and row formulas. */
function workbook(): WorkbookSnapshot {
  const cells: SnapshotCell[] = [];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const styled = col > 0 && col % 5 === 0;
      cells.push({
        rowOffset: row,
        colOffset: col,
        value: cellValue(row, col),
        ...(styled ? { style: { numberFormat: "#,##0.00" } } : {}),
      });
    }
  }

  const columns = Array.from({ length: COLS }, (_, col) => ({
    key: `column-${col}`,
    header: `Period ${col}`,
    type: "number" as const,
    width: 100,
  }));

  return {
    schemaVersion: 1,
    documentId: "forecast",
    version: 0,
    workbook: { activeSheet: "sales" },
    sheets: [
      {
        id: "sales",
        name: "Forecast",
        order: 0,
        rowCount: ROWS,
        columns,
        cells: [{ startRow: 0, startCol: 0, rowCount: ROWS, colCount: COLS, cells }],
      },
    ],
  };
}

/** One three-cell edit, padded to exactly 512 encoded bytes, applied to `source` too. */
function commit(revision: number, source: WorkbookSnapshot): CommittedTransaction {
  const row = (revision * 7919) % ROWS;

  const operations: CommittedTransaction["operations"] = [1, 2, 3].map((col) => {
    const value: CellValue = {
      kind: "literal",
      value: ((revision * 104729 + col) % 1_000_000) / 100,
    };

    const cell = source.sheets[0]?.cells[0]?.cells[row * COLS + col];
    if (!cell) {
      throw new Error("Session cell is missing");
    }

    cell.value = value;
    return { op: "set", addr: { sheet: "sales", row, col }, value };
  });

  const entry: CommittedTransaction = {
    baseRevision: revision - 1,
    revision,
    mutationId: `session-${revision}`,
    authorId: revision % 2 ? "alice" : "bob",
    time: Math.round((revision * SESSION_MS) / TRANSACTIONS),
    operations,
  };

  const size = new TextEncoder().encode(JSON.stringify(entry)).length;
  assert(size <= TRANSACTION_BYTES, "Session transaction exceeds the declared size");
  entry.mutationId += "-".repeat(TRANSACTION_BYTES - size);

  source.version = revision;
  return entry;
}

async function instanceStartupMs(): Promise<number> {
  const samples: number[] = [];

  for (let sample = 0; sample < INSTANCE_SAMPLES; sample++) {
    const started = performance.now();
    const instance = await prepareEngineInstance();
    samples.push(performance.now() - started);
    instance.retire();
  }

  return median(samples);
}

async function replayMs(archive: HistoryArchive, id: string): Promise<number> {
  const samples: number[] = [];

  for (let sample = 0; sample < REPLAY_SAMPLES; sample++) {
    const started = performance.now();
    const snapshot = await archive.readVersion(id);
    samples.push(performance.now() - started);

    assert.equal(snapshot.version, TRANSACTIONS - 1);
  }

  return median(samples);
}

async function session() {
  await collectGarbage();
  const baseline = observation();

  const source = workbook();
  const snapshotBytes = new TextEncoder().encode(JSON.stringify(source)).length;
  const archive = await HistoryArchive.open({
    documentId: "forecast",
    storage: new MemoryHistoryStorage(),
  });

  const started = performance.now();
  await archive.initialize(source, 0);

  let peak = baseline;
  let reviewId = "";
  for (let revision = 1; revision <= TRANSACTIONS; revision++) {
    const entry = commit(revision, source);
    await archive.record(entry, () => source);

    if (revision === TRANSACTIONS - 1) {
      reviewId = (await archive.saveVersion("Review", "alice", entry.time)).id;
    }

    if (revision % SAMPLE_EVERY === 0) {
      peak = maximum(peak, observation());
    }
  }

  const recordMs = performance.now() - started;

  const usage = await archive.storageUsage();
  assert(usage.encodedBytes < MAX_RETAINED_BYTES, "Session exceeds the 20 MiB storage target");

  await collectGarbage();
  const retained = observation();

  const readVersionMs = await replayMs(archive, reviewId);
  await collectGarbage();
  const afterReplay = observation();

  return {
    cells: ROWS * COLS,
    transactions: TRANSACTIONS,
    sessionHours: SESSION_MS / 3_600_000,
    encodedTransactionBytes: TRANSACTION_BYTES,
    snapshotBytes,
    usage,
    recordMs,
    readVersionMs,
    baseline,
    peak,
    retained,
    afterReplay,
  };
}

/** Edits recorded before the restore measurement; each changes three cells. */
const RESTORE_TRANSACTIONS = 1_000;

/** Median time to restore one version on a live grid; each sample is undone again. */
async function restoreMs(
  archive: HistoryArchive,
  grid: Grid,
  id: string,
  scope: HistoryRestoreScope,
): Promise<number> {
  const samples: number[] = [];

  for (let sample = 0; sample < REPLAY_SAMPLES; sample++) {
    const started = performance.now();
    const outcome = await archive.restoreVersion(grid, id, scope);
    samples.push(performance.now() - started);

    assert.equal(outcome.status, "applied");
    grid.undo();
  }

  return median(samples);
}

/**
 * First page (1,000 changes) of the diff from the start to the previous
 * version. `firstUse` is the memory that stays after the first diff loads the
 * kernel and compiles its code; `afterSamples` is measured after the timed
 * diffs, so its difference from `firstUse` is what closed diffs keep.
 */
async function diffMs(archive: HistoryArchive, from: string, to: string) {
  await collectGarbage();
  const before = observation();

  await archive.diffVersions({ from, to });
  await collectGarbage();
  const firstUse = observation();

  const samples: number[] = [];
  let changes = 0;

  for (let sample = 0; sample < REPLAY_SAMPLES; sample++) {
    const started = performance.now();
    const page = await archive.diffVersions({ from, to });
    samples.push(performance.now() - started);

    changes = page.cells.flags.length;
  }

  await collectGarbage();
  const afterSamples = observation();

  return { firstPageMs: median(samples), changes, before, firstUse, afterSamples };
}

/**
 * Restore and diff on a live 100,000-cell grid: the whole workbook back to its
 * start (about 3,000 changed cells), one sheet back by one transaction, and the
 * first diff page between those versions.
 */
async function restore() {
  // The DOM is installed only now, so the session measurements above do not include it.
  await import("./dom-setup.js");
  const { createGridFromSnapshot } = await import("../../packages/core/src/persistence.js");
  const { installCanvasTestStubs } = await import("../../packages/core/src/testing.js");
  const restoreCanvas = installCanvasTestStubs();

  const source = workbook();
  const archive = await HistoryArchive.open({
    documentId: "forecast",
    storage: new MemoryHistoryStorage(),
  });
  await archive.initialize(source, 0);
  const start = await archive.saveVersion("Start", "alice", 0);

  let previous = start.id;
  for (let revision = 1; revision <= RESTORE_TRANSACTIONS; revision++) {
    const entry = commit(revision, source);
    await archive.record(entry, () => source);

    if (revision === RESTORE_TRANSACTIONS - 1) {
      previous = (await archive.saveVersion("Previous", "alice", entry.time)).id;
    }
  }

  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGridFromSnapshot(host, source);

  try {
    return {
      transactions: RESTORE_TRANSACTIONS,
      workbookToStartMs: await restoreMs(archive, grid, start.id, { kind: "workbook" }),
      sheetToPreviousMs: await restoreMs(archive, grid, previous, {
        kind: "sheet",
        sheet: "sales",
      }),
      diff: await diffMs(archive, start.id, previous),
    };
  } finally {
    grid.destroy();
    restoreCanvas();
  }
}

/** Minified browser bundle of an entry that re-exports `modules`, with the engine external. */
async function bundle(directory: string, name: string, modules: readonly string[]) {
  const entry = join(directory, `${name}.ts`);
  await writeFile(
    entry,
    modules.map((path) => `export * from ${JSON.stringify(path)};\n`).join(""),
  );

  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    minify: true,
    external: ["@sheetwrite/wasm"],
  });

  if (!result.success) {
    throw new AggregateError(result.logs, `Bundle ${name} failed`);
  }

  const output = result.outputs[0];
  if (!output) {
    throw new Error(`Bundle ${name} produced no output`);
  }

  const bytes = new Uint8Array(await output.arrayBuffer());

  return {
    name,
    bytes: bytes.length,
    gzipBytes: gzipSync(bytes).length,
    brotliBytes: brotliCompressSync(bytes).length,
  };
}

async function bundles() {
  const directory = await mkdtemp(join(tmpdir(), "history-bundle-"));
  const source = (root: string, path: string) => resolve(root, "packages/core/src", path);

  try {
    const rows = [];

    if (options.base !== undefined) {
      rows.push(await bundle(directory, "develop-default", [source(options.base, "index.ts")]));
    }

    rows.push(await bundle(directory, "default", [source(ROOT, "index.ts")]));
    rows.push(
      await bundle(directory, "default-history", [
        source(ROOT, "index.ts"),
        source(ROOT, "history-archive.ts"),
      ]),
    );
    rows.push(
      await bundle(directory, "default-history-browser", [
        source(ROOT, "index.ts"),
        source(ROOT, "history-archive.ts"),
        source(ROOT, "history-indexeddb.ts"),
      ]),
    );

    rows.push(
      await bundle(directory, "history-kernel-loader", [
        resolve(ROOT, "packages/wasm/history.mjs"),
      ]),
    );

    return rows;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function engineHashes() {
  const engines: Record<string, { bytes: number; sha256: string }> = {};

  for (const name of ["wasm", "formulas"]) {
    const bytes = await readFile(resolve(ROOT, `packages/${name}/pkg/sheetwrite_wasm_bg.wasm`));
    engines[name] = {
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }

  return engines;
}

/** The history diff kernel WASM, which loads only when a diff runs. */
async function kernelWasm() {
  const bytes = await readFile(
    resolve(ROOT, "packages/wasm/pkg-history/sheetwrite_history_bg.wasm"),
  );

  return {
    bytes: bytes.length,
    gzipBytes: gzipSync(bytes).length,
    brotliBytes: brotliCompressSync(bytes).length,
  };
}

await initSheetwrite();

const startupMs = await instanceStartupMs();
const capture = await session();

// Measured after the session frame returns, so no local keeps the archive alive.
await collectGarbage();
const afterRelease = observation();

const report = {
  platform: process.platform,
  arch: process.arch,
  instanceStartupMs: startupMs,
  capture: { ...capture, afterRelease },
  restore: await restore(),
  bundles: await bundles(),
  kernel: await kernelWasm(),
  engines: await engineHashes(),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
