import { fullGC, heapStats } from "bun:jsc";
import { fileURLToPath } from "node:url";

import { SheetRegistry } from "../../packages/core/src/store/sheet-registry.js";
import { StoreViewState } from "../../packages/core/src/store/view-state.js";
import type { RecomputingCellStore } from "../../packages/core/src/store/wasm-contract.js";
import type { Workbook } from "../../packages/core/src/types.js";
import { forceGc, median, now, summarize } from "./stats.js";

const ROWS = 1_000_000;
const ABSENT_ROW = 314_159;
const LOOKUP_BATCHES = 128;
const LOOKUPS_PER_BATCH = 4_096;
const REPEATS = 5;

type Engine = "map" | "packed";

interface RetainedMemory {
  readonly jscCellBytes: number;
  readonly jscExtraBytes: number;
  readonly jscTotalBytes: number;
  readonly processExternalBytes: number;
}

interface IndexMetrics {
  readonly coldBuildMs: number;
  readonly retained: RetainedMemory;
  readonly lookupMedianNs: number;
  readonly lookupP95Ns: number;
  readonly absentResult: number | null;
  readonly rebuildMs: number;
  readonly actualBackingBytes: number | null;
}

interface MemorySnapshot {
  readonly jscHeapSize: number;
  readonly jscExtraMemory: number;
  readonly processExternal: number;
}

function memory_snapshot(): MemorySnapshot {
  const jsc = heapStats();
  return {
    jscHeapSize: jsc.heapSize,
    jscExtraMemory: jsc.extraMemorySize,
    processExternal: process.memoryUsage().external,
  };
}

function retained_memory(after: MemorySnapshot, before: MemorySnapshot): RetainedMemory {
  const jsc_total_bytes = after.jscHeapSize - before.jscHeapSize;
  const jsc_extra_bytes = after.jscExtraMemory - before.jscExtraMemory;
  return {
    jscCellBytes: jsc_total_bytes - jsc_extra_bytes,
    jscExtraBytes: jsc_extra_bytes,
    jscTotalBytes: jsc_total_bytes,
    processExternalBytes: after.processExternal - before.processExternal,
  };
}

function collect_garbage(): void {
  forceGc();
  fullGC();
  forceGc();
}

function make_order(offset: number): Uint32Array {
  const order = new Uint32Array(ROWS - 1);
  let at = 0;
  for (let i = 0; i < ROWS; i++) {
    const row = (i + offset) % ROWS;
    if (row !== ABSENT_ROW) order[at++] = row;
  }
  return order;
}

function lookup_samples(lookup: (row: number) => number | null): {
  readonly medianNs: number;
  readonly p95Ns: number;
} {
  const rows = new Uint32Array(LOOKUPS_PER_BATCH);
  let state = 0x72_1f_5e_ed;
  for (let i = 0; i < rows.length; i++) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    rows[i] = state % ROWS;
  }

  let checksum = 0;
  const samples = new Array<number>(LOOKUP_BATCHES);
  for (let batch = 0; batch < LOOKUP_BATCHES; batch++) {
    const started = now();
    for (let i = 0; i < rows.length; i++) checksum ^= lookup(rows[i]!) ?? 0xffff_ffff;
    samples[batch] = (now() - started) / rows.length;
  }
  if (checksum === 0x1_0000_0000) throw new Error("unreachable lookup checksum");

  const stats = summarize(samples);
  return { medianNs: stats.median * 1e6, p95Ns: stats.p95 * 1e6 };
}

class MapBaseline {
  private readonly order_by_sheet = new Map<string, Uint32Array>();
  private readonly row_index_by_sheet = new Map<string, Map<number, number>>();

  setOrder(order: Uint32Array): void {
    this.order_by_sheet.set("bench", order);
    this.row_index_by_sheet.delete("bench");
  }

  viewRowOf(sheet: string, dataRow: number): number | null {
    const order = this.order_by_sheet.get(sheet);
    if (!order) return null;
    let index = this.row_index_by_sheet.get(sheet);
    if (!index) {
      index = new Map();
      for (let view_row = 0; view_row < order.length; view_row++) {
        index.set(order[view_row]!, view_row);
      }
      this.row_index_by_sheet.set(sheet, index);
    }
    return index.get(dataRow) ?? null;
  }

