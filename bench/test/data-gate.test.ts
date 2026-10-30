import { describe, expect, spyOn, test } from "bun:test";

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
  assertGateIdentity,
  DATA_GATE_PROTOCOL_VERSION,
  MATRIX_IDS,
  PERFORMANCE_GATE_PROTOCOL_VERSION,
} from "../src/gate-protocol.js";
import { createHandsontable } from "../src/handsontable-runtime.js";
import { summarize } from "../src/stats.js";

interface FixtureOptions {
  readonly omitWorkload?: string;
  readonly duplicateRow?: boolean;
  readonly unexpectedWorkload?: boolean;
  readonly invalidP95?: boolean;
  readonly impossibleSummary?: boolean;
  readonly omitMemory?: boolean;
  readonly invalidQueryResources?: boolean;
  readonly omitSamples?: boolean;
}

function engineResult(rows: number, options: FixtureOptions = {}): EngineResult {
  const base = summarize([1, 2, 3]);
  const statsByKey: Record<string, DataStat> = {};
  for (const workload of WORKLOADS) {
    if (workload === options.omitWorkload) continue;
    statsByKey[workload] = {
      ...base,
      p95: options.invalidP95 && workload === "ingest" ? Number.POSITIVE_INFINITY : base.p95,
      median: options.impossibleSummary && workload === "ingest" ? 4 : base.median,
      samples: options.omitSamples && workload === "ingest" ? undefined! : [1, 2, 3],
    };
  }
  if (options.unexpectedWorkload) statsByKey.notDeclared = { ...summarize([1]), samples: [1] };
  const stats = statsByKey as EngineResult["stats"];
  const rowWithoutMemory = {
    rows,
    stats,
    queries: Object.fromEntries(
      QUERY_SCENARIOS.map((scenario) => [scenario, { ...base, samples: [1, 2, 3] }]),
    ),
    notes: {},
    queryResources: {
      composedFilterMatches: 500,
      containsCacheConstructions: options.invalidQueryResources ? rows : 2,
      lowDistinctCount: 7,
      highDistinctCount: rows,
      ownedDistinctStrings: rows + 7,
    },
  };
  const result: EngineResult = {
    ...rowWithoutMemory,
    memory: { heapDeltaBytes: 1024, wasmDeltaBytes: 2048 },
  };
  if (options.omitMemory) Reflect.deleteProperty(result, "memory");
  return result;
}

function smokeFixture(options: FixtureOptions = {}): DataBenchmarkResult {
  const row = engineResult(1_000, options);
  return {
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
      sheetwriteRows: [1_000],
      handsontableRows: [],
      gcBetweenSamples: true,
      freshDocumentBetweenIngestSamples: true,
    },
    sheetwrite: options.duplicateRow ? { "1000": row, "01000": row } : { "1000": row },
    handsontable: {},
  };
}

