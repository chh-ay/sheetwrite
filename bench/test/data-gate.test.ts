import { expect, spyOn, test } from "bun:test";

import { SheetwriteStore } from "../../packages/core/src/index.js";
import {
  type DataBenchmarkResult,
  type DataStat,
  type EngineResult,
  QUERY_FIXTURES,
  QUERY_SCENARIOS,
  runSheetwriteDataBench,
  validateDataBenchmark,
  WORKLOADS,
} from "../src/data-bench.js";
import { resetBenchmarkDocument } from "../src/dom-setup.js";
import {
  DATA_GATE_PROTOCOL_VERSION,
  MATRIX_IDS,
  PERFORMANCE_GATE_PROTOCOL_VERSION,
} from "../src/gate-protocol.js";
import { createHandsontable } from "../src/handsontable-runtime.js";
import { summarize } from "../src/stats.js";
import { type DeepMutable, expectRejections, must, mutableCopy } from "./gate-fixtures.js";

const ROWS = 1_000;
const SAMPLES = [1, 2, 3];
const KEY = `engine=sheetwrite;rows=${ROWS}`;

function smoke_fixture(): DeepMutable<DataBenchmarkResult> {
  const stat = () => ({ ...summarize(SAMPLES), samples: [...SAMPLES] });
  const stats: Record<string, DataStat> = Object.fromEntries(
    WORKLOADS.map((workload) => [workload, stat()]),
  );
  const row: EngineResult = {
    rows: ROWS,
    stats: stats as EngineResult["stats"],
    queries: Object.fromEntries(QUERY_SCENARIOS.map((scenario) => [scenario, stat()])),
    notes: {},
    queryResources: {
      composedFilterMatches: 500,
      containsCacheConstructions: 2,
      lowDistinctCount: 7,
      highDistinctCount: ROWS,
      ownedDistinctStrings: ROWS + 7,
    },
    memory: { heapDeltaBytes: 1024, wasmDeltaBytes: 2048 },
  };
  return mutableCopy({
    protocolVersion: DATA_GATE_PROTOCOL_VERSION,
    mode: "smoke",
    matrixId: MATRIX_IDS.data.smoke,
    meta: {
      engineVersions: { sheetwrite: "0.4.0", handsontable: "18.1.2" },
      queryFixtures: QUERY_FIXTURES,
      bun: "test",
      platform: "linux",
      arch: "x64",
      commit: "0".repeat(40),
      dirty: false,
      timestamp: new Date(0).toISOString(),
      sheetwriteRows: [ROWS],
      handsontableRows: [],
      gcBetweenSamples: true,
      freshDocumentBetweenIngestSamples: true,
    },
    sheetwrite: { [ROWS]: row },
    handsontable: {},
  } satisfies DataBenchmarkResult);
}

/** The validator checks the artifact's shape at run time, as it does for captured JSON. */
const validate = (result: unknown) => validateDataBenchmark(result as DataBenchmarkResult, "smoke");

const sheetwrite_row = (result: DeepMutable<DataBenchmarkResult>) =>
  must(result.sheetwrite[ROWS], "Sheetwrite row");

test("rejects drifted identity, metadata, matrix cells and query resources", () => {
  expect(() => validate(smoke_fixture())).not.toThrow();
  expectRejections(smoke_fixture, validate, [
    ...(["sheetwrite", "handsontable"] as const).map(
      (engine) =>
        [
          (result: DeepMutable<DataBenchmarkResult>) =>
            Reflect.set(result.meta.engineVersions, engine, "^18.1.2"),
          `engineVersions.${engine}`,
        ] as const,
    ),
    [
      (result) => Reflect.set(result, "protocolVersion", PERFORMANCE_GATE_PROTOCOL_VERSION),
      "data stale protocol: expected 2, observed 1",
    ],
    // A v1 artifact keeps its old matrix id; it was sampled without the GC.
    [(result) => (result.matrixId = "data-smoke-v1"), "data stale matrix"],
    ...(["gcBetweenSamples", "freshDocumentBetweenIngestSamples"] as const).flatMap((field) =>
      [false, undefined].map(
        (value) =>
          [
            (result: DeepMutable<DataBenchmarkResult>) => Reflect.set(result.meta, field, value),
            `data metadata.${field} must be true`,
          ] as const,
      ),
    ),
    [
      (result) => (result.sheetwrite["01000"] = sheetwrite_row(result)),
      `duplicate ${KEY};metric=ingest`,
    ],
    [
      (result) =>
        Reflect.set(sheetwrite_row(result).stats, "notDeclared", {
          ...summarize([1]),
          samples: [1],
        }),
      `unexpected ${KEY};metric=notDeclared`,
    ],
    [
      (result) => (sheetwrite_row(result).stats.ingest.median = 4),
      `${KEY};metric=ingest.stat contains an impossible finite summary`,
    ],
    [
      (result) => Reflect.deleteProperty(sheetwrite_row(result).stats.ingest, "samples"),
      `${KEY};metric=ingest.samples are missing`,
    ],
    [
      (result) =>
        Reflect.set(
          must(sheetwrite_row(result).queryResources, "query resources"),
          "containsCacheConstructions",
          ROWS,
        ),
      "query resource counters violate structural bounds",
    ],
  ]);
});

test("collects after every Sheetwrite sample and disposes each ingest store first", async () => {
  const disposals_at_collection: number[] = [];
  const dispose = spyOn(SheetwriteStore.prototype, "dispose");
  const gc = spyOn(Bun, "gc").mockImplementation((full) => {
    expect(full).toBe(true);
    disposals_at_collection.push(dispose.mock.calls.length);
    return 0;
  });

  try {
    const result = must((await runSheetwriteDataBench([ROWS], "smoke")).get(ROWS), "row size");
    const all_stats = [...Object.values(result.stats), ...Object.values(result.queries ?? {})];
    // Each workload collects after its final warm-up and every timed sample;
    // one more GC runs once all of this engine's stores have been released.
    const expected_collections = all_stats.reduce((count, stat) => count + stat.iters + 1, 1);
    expect(gc).toHaveBeenCalledTimes(expected_collections);

    // The first eight collections follow the warm-up and seven ingests. Each
    // ingest store must be disposed before that sample's GC, rather than left
    // alive until the next iteration or workload starts.
    const first_disposals = must(disposals_at_collection[0], "post-warm-up collection");
    expect(disposals_at_collection.slice(0, 8)).toEqual(
      Array.from({ length: 8 }, (_, index) => first_disposals + index),
    );
  } finally {
    gc.mockRestore();
    dispose.mockRestore();
  }
});

test("the public document reset gives the next grid a fresh usable owner", async () => {
  const documents = new Set<Document>();
  for (let sample = 0; sample < 3; sample++) {
    const owner = document;
    expect(documents.has(owner)).toBe(false);
    documents.add(owner);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const hot = createHandsontable(host, {
      data: [[sample]],
      width: 200,
      height: 100,
      autoColumnSize: false,
      autoRowSize: false,
      licenseKey: "non-commercial-and-evaluation",
    });
    try {
      expect(hot.rootElement.ownerDocument).toBe(owner);
      expect(hot.getSourceDataAtCell(0, 0)).toBe(sample);
    } finally {
      hot.destroy();
    }
    await resetBenchmarkDocument();
    expect(document).not.toBe(owner);
    expect(document.body.contains(host)).toBe(false);
    expect(window.frameElement).toBeNull();
  }
});
