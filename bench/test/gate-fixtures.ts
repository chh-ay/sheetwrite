import { expect } from "bun:test";

import { DEFAULT_SEED } from "../src/dataset.js";
import type { ControlledRunnerFingerprint, HarnessFingerprint } from "../src/gate-protocol.js";
import { RENDER_DATASET_HASHES } from "../src/render-gate.js";
import {
  type BrowserLaunchAttempt,
  type EngineId,
  type FailedScenario,
  RENDER_ORDER_SEED,
  RENDER_PROTOCOL_VERSION,
  RENDER_SCENARIOS,
  type RenderBenchmarkArtifact,
  type RenderRunConfig,
  type ScenarioId,
  type ScenarioResult,
  scenarioGroup,
  summarizeCompleteness,
} from "../src/render-protocol.js";
import { counterbalancedOrder, summarizeFinite } from "../src/stats.js";

export const TEST_RUNNER: ControlledRunnerFingerprint = {
  os: "linux test",
  arch: "x64",
  cpu: "controlled cpu",
  bun: "1.3.14",
  node: "24.3.0",
  browser: "Chromium 140",
  powerMode: "performance",
  concurrency: 1,
};

export const TEST_HARNESS: HarnessFingerprint = {
  digest: "sha256:test",
  protocol: "performance=1;render=1",
  matrix: "render-full-v1",
  dataset: "seed=test;schema=test",
  sampling: "measured=3;warmup=1;minimum-sample-ms=100;order-seed=test",
  schema: "typed-render-artifact-v1;controlled-baseline-v2",
  sources: { "bench/src/render-protocol.ts": "sha256:source" },
};

/** Returns `value`, or fails the test with the missing fixture part. */
export function must<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw new Error(`fixture has no ${label}`);
  return value;
}

/** A writable view of a fixture, so a test can corrupt any field of its copy. */
export type DeepMutable<T> = T extends boolean
  ? boolean
  : T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
      : T;

export function mutableCopy<T>(value: T): DeepMutable<T> {
  // A structured clone has the same shape; only the readonly modifiers differ.
  return structuredClone(value) as unknown as DeepMutable<T>;
}

/** One rejection case: an edit of a fresh valid fixture, and the expected error. */
export type Rejection<T> = readonly [edit: (value: T) => void, error?: string | RegExp];

/** Applies each edit to a fresh fixture and expects `validate` to reject the result. */
export function expectRejections<T>(
  fixture: () => T,
  validate: (value: T) => unknown,
  rejections: readonly Rejection<T>[],
): void {
  for (const [index, [edit, error]] of rejections.entries()) {
    const value = fixture();
    edit(value);
    expect(() => validate(value), `rejection ${index}: ${String(error)}`).toThrow(error);
  }
}

interface RenderFixtureOptions {
  readonly rounds?: number;
  readonly engines?: readonly EngineId[];
  readonly rows?: readonly number[];
  readonly scenarios?: readonly ScenarioId[];
  readonly measuredSamples?: number;
  readonly warmupSamples?: number;
  readonly timestamp?: string;
  readonly commit?: string;
  readonly samples?: (round: number, engine: EngineId, scenarioId: ScenarioId) => readonly number[];
}

/** Formatter and merge-index counters; Handsontable reports none. */
function scenarioResources(engine: EngineId, scenarioId: ScenarioId) {
  const count = engine === "sheetwrite" ? 1 : 0;
  if (scenarioId === "formatted-paint.top-left") {
    const [formats, formatters] = [2 * count, count];
    return {
      resources: {
        compiledFormats: formats,
        numberFormatters: formatters,
        dateTimeFormatters: formatters,
        formatCacheEntries: formats,
        numberFormatterCacheEntries: formatters,
        dateTimeFormatterCacheEntries: formatters,
      },
    };
  }
  if (scenarioId === "merge-heavy.paint") {
    return { mergeResources: { indexConstructions: count, candidatesExamined: 100 * count } };
  }
  return {};
}

