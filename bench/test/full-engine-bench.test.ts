import { expect, it } from "bun:test";

import { formulaSourceDigest } from "../src/formula-artifact.js";
import { type FullEngineResult, validateFullEngineResult } from "../src/full-engine-bench.js";
import { expectRejections, must, type Rejection } from "./gate-fixtures.js";

const RECORDED = (await Bun.file(
  new URL("../results/full-engine-results.json", import.meta.url),
).json()) as FullEngineResult;
const recorded = () => structuredClone(RECORDED);
const first_engine = (result: FullEngineResult) => must(result.engines[0], "engine");
const shared_workload = (result: FullEngineResult) =>
  must(first_engine(result).shared.workloads[0], "shared workload");
const analysis = (result: FullEngineResult) => must(result.analysis[0], "analysis workload");
const ZERO_DIGEST = "0".repeat(64);

/** Files the shared capture's engine hashes under `packages/<engine_package>/`, as a new capture does. */
function rekey_shared(
  result: FullEngineResult,
  engine_id: string,
  engine_package: string,
): FullEngineResult {
  const source = must(
    result.engines.find((engine) => engine.engine === engine_id)?.shared.source,
    engine_id,
  );
  source.files = Object.fromEntries(
    Object.entries(source.files)
      .map(([path, digest]) => [
        path.replace("packages/wasm/", `packages/${engine_package}/`),
        digest,
      ])
      .toSorted(([left = ""], [right = ""]) => left.localeCompare(right)),
  );
  source.digest = formulaSourceDigest(source.commit, source.files, source.baselineContext);
  return result;
}

it("accepts the recorded matrix and engine hashes keyed by the package the full engine loaded", () => {
  expect(() => validateFullEngineResult(recorded())).not.toThrow();
  expect(() =>
    validateFullEngineResult(rekey_shared(recorded(), "full", "formulas")),
  ).not.toThrow();
});

it("rejects drifted engines, shared workloads, analysis and engine evidence", () => {
  const rejections: Rejection<FullEngineResult>[] = [
    [(result) => rekey_shared(result, "default", "formulas")],
    [(result) => result.engines.pop()],
    [(result) => (shared_workload(result).output = "wrong")],
    [(result) => (analysis(result).output = 0)],
    [(result) => result.analysis.pop()],
    [
      (result) =>
        (analysis(result).stat = {
          ...analysis(result).stat,
          mean: analysis(result).stat.mean + 1,
        }),
    ],
    [
      (result) => {
        const { allocationStat: allocation_stat } = analysis(result);
        allocation_stat.retainedBytes = {
          ...allocation_stat.retainedBytes,
          mean: allocation_stat.retainedBytes.mean + 1,
        };
      },
    ],
    [(result) => first_engine(result).initialization.samplesMs.pop()],
    [
      (result) => {
        const { initialization } = first_engine(result);
        initialization.stat = { ...initialization.stat, mean: initialization.stat.mean + 1 };
      },
    ],
    [(result) => (first_engine(result).wasm.sha256 = ZERO_DIGEST)],
    [(result) => (result.sourceDigest = ZERO_DIGEST)],
    [(result) => (first_engine(result).shared.meta.commit = "0".repeat(40))],
    [(result) => (first_engine(result).initialization.node = "")],
    [
      (result) => {
        const engine = first_engine(result);
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
