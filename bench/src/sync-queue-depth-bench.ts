/**
 * Offline sync queue depth benchmark.
 *
 * Queues N offline commits through a mounted Grid and a SyncCoordinator that
 * never sends, then times single local commits on top of that queue. A commit
 * should cost the same at any queue depth; growth with depth means some step
 * of the commit, state, or send path still walks the whole queue.
 *
 * Every depth validates the queue afterwards (commit count, base-version
 * chain, unique mutation IDs, last value), so a broken run fails instead of
 * reporting a number.
 *
 * Each depth runs in its own process, so `maxRssMiB` is that depth's peak
 * resident memory. `retainedHeapMiB` is the JS heap the queued commits keep
 * alive (pending records plus the Grid's own history of them), after a full GC.
 *
 * Timing: `bun run src/sync-queue-depth-bench.ts [--depths 0,1000,5000,10000]`.
 * Prints one JSON line per depth: median and p95 per commit, and memory.
 */
import "./dom-setup.js";
import { fullGC, heapStats } from "bun:jsc";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  type CellAddress,
  type Column,
  createGrid,
  type Grid,
  initSheetwrite,
  MemoryPersistenceAdapter,
  SyncCoordinator,
  type WorkbookSnapshot,
} from "../../packages/core/src/index.js";
import { installCanvasTestStubs } from "../../packages/core/src/testing.js";
import { optionValue } from "./cli-options.js";
import { collect, forceGc, summarize } from "./stats.js";

const WASM_PATH = new URL("../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url);
const BYTES_PER_MIB = 1024 * 1024;
const KIB_PER_MIB = 1024;

const SHEET = "s1";
const DOCUMENT_ID = "sync-queue-depth-bench";
const DEFAULT_DEPTHS = [0, 1_000, 5_000, 10_000] as const;
/** Rows written in turn, so each commit is a small single-cell change. */
const COMMIT_ROWS = 64;
const COLUMNS: Column[] = [{ key: "c0", header: "C0", type: "number", width: 80 }];
const WARMUP_COMMITS = 20;
const TIMED_COMMITS = 101;
/** Queue depth of the discarded first run; deep enough to compile the commit path. */
const JIT_WARMUP_DEPTH = 1_000;
/** Room for the deepest queue plus every warm-up and timed commit. */
const PENDING_HEADROOM = WARMUP_COMMITS + TIMED_COMMITS;

interface DepthResult {
  readonly depth: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly samples: number;
  readonly retainedHeapMiB: number;
  readonly maxRssMiB: number;
}

function fail(message: string): never {
  throw new Error(`sync-queue-depth: ${message}`);
}

function parseDepths(argv: readonly string[]): readonly number[] {
  const value = optionValue(argv, "--depths");
  if (value === undefined) return DEFAULT_DEPTHS;
  return value.split(",").map((part) => {
    const depth = Number(part);
    if (!Number.isInteger(depth) || depth < 0) fail(`invalid depth ${part}`);
    return depth;
  });
}

function cellAddress(row: number): CellAddress {
  return { sheet: SHEET, row, col: 0 };
}

function snapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: DOCUMENT_ID,
    version: 0,
    workbook: { activeSheet: SHEET },
    sheets: [
      { id: SHEET, name: "Queue", order: 0, rowCount: COMMIT_ROWS, columns: COLUMNS, cells: [] },
    ],
  };
}

/** Commit number `commit` writes its own number, so the last value names the last commit. */
function commitOne(grid: Grid, commit: number): void {
  const result = grid.applyTransaction({
    patches: [
      {
        op: "set",
        addr: cellAddress(commit % COMMIT_ROWS),
        value: { kind: "literal", value: commit },
      },
    ],
  });
  if (result.status !== "applied") fail(`commit ${commit} was ${result.status}`);
}

function validateQueue(coordinator: SyncCoordinator, expected: number): void {
  if (coordinator.pendingCount !== expected) {
    fail(`queue holds ${coordinator.pendingCount} commits, expected ${expected}`);
  }
  const { activity } = coordinator.state;
  if (activity !== "pending") fail(`queue activity is ${activity}`);
  const records = coordinator.pendingCommits();
  const ids = new Set<string>();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record === undefined) fail(`queue lost record ${index}`);
    if (record.baseVersion !== index) {
      fail(`record ${index} has base version ${record.baseVersion}`);
    }
    if (record.status !== "pending") fail(`record ${index} is ${record.status}`);
    ids.add(record.clientMutationId);
  }
  if (ids.size !== expected) fail("queue reused a mutation identity");
  const lastOperation = records[records.length - 1]?.operations[0];
  if (
    lastOperation?.op !== "set" ||
    lastOperation.value.kind !== "literal" ||
    lastOperation.value.value !== expected - 1
  ) {
    fail("queue does not carry the last committed value");
  }
}

function collectGarbage(): void {
  forceGc();
  fullGC();
}

function measureDepth(depth: number): Omit<DepthResult, "maxRssMiB"> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGrid(host, {
    workbook: {
      activeSheet: SHEET,
      sheets: [{ id: SHEET, name: "Queue", rowCount: COMMIT_ROWS, columns: COLUMNS }],
    },
    config: { toolbar: false, find: false, contextMenu: false },
  });
  const coordinator = new SyncCoordinator(grid, new MemoryPersistenceAdapter(snapshot()), {
    documentId: DOCUMENT_ID,
    serverVersion: 0,
    initialConnection: "offline",
    limits: { maxPendingCommits: depth + PENDING_HEADROOM },
  });
  try {
    collectGarbage();
    const heapBefore = heapStats().heapSize;
    let commit = 0;
    while (commit < depth) commitOne(grid, commit++);
    const samplesMs = collect(() => commitOne(grid, commit++), {
      warmup: WARMUP_COMMITS,
      iters: TIMED_COMMITS,
    });
    validateQueue(coordinator, commit);
    collectGarbage();
    const retainedHeapMiB = (heapStats().heapSize - heapBefore) / BYTES_PER_MIB;
    const stat = summarize(samplesMs);
    return {
      depth,
      medianMs: stat.median,
      p95Ms: stat.p95,
      samples: stat.iters,
      retainedHeapMiB,
    };
  } finally {
    coordinator.destroy();
    grid.destroy();
    host.remove();
  }
}

async function runWorker(depth: number): Promise<DepthResult> {
  await initSheetwrite(readFileSync(WASM_PATH));
  const restoreCanvas = installCanvasTestStubs();
  try {
    // The first Grid and coordinator in a process run cold code; discard them so
    // every depth is measured against an equally warm JIT.
    measureDepth(JIT_WARMUP_DEPTH);
    const result = measureDepth(depth);
    return { ...result, maxRssMiB: process.resourceUsage().maxRSS / KIB_PER_MIB };
  } finally {
    restoreCanvas();
  }
}

function spawnWorker(depth: number): string {
  const child = Bun.spawnSync({
    cmd: [process.execPath, fileURLToPath(import.meta.url), "--worker", String(depth)],
    stdout: "pipe",
    stderr: "pipe",
  });
  if (child.exitCode !== 0) {
    fail(`depth ${depth} worker failed: ${child.stderr.toString() || child.stdout.toString()}`);
  }
  return child.stdout.toString();
}

const argv = process.argv.slice(2);
const worker = optionValue(argv, "--worker");
if (worker !== undefined) {
  const depth = Number(worker);
  process.stdout.write(`${JSON.stringify(await runWorker(depth))}\n`);
} else {
  for (const depth of parseDepths(argv)) process.stdout.write(spawnWorker(depth));
}