describe("data benchmark exact matrix", () => {
  test("requires semantic versions for both measured engines", () => {
    const valid = smokeFixture();
    expect(() => validateDataBenchmark(valid)).not.toThrow();
    for (const engine of ["sheetwrite", "handsontable"] as const) {
      for (const version of [undefined, "", "18", "^18.1.2", "01.2.3"]) {
        const invalid = {
          ...valid,
          meta: {
            ...valid.meta,
            engineVersions: { ...valid.meta.engineVersions, [engine]: version },
          },
        };
        expect(() => validateDataBenchmark(invalid as DataBenchmarkResult)).toThrow(
          `engineVersions.${engine}`,
        );
      }
    }
  });

  test("rejects missing, duplicate, unexpected, and non-finite cells with canonical keys", () => {
    expect(() => validateDataBenchmark(smokeFixture({ omitWorkload: "ingest" }), "smoke")).toThrow(
      "missing engine=sheetwrite;rows=1000;metric=ingest",
    );
    expect(() => validateDataBenchmark(smokeFixture({ omitMemory: true }), "smoke")).toThrow(
      "missing engine=sheetwrite;rows=1000;metric=memory",
    );
    expect(() => validateDataBenchmark(smokeFixture({ duplicateRow: true }), "smoke")).toThrow(
      "duplicate engine=sheetwrite;rows=1000;metric=ingest",
    );
    expect(() =>
      validateDataBenchmark(smokeFixture({ unexpectedWorkload: true }), "smoke"),
    ).toThrow("unexpected engine=sheetwrite;rows=1000;metric=notDeclared");
    expect(() => validateDataBenchmark(smokeFixture({ invalidP95: true }), "smoke")).toThrow(
      "engine=sheetwrite;rows=1000;metric=ingest.stat.p95 must be finite",
    );
    expect(() => validateDataBenchmark(smokeFixture({ impossibleSummary: true }), "smoke")).toThrow(
      "engine=sheetwrite;rows=1000;metric=ingest.stat contains an impossible finite summary",
    );
    expect(() => validateDataBenchmark(smokeFixture({ omitSamples: true }), "smoke")).toThrow(
      "engine=sheetwrite;rows=1000;metric=ingest.samples are missing",
    );
  });

  test("rejects artifacts sampled without the forced GC between samples", () => {
    const valid = smokeFixture();
    expect(() =>
      validateDataBenchmark(
        {
          ...valid,
          protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
        } as unknown as DataBenchmarkResult,
        "smoke",
      ),
    ).toThrow("data stale protocol: expected 2, observed 1");
    // A v1 artifact keeps its old matrix id; it was sampled without the GC.
    expect(() => validateDataBenchmark({ ...valid, matrixId: "data-smoke-v1" }, "smoke")).toThrow(
      "data stale matrix",
    );
    const { gcBetweenSamples: _omitted, ...metaWithoutGc } = valid.meta;
    for (const meta of [metaWithoutGc, { ...valid.meta, gcBetweenSamples: false }]) {
      const invalid = { ...valid, meta } as unknown as DataBenchmarkResult;
      expect(() => validateDataBenchmark(invalid, "smoke")).toThrow(
        "data metadata.gcBetweenSamples must be true",
      );
    }
  });

  test("keeps the other benchmark families on their existing protocol", () => {
    for (const family of ["formula", "paged", "range", "render"] as const) {
      const identity = {
        protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
        mode: "smoke" as const,
        matrixId: MATRIX_IDS[family].smoke,
      };
      expect(() => assertGateIdentity(family, "smoke", identity)).not.toThrow();
      expect(() =>
        assertGateIdentity(family, "smoke", {
          ...identity,
          protocolVersion: DATA_GATE_PROTOCOL_VERSION,
        }),
      ).toThrow(`${family} stale protocol: expected 1, observed 2`);
    }
  });

  test("requires fresh documents for the ingest sampling method", () => {
    const valid = smokeFixture();
    const { freshDocumentBetweenIngestSamples: _omitted, ...metaWithoutFreshDocument } = valid.meta;
    for (const meta of [
      metaWithoutFreshDocument,
      { ...valid.meta, freshDocumentBetweenIngestSamples: false },
    ]) {
      expect(() =>
        validateDataBenchmark({ ...valid, meta } as unknown as DataBenchmarkResult, "smoke"),
      ).toThrow("data metadata.freshDocumentBetweenIngestSamples must be true");
    }
  });

  test("requires bounded query resources and exact distinct sentinels", () => {
    expect(() =>
      validateDataBenchmark(smokeFixture({ invalidQueryResources: true }), "smoke"),
    ).toThrow("query resource counters violate structural bounds");
  });
});

describe("data sample lifecycle", () => {
  test("collects after every Sheetwrite sample and closes each ingest document", async () => {
    const collectedDocuments: Document[] = [];
    const disposalsAtCollection: number[] = [];
    const dispose = spyOn(SheetwriteStore.prototype, "dispose");
    const gc = spyOn(Bun, "gc").mockImplementation((full) => {
      expect(full).toBe(true);
      collectedDocuments.push(document);
      disposalsAtCollection.push(dispose.mock.calls.length);
      return 0;
    });

    try {
      const rows = 1_000;
      const results = await runSheetwriteDataBench([rows], "smoke");
      const result = results.get(rows);
      if (!result) throw new Error("Sheetwrite omitted the requested row size");
      const allStats = [...Object.values(result.stats), ...Object.values(result.queries ?? {})];
      // Each workload collects after its final warm-up and every timed sample;
      // one more GC runs once all of this engine's stores have been released.
      const expectedCollections = allStats.reduce((count, stat) => count + stat.iters + 1, 1);
      expect(gc).toHaveBeenCalledTimes(expectedCollections);
      expect(result.stats.ingest.samples).toHaveLength(7);
      expect(result.stats.windowRead.samples).toHaveLength(300);
      expect(result.stats.aggregate.samples).toHaveLength(200);
      expect(result.queries?.["ingest-numeric-only"]?.samples).toHaveLength(7);

      // The first eight collections follow the warm-up and seven ingests. A
      // fresh document must already be installed before each post-sample GC.
      const ingestCollections = collectedDocuments.slice(0, 8);
      expect(new Set(ingestCollections).size).toBe(8);
      expect(ingestCollections.at(-1)).not.toBe(document);
      // Each ingest store must be disposed before that sample's GC, rather
      // than left alive until the next iteration or workload starts.
      const firstDisposals = disposalsAtCollection[0];
      if (firstDisposals === undefined) throw new Error("No post-warm-up collection occurred");
      expect(disposalsAtCollection.slice(0, 8)).toEqual(
        Array.from({ length: 8 }, (_, index) => firstDisposals + index),
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
});
