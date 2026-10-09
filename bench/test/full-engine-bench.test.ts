import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { type FullEngineResult, validateFullEngineResult } from "../src/full-engine-bench.js";

function recordedCapture(): FullEngineResult {
  return JSON.parse(
    readFileSync(new URL("../results/full-engine-results.json", import.meta.url), "utf8"),
  ) as FullEngineResult;
}
function firstEngine(result: FullEngineResult) {
  const engine = result.engines[0];
  if (!engine) throw new Error("Missing recorded engine");
  return engine;
}
function firstAnalysis(result: FullEngineResult) {
  const workload = result.analysis[0];
  if (!workload) throw new Error("Missing recorded analysis workload");
  return workload;
}
describe("full engine benchmark evidence", () => {
  it("accepts the complete recorded engine matrix", () => {
    expect(() => validateFullEngineResult(recordedCapture())).not.toThrow();
  });
  it.each(["missing", "duplicate", "unknown"])("rejects %s engines", (fault) => {
    const result = recordedCapture();
    if (fault === "missing") result.engines.pop();
    if (fault === "duplicate") result.engines.push(structuredClone(firstEngine(result)));
    if (fault === "unknown")
      Object.defineProperty(firstEngine(result), "engine", { value: "unknown" });
    expect(() => validateFullEngineResult(result)).toThrow();
  });
  it.each(["raw", "summary", "allocation", "output", "source"])(
    "keeps shared %s validation",
    (fault) => {
      const result = recordedCapture();
      const shared = firstEngine(result).shared;
      const workload = shared.workloads[0];
      if (!workload) throw new Error("Missing shared workload");
      if (fault === "raw") workload.samplesMs.pop();
      if (fault === "summary")
        workload.stat = { ...workload.stat, median: workload.stat.median + 1 };
      if (fault === "allocation") workload.allocationSamples.pop();
      if (fault === "output") workload.output = "wrong";
      if (fault === "source" && shared.source) shared.source.digest = "0".repeat(64);
      expect(() => validateFullEngineResult(result)).toThrow();
    },
  );
  it.each(["raw", "summary", "output", "allocation", "missing"])(
    "rejects invalid analysis %s evidence",
    (fault) => {
      const result = recordedCapture();
      const workload = firstAnalysis(result);
      if (fault === "raw") workload.samplesMs.pop();
      if (fault === "summary") workload.stat = { ...workload.stat, mean: workload.stat.mean + 1 };
      if (fault === "output") workload.output = 0;
      if (fault === "allocation")
        workload.allocationStat.retainedBytes = {
          ...workload.allocationStat.retainedBytes,
          mean: workload.allocationStat.retainedBytes.mean + 1,
        };
      if (fault === "missing") result.analysis.pop();
      expect(() => validateFullEngineResult(result)).toThrow();
    },
  );
  it.each(["raw", "summary", "wasm", "digest", "commit", "binding", "node"])(
    "rejects invalid engine %s evidence",
    (fault) => {
      const result = recordedCapture();
      const engine = firstEngine(result);
      if (fault === "raw") engine.initialization.samplesMs.pop();
      if (fault === "summary")
        engine.initialization.stat = {
          ...engine.initialization.stat,
          mean: engine.initialization.stat.mean + 1,
        };
      if (fault === "wasm") engine.wasm.sha256 = "0".repeat(64);
      if (fault === "digest") result.sourceDigest = "0".repeat(64);
      if (fault === "commit") engine.shared.meta.commit = "0".repeat(40);
      if (fault === "node") engine.initialization.node = "";
      if (fault === "binding") {
        const other = result.engines.find((capture) => capture.engine !== engine.engine);
        if (!other) throw new Error("Missing second engine");
        engine.shared = structuredClone(other.shared);
      }
      expect(() => validateFullEngineResult(result)).toThrow();
    },
  );
});