  dispose(): void {
    this.order_by_sheet.clear();
    this.row_index_by_sheet.clear();
  }
}

function production_view(
  row_count: number,
  initial_order: Uint32Array,
): {
  readonly view: StoreViewState;
  setOrder(order: Uint32Array): void;
} {
  let active_order = initial_order;
  const wasm = {
    sortRowsMulti: () => active_order,
  } as unknown as RecomputingCellStore;
  const workbook: Workbook = {
    activeSheet: "bench",
    sheets: [
      {
        id: "bench",
        name: "Benchmark",
        rowCount: row_count,
        columns: [{ key: "value", header: "Value", width: 100, type: "number" }],
        sortKeys: [{ col: 0, ascending: true }],
      },
    ],
  };
  const sheets = new SheetRegistry(workbook);
  sheets.handles.set("bench", 0);
  const view = new StoreViewState(wasm, sheets);
  view.metadataChanged("bench");
  return {
    view,
    setOrder(order) {
      active_order = order;
      view.metadataChanged("bench");
    },
  };
}

function run_worker(engine: Engine): IndexMetrics {
  const order = make_order(0);
  const rebuilt_order = make_order(271_828);
  const map = engine === "map" ? new MapBaseline() : null;
  const packed = engine === "packed" ? production_view(ROWS, order) : null;
  map?.setOrder(order);

  collect_garbage();
  const before = memory_snapshot();
  const started = now();
  const first = map
    ? map.viewRowOf("bench", order[0]!)
    : packed!.view.viewRowOf("bench", order[0]!);
  if (first !== 0) throw new Error(`${engine} cold inverse build failed`);
  const cold_build_ms = now() - started;
  collect_garbage();
  const retained = retained_memory(memory_snapshot(), before);
  const lookup = lookup_samples((row) =>
    map ? map.viewRowOf("bench", row) : packed!.view.viewRowOf("bench", row),
  );
  const absent_result = map
    ? map.viewRowOf("bench", ABSENT_ROW)
    : packed!.view.viewRowOf("bench", ABSENT_ROW);
  const actual_backing_bytes = packed?.view.inverseIndexByteLength("bench") ?? null;

  map?.setOrder(rebuilt_order);
  packed?.setOrder(rebuilt_order);
  const rebuild_started = now();
  const rebuilt = map
    ? map.viewRowOf("bench", rebuilt_order[0]!)
    : packed!.view.viewRowOf("bench", rebuilt_order[0]!);
  if (rebuilt !== 0) throw new Error(`${engine} inverse rebuild was stale`);
  const rebuild_ms = now() - rebuild_started;
  map?.dispose();
  packed?.view.dispose();

  return {
    coldBuildMs: cold_build_ms,
    retained,
    lookupMedianNs: lookup.medianNs,
    lookupP95Ns: lookup.p95Ns,
    absentResult: absent_result,
    rebuildMs: rebuild_ms,
    actualBackingBytes: actual_backing_bytes,
  };
}

function aggregate(samples: readonly IndexMetrics[]): IndexMetrics {
  return {
    coldBuildMs: median(samples.map((sample) => sample.coldBuildMs)),
    retained: {
      jscCellBytes: median(samples.map((sample) => sample.retained.jscCellBytes)),
      jscExtraBytes: median(samples.map((sample) => sample.retained.jscExtraBytes)),
      jscTotalBytes: median(samples.map((sample) => sample.retained.jscTotalBytes)),
      processExternalBytes: median(samples.map((sample) => sample.retained.processExternalBytes)),
    },
    lookupMedianNs: median(samples.map((sample) => sample.lookupMedianNs)),
    lookupP95Ns: median(samples.map((sample) => sample.lookupP95Ns)),
    absentResult: samples.every((sample) => sample.absentResult === null) ? null : -1,
    rebuildMs: median(samples.map((sample) => sample.rebuildMs)),
    actualBackingBytes: samples[0]!.actualBackingBytes,
  };
}

function spawn_worker(engine: Engine): IndexMetrics {
  const child = Bun.spawnSync({
    cmd: [process.execPath, fileURLToPath(import.meta.url), "--worker", engine],
    stdout: "pipe",
    stderr: "pipe",
  });
  if (child.exitCode !== 0) {
    throw new Error(
      `${engine} benchmark worker failed: ${child.stderr.toString() || child.stdout.toString()}`,
    );
  }
  return JSON.parse(child.stdout.toString()) as IndexMetrics;
}

