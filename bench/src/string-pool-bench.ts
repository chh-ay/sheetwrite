import { readFileSync } from "node:fs";
import type * as WasmModule from "@sheetwrite/wasm";
import type { CellStore as WasmCellStore } from "@sheetwrite/wasm";

const wasmRoot =
  process.env.STRING_POOL_WASM_ROOT ?? new URL("../../packages/wasm/", import.meta.url).pathname;
// The performance protocol selects the unchanged baseline or candidate at runtime.
const { CellStore, load } = (await import(`${wasmRoot}/loader-node.mjs`)) as typeof WasmModule;

const ROWS = 1_000_000;
const BATCH = 10_000;
const EDITS = 100_000;
const SAMPLES = 7;
const mode = process.env.STRING_POOL_BENCH_MODE ?? "controls";
await load(readFileSync(`${wasmRoot}/pkg/sheetwrite_wasm_bg.wasm`));
function median(values: number[]): number {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
function measure(operation: () => void): number {
  const start = performance.now();
  operation();
  return performance.now() - start;
}
function ingest(store: WasmCellStore, sheet: number, distinct: boolean): void {
  for (let start = 0; start < ROWS; start += BATCH) {
    store.setColumnStrings(
      sheet,
      0,
      start,
      Array.from({ length: BATCH }, (_, offset) =>
        distinct ? `distinct-${start + offset}` : `category-${offset % 100}`,
      ),
      0,
    );
  }
}
function controls() {
  const samples: Record<string, number[]> = { ingest: [], edit: [], read: [], distinct: [] };
  for (let sample = 0; sample <= SAMPLES; sample++) {
    const store = new CellStore();
    try {
      const sheet = store.addSheet(1, ROWS);
      const timings = {
        ingest: measure(() => ingest(store, sheet, false)),
        edit: measure(() => {
          for (let edit = 0; edit < EDITS; edit++) {
            store.beginMutation();
            store.setString(sheet, 0, 0, `category-${edit % 100}`, 0);
            store.endMutation();
          }
        }),
        read: measure(() => {
          for (let read = 0; read < 10_000; read++) {
            const start = (read * 64) % (ROWS - 64);
            const window = store.getWindow(sheet, start, start + 64, new Uint32Array([0]));
            window.takePacked();
            window.free();
          }
        }),
        distinct: measure(() => {
          for (let query = 0; query < 20; query++) {
            const result = store.distinctValues(sheet, 0, 0);
            if (result.takeTexts().length !== 100) throw new Error("Incorrect distinct values");
            result.free();
          }
        }),
      };
      if (sample > 0)
        for (const [name, duration] of Object.entries(timings)) samples[name]?.push(duration);
    } finally {
      store.free();
    }
  }
  return {
    samples,
    medians: Object.fromEntries(
      Object.entries(samples).map(([name, values]) => [name, median(values)]),
    ),
  };
}
function lifetime() {
  const store = new CellStore();
  try {
    const sheet = store.addSheet(1, ROWS);
    ingest(store, sheet, true);
    const sweepPausesMs = Array.from({ length: SAMPLES + 1 }, () =>
      measure(() => store.compactStringStorage()),
    );
    const last = store.getCell(sheet, ROWS - 1, 0);
    try {
      if (last.string !== `distinct-${ROWS - 1}`) throw new Error("Sweep corrupted live text");
    } finally {
      last.free();
    }
    store.clearRange(sheet, 0, 0, ROWS - 1, 0, true, true);
    store.compactStringStorage();
    for (let edit = 0; edit < EDITS; edit++) {
      store.beginMutation();
      store.setString(sheet, 0, 0, `unique-edit-${edit}-${"x".repeat(128)}`, 0);
      store.endMutation();
    }
    return {
      pauseMs: Math.max(...sweepPausesMs),
      warmupPauseMs: sweepPausesMs[0],
      sweepSamplesMs: sweepPausesMs.slice(1),
      retainedAfterEdits: Array.from(store.memoryStats()),
    };
  } finally {
    store.free();
  }
}
process.stdout.write(`${JSON.stringify(mode === "lifetime" ? lifetime() : controls())}\n`);
