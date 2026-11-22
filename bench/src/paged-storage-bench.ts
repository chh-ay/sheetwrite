/**
 * Paged storage operations: local edits, their acknowledgement, clean-page
 * eviction and range reads through formulas. One engine per process; each
 * sample uses a fresh store, and setup stays outside the timed interval.
 *
 *   bun run src/paged-storage-bench.ts [--engine wasm|formulas] [--samples N] [--output path]
 */
import * as formulas from "@sheetwrite/formulas";
import * as wasm from "@sheetwrite/wasm";

import { getEngine } from "../../packages/core/src/engine.js";
import {
  type DocumentOp,
  initSheetwrite,
  type RowData,
  SheetwriteStore,
  type Workbook,
} from "../../packages/core/src/index.js";
import { optionValue } from "./cli-options.js";
import { now, type Stat, summarize } from "./stats.js";

const ROWS = 1_000_000;
const COLUMNS = 5;
const CHUNK_ROWS = 4096;
const CACHE_BYTES = 32 * 1024 * 1024;
const DEFAULT_SAMPLES = 12;
const WARMUP_SAMPLES = 2;

/** Scattered local edits: 10,000 cells spread over the whole sheet. */
const EDIT_CELLS = 10_000;
/** Eviction: 4-row pages through a cache that holds 512 of them. */
const EVICTION_CHUNK_ROWS = 4;
const EVICTION_PAGES = 8192;
const EVICTION_RETAINED_PAGES = 512;
/** Range read: 100,000 loaded rows by 5 columns, with scattered edits inside. */
const RANGE_ROWS = 100_000;
const RANGE_DIRTY_CELLS = 1_000;
const LOAD_PAGE_ROWS = 4096;

export const PAGED_STORAGE_CASES = ["edit", "acknowledge", "eviction", "range-read"] as const;
export type PagedStorageCase = (typeof PAGED_STORAGE_CASES)[number];

export interface PagedStorageCaseResult {
  readonly samplesMs: readonly number[];
  readonly stat: Stat;
  /** Engine-reported allocated bytes after the last sample's operation. */
  readonly retainedBytes: number;
  /** WASM linear memory after the last sample, a peak bound for the process. */
  readonly wasmCommittedBytes: number;
}

export interface PagedStorageResult {
  readonly engine: "wasm" | "formulas";
  readonly samples: number;
  readonly cases: Readonly<Record<PagedStorageCase, PagedStorageCaseResult>>;
}

function workbook(row_count: number): Workbook {
  return {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "paged",
        rowCount: row_count,
        columns: Array.from({ length: COLUMNS }, (_, col) => ({
          key: `c${col}`,
          header: `Column ${col + 1}`,
          width: 120,
          type: "number",
        })),
      },
    ],
  };
}

function paged_store(chunk_rows: number, cache_bytes: number): SheetwriteStore {
  return new SheetwriteStore(workbook(ROWS), undefined, {
    storage: "paged",
    chunkRows: chunk_rows,
    cacheBytes: cache_bytes,
  });
}

function row_data(start: number, count: number): RowData[] {
  return Array.from({ length: count }, (_, offset) => {
    const row = start + offset;
    return { c0: row, c1: row + 1, c2: row + 2, c3: row + 3, c4: row + 4 };
  });
}

const COLUMN_BANDS = [
  { start: 0, end: COLUMNS, keys: Array.from({ length: COLUMNS }, (_, col) => `c${col}`) },
];

function load_rows(store: SheetwriteStore, pages: ReadonlyArray<readonly RowData[]>, rows: number) {
  for (const [page, data] of pages.entries()) {
    store.loadPage("s1", page * rows, COLUMN_BANDS, data);
  }
}

/** `count` literal edits spread evenly over `rows` rows and every column. */
function scattered_edits(count: number, rows: number, value: number): DocumentOp[] {
  return Array.from({ length: count }, (_, index) => ({
    op: "set",
    addr: { sheet: "s1", row: Math.floor((index * rows) / count), col: index % COLUMNS },
    value: { kind: "literal", value: value + index },
  }));
}

function retained_bytes(store: SheetwriteStore): number {
  return store.getRuntimeResourceSnapshot("edit", "settled").wasm.allocatedCapacityBytes;
}

function apply_all(store: SheetwriteStore, patches: DocumentOp[]): void {
  const outcome = store.applyTransaction({ patches });
  if (outcome.status !== "applied") throw new Error(`paged edit was ${outcome.status}`);
}

interface Sample {
  readonly ms: number;
  readonly retainedBytes: number;
}

function edit_sample(): Sample {
  const store = paged_store(CHUNK_ROWS, CACHE_BYTES);
  const patches = scattered_edits(EDIT_CELLS, ROWS, 1);

  const started = now();
  apply_all(store, patches);
  const ms = now() - started;

  if (store.getPagedStats("s1").dirtyCells !== EDIT_CELLS) throw new Error("edits were not kept");
  const bytes = retained_bytes(store);
  store.dispose();
  return { ms, retainedBytes: bytes };
}

function acknowledge_sample(): Sample {
  const store = paged_store(CHUNK_ROWS, CACHE_BYTES);
  const patches = scattered_edits(EDIT_CELLS, ROWS, 1);
  apply_all(store, patches);

  const started = now();
  store.acknowledgeOperations(patches);
  const ms = now() - started;

  if (store.getPagedStats("s1").dirtyCells !== 0) throw new Error("acknowledgement left edits");
  const bytes = retained_bytes(store);
  store.dispose();
  return { ms, retainedBytes: bytes };
}