function resource_scenarios(): {
  readonly denseBytes: number;
  readonly sparse: {
    readonly survivors: number;
    readonly backingBytes: number;
    readonly coldBuildMs: number;
    readonly lookupMedianNs: number;
    readonly lookupP95Ns: number;
  };
  readonly empty: {
    readonly survivors: 0;
    readonly backingBytes: number;
    readonly coldBuildMs: number;
  };
  readonly aggregate: {
    readonly sheets: number;
    readonly emptySheets: number;
    readonly sparseSheets: number;
    readonly logicalRows: number;
    readonly survivors: number;
    readonly backingBytes: number;
    readonly coldBuildMs: number;
  };
} {
  const sparse_order = Uint32Array.from([ROWS - 1, 7, 12_345, 500_000]);
  const sparse = production_view(ROWS, sparse_order);
  const sparse_started = now();
  if (sparse.view.viewRowOf("bench", ROWS - 1) !== 0) throw new Error("sparse build failed");
  const sparse_build_ms = now() - sparse_started;
  const sparse_lookup = lookup_samples((row) => sparse.view.viewRowOf("bench", row));
  const sparse_bytes = sparse.view.inverseIndexByteLength("bench");
  sparse.view.dispose();

  const empty = production_view(ROWS, new Uint32Array(0));
  const empty_started = now();
  if (empty.view.viewRowOf("bench", 0) !== null) throw new Error("empty build failed");
  const empty_build_ms = now() - empty_started;
  const empty_bytes = empty.view.inverseIndexByteLength("bench");
  empty.view.dispose();

  const sheets = Array.from({ length: 256 }, (_, handle) => ({
    id: `s${handle}`,
    name: `Sheet ${handle}`,
    rowCount: ROWS,
    columns: [{ key: "value", header: "Value", width: 100, type: "number" as const }],
    sortKeys: [{ col: 0, ascending: true }],
  }));
  const workbook: Workbook = { activeSheet: "s0", sheets };
  const orders = sheets.map((_, handle) => (handle % 2 === 0 ? new Uint32Array(0) : sparse_order));
  const registry = new SheetRegistry(workbook);
  for (const [handle, sheet] of sheets.entries()) registry.handles.set(sheet.id, handle);
  const wasm = {
    sortRowsMulti: (handle: number) => orders[handle]!,
  } as unknown as RecomputingCellStore;
  const aggregate_view = new StoreViewState(wasm, registry);
  const aggregate_started = now();
  for (let handle = 0; handle < sheets.length; handle++) {
    const sheet = sheets[handle]!;
    aggregate_view.metadataChanged(sheet.id);
    aggregate_view.viewRowOf(sheet.id, ROWS - 1);
  }
  const aggregate_build_ms = now() - aggregate_started;
  const aggregate_bytes = sheets.reduce(
    (bytes, sheet) => bytes + aggregate_view.inverseIndexByteLength(sheet.id),
    0,
  );
  aggregate_view.dispose();

  return {
    denseBytes: ROWS * Uint32Array.BYTES_PER_ELEMENT,
    sparse: {
      survivors: sparse_order.length,
      backingBytes: sparse_bytes,
      coldBuildMs: sparse_build_ms,
      lookupMedianNs: sparse_lookup.medianNs,
      lookupP95Ns: sparse_lookup.p95Ns,
    },
    empty: { survivors: 0, backingBytes: empty_bytes, coldBuildMs: empty_build_ms },
    aggregate: {
      sheets: sheets.length,
      emptySheets: 128,
      sparseSheets: 128,
      logicalRows: sheets.length * ROWS,
      survivors: 128 * sparse_order.length,
      backingBytes: aggregate_bytes,
      coldBuildMs: aggregate_build_ms,
    },
  };
}

/** `full` runs on a quiet machine (local or release); `smoke` runs on a shared CI runner. */
export type BenchMode = "smoke" | "full";

/** How much slower than the Map baseline a packed lookup may be in a full run. */
const LOOKUP_P95_REGRESSION_LIMIT = 0.1;
/**
 * How much slower the packed lookup's fastest run may be than the Map
 * baseline's in a smoke. Ten develop smokes on a loaded machine measured
 * −0.39 to +0.12; a packed lookup slowed to twice its work measured +0.34 to
 * +0.49.
 */
