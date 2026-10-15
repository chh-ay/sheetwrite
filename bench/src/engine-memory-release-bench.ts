import "./dom-setup.js";
import { heapStats } from "bun:jsc";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import type * as Wasm from "@sheetwrite/wasm";

import type * as Core from "../../packages/core/src/index.js";
import type { CompactRangeHistory } from "../../packages/core/src/store/data-engine.js";

// Run the entire comparison under one bench-run slot. Children inherit that
// affinity; no nested wrappers or concurrent samples are used.
// Module specifiers are runtime-selected so the same harness measures detached
// baseline and changed worktrees without sharing module initialization state.
interface MemoryObservation {
  wasmBytes: number;
  jsHeapBytes: number;
  jscExternalBytes: number;
  rssBytes: number;
}
const { values } = parseArgs({
  options: {
    root: { type: "string", default: "." },
    engine: { type: "string", default: "wasm" },
    mode: { type: "string", default: "paths" },
    compare: { type: "string" },
    metric: { type: "string" },
    output: { type: "string" },
  },
});
const root = resolve(values.root);
const engineName = values.engine;
if (engineName !== "wasm" && engineName !== "formulas")
  throw new Error("Expected wasm or formulas");
const metrics = ["edit", "read", "ingest", "recalculation"] as const;
type Metric = (typeof metrics)[number];
type PathCapture = Record<Metric, { medianMs: number; samplesMs: number[] }>;
// Short samples otherwise measure JSC tier-up rather than steady-state engine work.
const WARMUPS = 40;
const SAMPLES = 21;
const PATH_ROWS = 100_000;
const MEMORY_ROWS = 1_000_000;
const EDITS_PER_SAMPLE = 1024;
const READS_PER_SAMPLE = 2048;
const RECALCULATIONS_PER_SAMPLE = 32;
const WINDOW_ROWS = 64;
const GC_TURNS = 5;

function median(samples: readonly number[]): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const center = sorted[middle];
  if (center === undefined) throw new Error("Cannot summarize an empty sample");
  return sorted.length % 2 ? center : (center + (sorted[middle - 1] ?? center)) / 2;
}

async function collectGarbage(): Promise<void> {
  for (let turn = 0; turn < GC_TURNS; turn++) {
    const next = Promise.withResolvers<void>();
    setImmediate(next.resolve);
    await next.promise;
    Bun.gc(true);
  }
}

function workbook(rows: number): Core.Workbook {
  return {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Data",
        rowCount: rows,
        columns: [
          { key: "name", header: "Name", type: "text", width: 120 },
          { key: "amount", header: "Amount", type: "number", width: 120 },
          { key: "other", header: "Other", type: "number", width: 120 },
        ],
      },
    ],
  };
}

function columnar(rows: number): Core.ColumnarData {
  return {
    rowCount: rows,
    columns: {
      name: Array.from({ length: rows }, (_, row) => `value-${row % 16}`),
      amount: new Float64Array(rows).fill(17),
      other: new Float64Array(rows).fill(5),
    },
  };
}

const address = (row: number, col: number): Core.CellAddress => ({ sheet: "s1", row, col });