const eviction_pages = Array.from({ length: EVICTION_PAGES }, (_, page) =>
  row_data(page * EVICTION_CHUNK_ROWS, EVICTION_CHUNK_ROWS),
);
const eviction_page_bytes =
  EVICTION_CHUNK_ROWS * (1 + Float64Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT) +
  BigUint64Array.BYTES_PER_ELEMENT;

function eviction_sample(): Sample {
  const store = paged_store(EVICTION_CHUNK_ROWS, EVICTION_RETAINED_PAGES * eviction_page_bytes);
  apply_all(store, scattered_edits(EDIT_CELLS, ROWS, 1));

  const started = now();
  load_rows(store, eviction_pages, EVICTION_CHUNK_ROWS);
  const ms = now() - started;

  const stats = store.getPagedStats("s1");
  if (stats.chunks !== EVICTION_RETAINED_PAGES) {
    throw new Error(`eviction kept ${stats.chunks} pages`);
  }
  const bytes = retained_bytes(store);
  store.dispose();
  return { ms, retainedBytes: bytes };
}

const range_pages = Array.from({ length: Math.ceil(RANGE_ROWS / LOAD_PAGE_ROWS) }, (_, page) =>
  row_data(page * LOAD_PAGE_ROWS, Math.min(LOAD_PAGE_ROWS, RANGE_ROWS - page * LOAD_PAGE_ROWS)),
);
const RANGE_FORMULAS = [
  `=SUM(A1:E${RANGE_ROWS})`,
  `=SUMIF(A1:E${RANGE_ROWS},">50000")`,
  `=COUNTIFS(A1:A${RANGE_ROWS},">10",B1:B${RANGE_ROWS},"<90000")`,
];
const FORMULA_ROW = RANGE_ROWS + 1;

function range_read_sample(): Sample {
  const store = paged_store(CHUNK_ROWS, CACHE_BYTES);
  load_rows(store, range_pages, LOAD_PAGE_ROWS);
  apply_all(store, scattered_edits(RANGE_DIRTY_CELLS, RANGE_ROWS, 7));
  apply_all(
    store,
    RANGE_FORMULAS.map((src, col) => ({
      op: "set",
      addr: { sheet: "s1", row: FORMULA_ROW, col },
      value: { kind: "formula", src },
    })),
  );
  const before = store.getCell({ sheet: "s1", row: FORMULA_ROW, col: 0 }).resolved;

  // One source edit inside the range recalculates every formula over it.
  const started = now();
  apply_all(store, [
    { op: "set", addr: { sheet: "s1", row: 1, col: 1 }, value: { kind: "literal", value: 1e6 } },
  ]);
  const after = store.getCell({ sheet: "s1", row: FORMULA_ROW, col: 0 }).resolved;
  const ms = now() - started;

  if (typeof before !== "number" || typeof after !== "number" || after === before) {
    throw new Error("range formulas did not recalculate");
  }
  const bytes = retained_bytes(store);
  store.dispose();
  return { ms, retainedBytes: bytes };
}

const SAMPLERS: Readonly<Record<PagedStorageCase, () => Sample>> = {
  edit: edit_sample,
  acknowledge: acknowledge_sample,
  eviction: eviction_sample,
  "range-read": range_read_sample,
};

function measure(sampler: () => Sample, samples: number): PagedStorageCaseResult {
  for (let warmup = 0; warmup < WARMUP_SAMPLES; warmup++) sampler();

  const samples_ms: number[] = [];
  let last: Sample | undefined;
  for (let sample = 0; sample < samples; sample++) {
    Bun.gc(true);
    last = sampler();
    samples_ms.push(last.ms);
  }

  if (!last) throw new Error("paged storage bench needs at least one sample");
  return {
    samplesMs: samples_ms,
    stat: summarize(samples_ms),
    retainedBytes: last.retainedBytes,
    wasmCommittedBytes: getEngine().getMemory().buffer.byteLength,
  };
}

export async function runPagedStorageBench(
  engine: "wasm" | "formulas",
  samples: number,
): Promise<PagedStorageResult> {
  await initSheetwrite({ engine: engine === "formulas" ? formulas : wasm });

  const cases = Object.fromEntries(
    PAGED_STORAGE_CASES.map((name) => [name, measure(SAMPLERS[name], samples)]),
  ) as Record<PagedStorageCase, PagedStorageCaseResult>;
  return { engine, samples, cases };
}

if (import.meta.main) {
  const engine = optionValue(process.argv, "--engine") ?? "wasm";
  if (engine !== "wasm" && engine !== "formulas") throw new Error("--engine is wasm or formulas");

  const samples = Number(optionValue(process.argv, "--samples") ?? DEFAULT_SAMPLES);
  if (!Number.isInteger(samples) || samples <= 0)
    throw new Error("--samples is a positive integer");

  const result = await runPagedStorageBench(engine, samples);
  const output_path = optionValue(process.argv, "--output");
  if (output_path !== undefined)
    await Bun.write(output_path, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`| ${engine} case | median ms | p95 ms | retained MiB |`);
  console.log("|---|---:|---:|---:|");
  for (const name of PAGED_STORAGE_CASES) {
    const { stat, retainedBytes: bytes } = result.cases[name];
    const mib = (bytes / 1024 / 1024).toFixed(2);
    console.log(`| ${name} | ${stat.median.toFixed(3)} | ${stat.p95.toFixed(3)} | ${mib} |`);
  }
}