export function makeRenderArtifact(options: RenderFixtureOptions = {}): RenderBenchmarkArtifact {
  const rounds = options.rounds ?? 2;
  const engines = options.engines ?? (["sheetwrite", "handsontable"] as const);
  const rows = options.rows ?? [100_000];
  const measuredSamples = options.measuredSamples ?? 3;
  const runId = "00000000-0000-4000-8000-000000000052";
  const config: RenderRunConfig = {
    engines,
    rows,
    scenarios: options.scenarios ?? RENDER_SCENARIOS.map((scenario) => scenario.id),
  };
  const results: ScenarioResult[] = [];
  const launchAttempts: BrowserLaunchAttempt[] = [];
  for (let round = 1; round <= rounds; round++) {
    for (const engine of engines) {
      for (const rowCount of rows) {
        launchAttempts.push({
          round,
          engine,
          rows: rowCount,
          attempt: 1,
          success: true,
          errorClass: null,
          message: null,
        });
        for (const scenarioId of config.scenarios) {
          const values =
            options.samples?.(round, engine, scenarioId) ??
            Array.from({ length: measuredSamples }, () => 10);
          if (values.length !== measuredSamples) {
            throw new Error("fixture sample callback returned the wrong sample count");
          }
          const summary = summarizeFinite(values);
          results.push({
            runId,
            round,
            engine,
            rows: rowCount,
            scenarioId,
            group: scenarioGroup(scenarioId),
            status: "success",
            operationCount: measuredSamples * 100,
            rawSamples: values.map((perOperationMs, index) => ({
              index,
              durationMs: perOperationMs * 100,
              operationCount: 100,
              perOperationMs,
            })),
            medianMs: summary.median,
            p95Ms: summary.p95,
            madMs: summary.mad,
            validation: [
              {
                checkpoint: "canonical state",
                expected: "correct",
                observed: "correct",
                passed: true,
              },
            ],
            memory: { beforeBytes: 1_000, afterBytes: 1_100, deltaBytes: 100 },
            ...scenarioResources(engine, scenarioId),
          });
        }
      }
    }
  }
  return {
    protocolVersion: RENDER_PROTOCOL_VERSION,
    runId,
    metadata: {
      commit: options.commit ?? "2c10118",
      dirty: false,
      timestamp: options.timestamp ?? new Date().toISOString(),
      bunVersion: TEST_RUNNER.bun,
      nodeVersion: TEST_RUNNER.node,
      browserVersion: TEST_RUNNER.browser,
      os: TEST_RUNNER.os,
      arch: TEST_RUNNER.arch,
      cpu: TEST_RUNNER.cpu,
      engineVersions: { sheetwrite: "0.0.0", handsontable: "18.0.0" },
      datasetSeed: DEFAULT_SEED,
      datasetHashes: Object.fromEntries(
        rows.map((rowCount) => [String(rowCount), must(RENDER_DATASET_HASHES[rowCount], "hash")]),
      ),
      viewport: { width: 640, height: 480 },
      measuredSamples,
      warmupSamples: options.warmupSamples ?? 1,
      minimumSampleDurationMs: 100,
      rounds,
      orderSeed: RENDER_ORDER_SEED,
      engineOrder: counterbalancedOrder(engines, rounds, RENDER_ORDER_SEED),
      launchAttempts,
    },
    config,
    results,
    completeness: summarizeCompleteness(config, rounds, results),
    reproductionCommands: ["fixture"],
  };
}

/** The exact `render-smoke-v1` matrix: one round of Sheetwrite at 200 rows. */
export function makeSmokeRenderArtifact(): RenderBenchmarkArtifact {
  return makeRenderArtifact({
    rounds: 1,
    engines: ["sheetwrite"],
    rows: [200],
    measuredSamples: 1,
  });
}

/** `artifact` with its first cell replaced by a typed failure, completeness recomputed. */
export function withFailedFirstCell(
  artifact: RenderBenchmarkArtifact,
  failure: Partial<FailedScenario> = {},
): RenderBenchmarkArtifact {
  const [source, ...rest] = artifact.results;
  const first = must(source, "first render cell");
  const failed: FailedScenario = {
    runId: first.runId,
    round: first.round,
    engine: first.engine,
    rows: first.rows,
    scenarioId: first.scenarioId,
    group: first.group,
    status: "failed",
    stage: "measure",
    errorClass: "Error",
    message: "crashed",
    timeout: false,
    crash: true,
    consoleErrors: [],
    pageErrors: [],
    partialSamples: [],
    validation: [],
    memory: { beforeBytes: null, afterBytes: null, deltaBytes: null },
    ...failure,
  };
  const results = [failed, ...rest];
  return {
    ...artifact,
    results,
    completeness: summarizeCompleteness(artifact.config, artifact.metadata.rounds, results),
  };
}
