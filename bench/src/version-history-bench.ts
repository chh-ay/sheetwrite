import { heapStats } from "bun:jsc";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

import { getEngine } from "../../packages/core/src/engine.js";
import { initSheetwrite } from "../../packages/core/src/grid.js";
import {
  HistoryArchive,
  MemoryHistoryStorage,
  type HistoryCommit,
} from "../../packages/core/src/history-archive.js";
import { releaseEngineMemory } from "../../packages/core/src/index.js";
import type { CellValue } from "../../packages/core/src/types/cell.js";
import type { SnapshotCell, WorkbookSnapshot } from "../../packages/core/src/types/document.js";

const ROWS = 5000;
const COLS = 20;
const TRANSACTIONS = 12_000;
const SESSION_MS = 8 * 60 * 60 * 1000;
const TRANSACTION_BYTES = 512;
const MAX_RETAINED_BYTES = 20 * 1024 * 1024;
const ROOT = resolve(import.meta.dir, "../..");

function observation() {
  const heap = heapStats();
  return {
    rssBytes: process.memoryUsage().rss,
    heapBytes: heap.heapSize,
    heapCapacityBytes: heap.heapCapacity,
    externalBytes: heap.extraMemorySize,
    wasmBytes: getEngine().getMemory().buffer.byteLength,
  };
}

async function collectGarbage(): Promise<void> {
  for (let turn = 0; turn < 3; turn++) {
    const next = Promise.withResolvers<void>();
    setImmediate(next.resolve);
    await next.promise;
    Bun.gc(true);
  }
}

function workbook(): WorkbookSnapshot {
  const cells: SnapshotCell[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const value: CellValue =
        col === COLS - 1
          ? { kind: "formula", src: `=SUM(B${row + 1}:S${row + 1})` }
          : col === 0
            ? { kind: "literal", value: `Account ${row.toString().padStart(5, "0")}` }
            : { kind: "literal", value: ((row * 7919 + col * 104729) % 1_000_000) / 100 };
      cells.push({
        rowOffset: row,
        colOffset: col,
        value,
        ...(col > 0 && col % 5 === 0 ? { style: { numberFormat: "#,##0.00" } } : {}),
      });
    }
  }
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
        columns: Array.from({ length: COLS }, (_, col) => ({
          key: `column-${col}`,
          header: `Period ${col}`,
          type: "number",
          width: 100,
        })),
        cells: [{ startRow: 0, startCol: 0, rowCount: ROWS, colCount: COLS, cells }],
      },
    ],
  };
}

function commit(revision: number, source: WorkbookSnapshot): HistoryCommit {
  const row = (revision * 7919) % ROWS;
  const operations: HistoryCommit["operations"] = [1, 2, 3].map((col) => {
    const value: CellValue = {
      kind: "literal",
      value: ((revision * 104729 + col) % 1_000_000) / 100,
    };
    const cell = source.sheets[0]?.cells[0]?.cells[row * COLS + col];
    if (!cell) throw new Error("Session cell is missing");
    cell.value = value;
    return { op: "set", addr: { sheet: "sales", row, col }, value };
  });
  const entry: HistoryCommit = {
    baseRevision: revision - 1,
    revision,
    mutationId: `session-${revision}`,
    authorId: revision % 2 ? "alice" : "bob",
    time: Math.round((revision * SESSION_MS) / TRANSACTIONS),
    operations,
  };
  const size = new TextEncoder().encode(JSON.stringify(entry)).length;
  assert(size <= TRANSACTION_BYTES, "Session transaction exceeds the declared average");
  entry.mutationId += "-".repeat(TRANSACTION_BYTES - size);
  source.version = revision;
  return entry;
}

async function compressedBundle(entrypoint: string) {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: "browser",
    minify: true,
    external: ["@sheetwrite/wasm"],
  });
  if (!result.success) throw new AggregateError(result.logs, "History bundle probe failed");
  const output = result.outputs[0];
  if (!output) throw new Error("History bundle probe produced no output");
  const bytes = new Uint8Array(await output.arrayBuffer());
  return {
    bytes: bytes.length,
    gzipBytes: gzipSync(bytes).length,
    brotliBytes: brotliCompressSync(bytes).length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function verifyReplay(archive: HistoryArchive, id: string): Promise<void> {
  const snapshot = await archive.readVersion(id);
  assert.equal(snapshot.version, TRANSACTIONS - 1);
}

async function session() {
  await initSheetwrite();
  await collectGarbage();
  const baseline = observation();
  let peak = baseline;
  const source = workbook();
  const snapshotBytes = new TextEncoder().encode(JSON.stringify(source)).length;
  const storage = new MemoryHistoryStorage();
  const archive = await HistoryArchive.open({ documentId: "forecast", storage });
  const started = performance.now();
  await archive.initialize(source, 0);
  let reviewId = "";
  for (let revision = 1; revision <= TRANSACTIONS; revision++) {
    const entry = commit(revision, source);
    await archive.record(entry, () => source);
    if (revision === TRANSACTIONS - 1)
      reviewId = (await archive.saveVersion("Review", "alice", entry.time)).id;
    if (revision % 125 === 0) {
      const current = observation();
      peak = {
        rssBytes: Math.max(peak.rssBytes, current.rssBytes),
        heapBytes: Math.max(peak.heapBytes, current.heapBytes),
        heapCapacityBytes: Math.max(peak.heapCapacityBytes, current.heapCapacityBytes),
        externalBytes: Math.max(peak.externalBytes, current.externalBytes),
        wasmBytes: Math.max(peak.wasmBytes, current.wasmBytes),
      };
    }
  }
  const usage = await archive.storageUsage();
  assert(
    usage.encodedBytes < MAX_RETAINED_BYTES,
    "Eight-hour session exceeds the approved 20 MiB storage target",
  );
  const elapsedMs = performance.now() - started;
  await collectGarbage();
  const retained = observation();
  await verifyReplay(archive, reviewId);
  await collectGarbage();
  const afterReplay = observation();
  return {
    cells: ROWS * COLS,
    transactions: TRANSACTIONS,
    sessionHours: SESSION_MS / 3_600_000,
    encodedTransactionBytes: TRANSACTION_BYTES,
    snapshotBytes,
    usage,
    elapsedMs,
    baseline,
    peak,
    retained,
    afterReplay,
  };
}

// Release is measured after the session frame returns, so no local keeps the archive alive.
const capture = await session();
await collectGarbage();
const afterRelease = observation();
await releaseEngineMemory();
await collectGarbage();
const afterEngineRelease = observation();
const bundles = {
  default: await compressedBundle(resolve(ROOT, "packages/core/src/index.ts")),
  history: await compressedBundle(resolve(ROOT, "packages/core/src/history-archive.ts")),
  browserHistory: await compressedBundle(resolve(ROOT, "packages/core/src/history-indexeddb.ts")),
};
const engines: Record<string, { bytes: number; sha256: string }> = {};
for (const name of ["wasm", "formulas"]) {
  const bytes = await readFile(resolve(ROOT, `packages/${name}/pkg/sheetwrite_wasm_bg.wasm`));
  engines[name] = { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}
process.stdout.write(
  `${JSON.stringify({ platform: process.platform, arch: process.arch, capture: { ...capture, afterRelease, afterEngineRelease }, bundles, engines }, null, 2)}\n`,
);