async function paths(): Promise<PathCapture> {
  const core: typeof Core = await import(
    pathToFileURL(resolve(root, "packages/core/src/index.ts")).href
  );
  const provider: typeof Wasm = await import(
    pathToFileURL(resolve(root, `packages/${engineName}/loader-node.mjs`)).href
  );
  await core.initSheetwrite(undefined, provider);
  const source = columnar(PATH_ROWS);
  const editStore = new core.SheetwriteStore(workbook(PATH_ROWS), source);
  const calcStore = new core.SheetwriteStore(workbook(PATH_ROWS), source);
  calcStore.applyTransaction({
    patches: [
      { op: "set", addr: address(0, 2), value: { kind: "formula", src: `=SUM(B1:B${PATH_ROWS})` } },
    ],
  });
  const capture = {} as PathCapture;
  try {
    for (const metric of metrics.filter((metric) => !values.metric || values.metric === metric)) {
      const samplesMs: number[] = [];
      for (let sample = -WARMUPS; sample < SAMPLES; sample++) {
        const started = performance.now();
        let operations = 1;
        switch (metric) {
          case "edit":
            operations = EDITS_PER_SAMPLE;
            for (let edit = 0; edit < operations; edit++) {
              const result = editStore.applyTransaction({
                patches: [
                  {
                    op: "set",
                    addr: address(edit, 1),
                    value: { kind: "literal", value: edit + sample },
                  },
                ],
              });
              if (result.status !== "applied") throw new Error("Edit sample was not applied");
            }
            break;
          case "read":
            operations = READS_PER_SAMPLE;
            for (let read = 0; read < operations; read++) {
              const start = (read * 307) % (PATH_ROWS - WINDOW_ROWS);
              editStore.getVisibleWindow("s1", { start, end: start + WINDOW_ROWS }, [0, 1, 2]);
            }
            break;
          case "ingest": {
            const imported = new core.SheetwriteStore(workbook(PATH_ROWS), source);
            assert.equal(imported.getCell(address(PATH_ROWS - 1, 1)).resolved, 17);
            imported.dispose();
            break;
          }
          case "recalculation":
            operations = RECALCULATIONS_PER_SAMPLE;
            for (let calculation = 0; calculation < operations; calculation++) {
              const result = calcStore.applyTransaction({
                patches: [
                  {
                    op: "set",
                    addr: address(0, 1),
                    value: { kind: "literal", value: calculation + sample },
                  },
                ],
              });
              if (result.status !== "applied")
                throw new Error("Recalculation sample was not applied");
            }
            break;
        }
        const elapsed = (performance.now() - started) / operations;
        if (sample >= 0) samplesMs.push(elapsed);
        if (metric === "edit")
          assert.equal(
            editStore.getCell(address(EDITS_PER_SAMPLE - 1, 1)).resolved,
            EDITS_PER_SAMPLE - 1 + sample,
          );
        if (metric === "recalculation")
          assert.equal(
            calcStore.getCell(address(0, 2)).resolved,
            PATH_ROWS * 17 - 17 + RECALCULATIONS_PER_SAMPLE - 1 + sample,
          );
      }
      capture[metric] = { medianMs: median(samplesMs), samplesMs };
    }
    return capture;
  } finally {
    editStore.dispose();
    calcStore.dispose();
  }
}

