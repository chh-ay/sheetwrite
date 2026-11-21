import { expect, test } from "bun:test";

import {
  type DataBenchmarkResult,
  type DataStat,
  type EngineResult,
  QUERY_FIXTURES,
  QUERY_SCENARIOS,
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

function smokeFixture(): DeepMutable<DataBenchmarkResult> {
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

const sheetwriteRow = (result: DeepMutable<DataBenchmarkResult>) =>
  must(result.sheetwrite[ROWS], "Sheetwrite row");

test("rejects drifted identity, metadata, matrix cells and query resources", () => {
  expect(() => validate(smokeFixture())).not.toThrow();
  expectRejections(smokeFixture, validate, [
    [
      (result) => Reflect.set(result.meta.engineVersions, "handsontable", "^18.1.2"),
      "engineVersions.handsontable",
    ],
    [
      (result) => Reflect.set(result, "protocolVersion", PERFORMANCE_GATE_PROTOCOL_VERSION),
      "data stale protocol: expected 2, observed 1",
    ],
    // A v1 artifact keeps its old matrix id; it was sampled without the GC.
    [(result) => (result.matrixId = "data-smoke-v1"), "data stale matrix"],
    ...(["gcBetweenSamples", "freshDocumentBetweenIngestSamples"] as const).map(
      (field) =>
        [
          (result: DeepMutable<DataBenchmarkResult>) => Reflect.set(result.meta, field, false),
          `data metadata.${field} must be true`,
        ] as const,
    ),
    [
      (result) => (result.sheetwrite["01000"] = sheetwriteRow(result)),
      `duplicate ${KEY};metric=ingest`,
    ],
    [
      (result) => (sheetwriteRow(result).stats.ingest.median = 4),
      `${KEY};metric=ingest.stat contains an impossible finite summary`,
    ],
    [
      (result) => Reflect.deleteProperty(sheetwriteRow(result).stats.ingest, "samples"),
      `${KEY};metric=ingest.samples are missing`,
    ],
    [
      (result) =>
        Reflect.set(
          must(sheetwriteRow(result).queryResources, "query resources"),
          "containsCacheConstructions",
          ROWS,
        ),
      "query resource counters violate structural bounds",
    ],
  ]);
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
