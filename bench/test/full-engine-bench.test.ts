import { expect, it } from "bun:test";

import { formulaSourceDigest } from "../src/formula-bench.js";
import { type FullEngineResult, validateFullEngineResult } from "../src/full-engine-bench.js";
import { expectRejections, must, type Rejection } from "./gate-fixtures.js";

const RECORDED = (await Bun.file(
  new URL("../results/full-engine-results.json", import.meta.url),
).json()) as FullEngineResult;
const recorded = () => structuredClone(RECORDED);
const firstEngine = (result: FullEngineResult) => must(result.engines[0], "engine");
const sharedWorkload = (result: FullEngineResult) =>
  must(firstEngine(result).shared.workloads[0], "shared workload");
const analysis = (result: FullEngineResult) => must(result.analysis[0], "analysis workload");
const ZERO_DIGEST = "0".repeat(64);

/** Files the shared capture's engine hashes under `packages/<enginePackage>/`, as a new capture does. */
function rekeyShared(
  result: FullEngineResult,
  engineId: string,
  enginePackage: string,
): FullEngineResult {
  const source = must(
    result.engines.find((engine) => engine.engine === engineId)?.shared.source,
    engineId,
  );
  source.files = Object.fromEntries(
    Object.entries(source.files)
      .map(([path, digest]) => [
        path.replace("packages/wasm/", `packages/${enginePackage}/`),
        digest,
      ])
      .toSorted(([left = ""], [right = ""]) => left.localeCompare(right)),
  );
  source.digest = formulaSourceDigest(source.commit, source.files, source.baselineContext);
  return result;
}

it("accepts the recorded matrix and engine hashes keyed by the package the full engine loaded", () => {
  expect(() => validateFullEngineResult(recorded())).not.toThrow();
  expect(() => validateFullEngineResult(rekeyShared(recorded(), "full", "formulas"))).not.toThrow();
});

it("rejects drifted engines, shared workloads, analysis and engine evidence", () => {
  const rejections: Rejection<FullEngineResult>[] = [
    [
      "default engine under the full package",
      (result) => rekeyShared(result, "default", "formulas"),
    ],
    ["missing engine", (result) => result.engines.pop()],
    ["duplicate engine", (result) => result.engines.push(structuredClone(firstEngine(result)))],
    [
      "unknown engine",
      (result) => Object.defineProperty(firstEngine(result), "engine", { value: "unknown" }),
    ],
    ["shared raw", (result) => sharedWorkload(result).samplesMs.pop()],
    [
      "shared summary",
      (result) => {
        const workload = sharedWorkload(result);
        workload.stat = { ...workload.stat, median: workload.stat.median + 1 };
      },
    ],
    ["shared allocation", (result) => sharedWorkload(result).allocationSamples.pop()],
    ["shared output", (result) => (sharedWorkload(result).output = "wrong")],
    [
      "shared source",
      (result) => (must(firstEngine(result).shared.source, "source").digest = ZERO_DIGEST),
    ],
    ["analysis raw", (result) => analysis(result).samplesMs.pop()],
    [
      "analysis summary",
      (result) =>
        (analysis(result).stat = {
          ...analysis(result).stat,
          mean: analysis(result).stat.mean + 1,
        }),
    ],
    ["analysis output", (result) => (analysis(result).output = 0)],
    [
      "analysis allocation",
      (result) => {
        const { allocationStat } = analysis(result);
        allocationStat.retainedBytes = {
          ...allocationStat.retainedBytes,
          mean: allocationStat.retainedBytes.mean + 1,
        };
      },
    ],
    ["analysis missing", (result) => result.analysis.pop()],
    ["engine raw", (result) => firstEngine(result).initialization.samplesMs.pop()],
    [
      "engine summary",
      (result) => {
        const { initialization } = firstEngine(result);
        initialization.stat = { ...initialization.stat, mean: initialization.stat.mean + 1 };
      },
    ],
    ["engine wasm", (result) => (firstEngine(result).wasm.sha256 = ZERO_DIGEST)],
    ["source digest", (result) => (result.sourceDigest = ZERO_DIGEST)],
    ["engine commit", (result) => (firstEngine(result).shared.meta.commit = "0".repeat(40))],
    ["engine node", (result) => (firstEngine(result).initialization.node = "")],
    [
      "engine binding",
      (result) => {
        const engine = firstEngine(result);
        const other = must(
          result.engines.find((capture) => capture.engine !== engine.engine),
          "second engine",
        );
        engine.shared = structuredClone(other.shared);
      },
    ],
  ];
  expectRejections(recorded, validateFullEngineResult, rejections);
});