async function compare(baseline: string) {
  async function sample(selectedRoot: string): Promise<PathCapture> {
    const child = Bun.spawn(
      [
        process.execPath,
        import.meta.path,
        "--mode",
        "paths",
        "--root",
        selectedRoot,
        "--engine",
        engineName,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) throw new Error(`Benchmark child failed (${code}): ${stderr}`);
    const capture = JSON.parse(stdout) as PathCapture;
    for (const metric of metrics)
      assert.ok(Number.isFinite(capture[metric].medianMs) && capture[metric].medianMs > 0);
    return capture;
  }
  const controls: Array<{ first: PathCapture[]; second: PathCapture[] }> = [];
  for (let round = 0; round < 3; round++) {
    const first = [await sample(baseline), await sample(baseline)];
    const second = [await sample(baseline), await sample(baseline)];
    controls.push({ first, second });
  }
  const rounds: Array<{ order: string[]; baseline: PathCapture[]; changed: PathCapture[] }> = [];
  for (let round = 0; round < 5; round++) {
    const order = round % 2 === 0 ? ["A", "B", "B", "A"] : ["B", "A", "A", "B"];
    const captures: { order: string[]; baseline: PathCapture[]; changed: PathCapture[] } = {
      order,
      baseline: [],
      changed: [],
    };
    for (const side of order) {
      const capture = await sample(side === "A" ? baseline : root);
      (side === "A" ? captures.baseline : captures.changed).push(capture);
    }
    rounds.push(captures);
  }
  const summary = metrics.map((metric) => {
    const noisePct = Math.max(
      ...controls.map(
        (control) =>
          Math.abs(
            median(control.second.map((capture) => capture[metric].medianMs)) /
              median(control.first.map((capture) => capture[metric].medianMs)) -
              1,
          ) * 100,
      ),
    );
    const baselineRounds = rounds.map((round) =>
      median(round.baseline.map((capture) => capture[metric].medianMs)),
    );
    const changedRounds = rounds.map((round) =>
      median(round.changed.map((capture) => capture[metric].medianMs)),
    );
    const baselineMs = median(baselineRounds);
    const changedMs = median(changedRounds);
    const deltaPct = (changedMs / baselineMs - 1) * 100;
    return {
      metric,
      noisePct,
      baselineRounds,
      changedRounds,
      baselineMs,
      changedMs,
      deltaPct,
      pass: deltaPct <= 3 + noisePct,
    };
  });
  return {
    baseline,
    changed: root,
    engine: engineName,
    warmups: WARMUPS,
    samples: SAMPLES,
    controls,
    rounds,
    summary,
    pass: summary.every((metric) => metric.pass),
  };
}

async function memory() {
  const core: typeof Core = await import(
    pathToFileURL(resolve(root, "packages/core/src/index.ts")).href
  );
  const provider: typeof Wasm = await import(
    pathToFileURL(resolve(root, `packages/${engineName}/loader-node.mjs`)).href
  );
  const testing = await import(pathToFileURL(resolve(root, "packages/core/src/testing.ts")).href);
  const engine = await import(pathToFileURL(resolve(root, "packages/core/src/engine.ts")).href);
  await core.initSheetwrite(undefined, provider);
  const restoreCanvas = testing.installCanvasTestStubs();
  const observations: Array<{
    scenario: string;
    rows: number;
    before: MemoryObservation;
    after: MemoryObservation;
    report: Core.EngineMemoryReleaseReport;
    oldMemoryCollected: boolean;
    freshWasmBytesFloor: number;
    compactHistoryBytes: number;
    bytesAboveFreshFloor: number;
  }> = [];
  function observe(): MemoryObservation {
    const heap = heapStats();
    return {
      wasmBytes: engine.getEngine().getMemory().buffer.byteLength,
      // JSC counts WASM/ArrayBuffer backing memory as extra heap, sometimes twice.
      // Report non-external JS allocations separately from actual process RSS.
      jsHeapBytes: heap.heapSize - heap.extraMemorySize,
      jscExternalBytes: heap.extraMemorySize,
      rssBytes: process.memoryUsage().rss,
    };
  }

  const freshFloors = new Map<string, number>();

  for (const scenario of ["empty-dense", "dense-clear", "paged-dirty", "large-clear-history"]) {
    await core.releaseEngineMemory();
    const fresh = new core.SheetwriteStore(
      workbook(MEMORY_ROWS),
      undefined,
      scenario === "paged-dirty"
        ? { storage: "paged", chunkRows: 256, cacheBytes: 64 * 1024 }
        : undefined,
    );
    let history: CompactRangeHistory | null = null;

    try {
      if (scenario === "dense-clear") {
        fresh.applyTransaction({
          patches: Array.from({ length: 10 }, (_, row) => ({
            op: "setBlock" as const,
            range: { sheet: "s1", start: { row, col: 0 }, end: { row, col: 2 } },
            block: { rowCount: 1, colCount: 3, values: [`value-${row}`, 17, 5] },
          })),
        });
      } else if (scenario === "paged-dirty") {
        fresh.loadPage(
          "s1",
          199_744,
          [{ start: 0, end: 3, keys: ["name", "amount", "other"] }],
          Array.from({ length: 256 }, () => ({ name: "resident page", amount: 17, other: 5 })),
        );
        fresh.applyTransaction({
          patches: [
            { op: "set", addr: address(0, 1), value: { kind: "literal", value: 99 } },
            { op: "set", addr: address(0, 2), value: { kind: "formula", src: "=B1*2" } },
          ],
        });
      } else if (scenario === "large-clear-history") {
        history = fresh.captureRangeHistory({
          sheet: "s1",
          start: { row: 0, col: 0 },
          end: { row: MEMORY_ROWS - 1, col: 2 },
        });
      }

      freshFloors.set(scenario, engine.getEngine().getMemory().buffer.byteLength);
    } finally {
      history?.dispose();
      fresh.dispose();
    }
  }

  await core.releaseEngineMemory();
  async function capture(scenario: string, verify: () => void, compactHistoryBytes = 0) {
    const freshWasmBytesFloor = freshFloors.get(scenario);
    if (freshWasmBytesFloor === undefined) throw new Error(`Missing fresh floor for ${scenario}`);

    await collectGarbage();
    const before = observe();
    const retired = new WeakRef(engine.getEngine().getMemory());
    const report = await core.releaseEngineMemory();
    await collectGarbage();
    const after = observe();
    verify();
    assert.equal(retired.deref(), undefined, "Retired WebAssembly.Memory must be collectible");
    assert.ok(after.wasmBytes <= before.wasmBytes, `${scenario}: committed memory grew`);
    if (scenario !== "empty-dense") {
      assert.ok(after.wasmBytes < before.wasmBytes, `${scenario}: committed memory did not fall`);
      assert.ok(after.rssBytes < before.rssBytes, `${scenario}: process memory did not fall`);
    }

    if (scenario !== "paged-dirty") {
      assert.ok(
        after.wasmBytes <= freshWasmBytesFloor * 1.1,
        `${scenario}: import exceeded the fresh floor by over 10%`,
      );
    }

    observations.push({
      scenario,
      rows: MEMORY_ROWS,
      before,
      after,
      report,
      oldMemoryCollected: true,
      freshWasmBytesFloor,
      compactHistoryBytes,
      bytesAboveFreshFloor: Math.max(0, after.wasmBytes - freshWasmBytesFloor),
    });
  }
  try {
    const empty = new core.SheetwriteStore(workbook(MEMORY_ROWS));

    try {
      await capture("empty-dense", () => {
        assert.equal(empty.getCell(address(MEMORY_ROWS - 1, 1)).resolved, null);
      });
    } finally {
      empty.dispose();
    }

    const dense = new core.SheetwriteStore(workbook(MEMORY_ROWS), columnar(MEMORY_ROWS));
    try {
      assert.equal(
        dense.applyTransaction({
          patches: [
            {
              op: "clearRange",
              range: {
                sheet: "s1",
                start: { row: 10, col: 0 },
                end: { row: MEMORY_ROWS - 1, col: 2 },
              },
              contents: true,
              style: true,
            },
          ],
        }).status,
        "applied",
      );
      await capture("dense-clear", () => {
        assert.equal(dense.getCell(address(0, 1)).resolved, 17);
        assert.equal(dense.getCell(address(MEMORY_ROWS - 1, 1)).resolved, null);
      });
    } finally {
      dense.dispose();
    }

    const paged = new core.SheetwriteStore(workbook(MEMORY_ROWS), undefined, {
      storage: "paged",
      chunkRows: 256,
      cacheBytes: 64 * 1024,
    });
    try {
      const bands = [{ start: 0, end: 3, keys: ["name", "amount", "other"] }];
      paged.loadPage(
        "s1",
        0,
        bands,
        Array.from({ length: 200_000 }, () => ({ name: "resident page", amount: 17, other: 5 })),
      );
      assert.equal(
        paged.applyTransaction({
          patches: [
            { op: "set", addr: address(0, 1), value: { kind: "literal", value: 99 } },
            { op: "set", addr: address(0, 2), value: { kind: "formula", src: "=B1*2" } },
          ],
        }).status,
        "applied",
      );
      await capture("paged-dirty", () => {
        assert.equal(paged.getCell(address(0, 1)).resolved, 99);
        assert.equal(paged.getCell(address(0, 2)).resolved, 198);
        assert.equal(paged.getCellLoadState(address(0, 1)), "local-edit");
        assert.equal(paged.getCellLoadState(address(400_000, 1)), "unloaded");
      });
      paged.loadPage("s1", 400_000, bands, [{ name: "reloaded", amount: 23, other: 4 }]);
      assert.equal(paged.getCell(address(400_000, 1)).resolved, 23);
    } finally {
      paged.dispose();
    }

    const host = document.createElement("div");
    Object.defineProperties(host, { clientWidth: { value: 800 }, clientHeight: { value: 400 } });
    document.body.append(host);
    const grid = core.createGrid(host, {
      workbook: workbook(MEMORY_ROWS),
      data: columnar(MEMORY_ROWS),
    });
    try {
      assert.equal(
        grid.applyTransaction({
          patches: [
            {
              op: "clearRange",
              range: {
                sheet: "s1",
                start: { row: 0, col: 0 },
                end: { row: MEMORY_ROWS - 1, col: 2 },
              },
              contents: true,
              style: true,
            },
          ],
        }).status,
        "applied",
      );
      assert.ok(grid.store instanceof core.SheetwriteStore);
      const materializations = grid.store.getRangeMutationAllocationStats().historyMaterializations;
      await capture(
        "large-clear-history",
        () => {
          assert.equal(grid.store.getCell(address(MEMORY_ROWS - 1, 1)).resolved, null);
          assert.ok(grid.store instanceof core.SheetwriteStore);
          assert.equal(
            grid.store.getRangeMutationAllocationStats().historyMaterializations,
            materializations,
          );
        },
        grid.store.getRangeMutationAllocationStats().historySnapshotBytes,
      );
      grid.undo();
      assert.equal(grid.store.getCell(address(MEMORY_ROWS - 1, 1)).resolved, 17);
      grid.redo();
      assert.equal(grid.store.getCell(address(MEMORY_ROWS - 1, 1)).resolved, null);
    } finally {
      grid.destroy();
      host.remove();
    }
    return {
      engine: engineName,
      root,
      jsHeapMeasurement: "bun:jsc heapStats().heapSize - extraMemorySize after full GC",
      observations,
    };
  } finally {
    restoreCanvas();
  }
}

const result = values.compare
  ? await compare(resolve(values.compare))
  : values.mode === "memory"
    ? await memory()
    : await paths();
const serialized = `${JSON.stringify(result, null, values.output ? 2 : undefined)}\n`;
if (values.output) await Bun.write(values.output, serialized);
else process.stdout.write(serialized);
if ("pass" in result && !result.pass) process.exitCode = 1;