const LOOKUP_BEST_MEDIAN_REGRESSION_LIMIT = 0.25;

/** The lookup gate of a run: the packed index against the Map baseline. */
export interface LookupGate {
  readonly name: "lookupP95" | "lookupBestMedian";
  readonly regression: number;
  readonly passed: boolean;
}

/**
 * A full run, on a quiet machine, compares the median of the run p95s. The
 * smoke runs on a shared runner, where a neighbour can double a run's p95 and
 * even its median, but never makes a lookup faster: it compares each engine's
 * fastest run median, with headroom from the spread such runs show.
 */
export function lookupGate(
  mode: BenchMode,
  baselineRuns: readonly Pick<IndexMetrics, "lookupMedianNs" | "lookupP95Ns">[],
  packedRuns: readonly Pick<IndexMetrics, "lookupMedianNs" | "lookupP95Ns">[],
): LookupGate {
  if (mode === "full") {
    const regression =
      median(packedRuns.map((run) => run.lookupP95Ns)) /
        median(baselineRuns.map((run) => run.lookupP95Ns)) -
      1;
    return {
      name: "lookupP95",
      regression,
      passed: regression <= LOOKUP_P95_REGRESSION_LIMIT,
    };
  }
  const regression =
    Math.min(...packedRuns.map((run) => run.lookupMedianNs)) /
      Math.min(...baselineRuns.map((run) => run.lookupMedianNs)) -
    1;
  return {
    name: "lookupBestMedian",
    regression,
    passed: regression <= LOOKUP_BEST_MEDIAN_REGRESSION_LIMIT,
  };
}

function main(mode: BenchMode): void {
  const runs: Record<Engine, IndexMetrics[]> = { map: [], packed: [] };
  for (let repeat = 0; repeat < REPEATS; repeat++) {
    const order: readonly Engine[] = repeat % 2 === 0 ? ["map", "packed"] : ["packed", "map"];
    for (const engine of order) runs[engine].push(spawn_worker(engine));
  }

  const baseline = aggregate(runs.map);
  const packed = aggregate(runs.packed);
  const resources = resource_scenarios();
  const heap_reduction = 1 - packed.retained.jscTotalBytes / baseline.retained.jscTotalBytes;
  const lookup_p95_regression = packed.lookupP95Ns / baseline.lookupP95Ns - 1;
  const lookup = lookupGate(mode, runs.map, runs.packed);
  const gates = {
    absentFilteredRow: baseline.absentResult === null && packed.absentResult === null,
    actualDenseStorage:
      packed.actualBackingBytes === resources.denseBytes && resources.denseBytes <= ROWS * 4,
    sparseStorage:
      resources.sparse.backingBytes > 0 && resources.sparse.backingBytes < resources.denseBytes,
    emptyStorage: resources.empty.backingBytes === 0,
    aggregateStorage: resources.aggregate.backingBytes === 128 * resources.sparse.backingBytes,
    heapReduction:
      baseline.retained.jscTotalBytes > 0 &&
      packed.retained.jscTotalBytes >= 0 &&
      heap_reduction >= 0.5,
    [lookup.name]: lookup.passed,
    coldBuild: packed.coldBuildMs <= baseline.coldBuildMs,
  };

  console.log(
    JSON.stringify(
      {
        rows: ROWS,
        mode,
        lookupsPerRun: LOOKUP_BATCHES * LOOKUPS_PER_BATCH,
        repeats: REPEATS,
        attribution:
          "Each engine run uses a fresh Bun process. JSC total is decomposed as cell bytes plus typed-array/external extra bytes; gates compare the raw repeated-run median totals without clamping.",
        baseline,
        packed,
        resources,
        heapReduction: heap_reduction,
        lookupP95Regression: lookup_p95_regression,
        lookupGate: lookup,
        gates,
        runs,
      },
      null,
      2,
    ),
  );

  if (Object.values(gates).some((passed) => !passed)) process.exitCode = 1;
}

const worker_engine = process.argv[2] === "--worker" ? process.argv[3] : undefined;
if (worker_engine === "map" || worker_engine === "packed") {
  console.log(JSON.stringify(run_worker(worker_engine)));
} else if (import.meta.main) {
  main(process.argv.includes("--smoke") ? "smoke" : "full");
}
