import { DEFAULT_SEED } from "./dataset.js";
import type { BenchmarkMode } from "./gate-protocol.js";
import { MATRIX_IDS } from "./gate-protocol.js";
import {
  type EngineId,
  type ParseRenderOptions,
  parseRenderArtifact,
  RENDER_MINIMUM_SAMPLE_MS,
  RENDER_ORDER_SEED,
  RENDER_SCENARIOS,
  RENDER_VIEWPORT,
  type RenderBenchmarkArtifact,
  type RenderRunConfig,
  renderMatrixKey,
  type ScenarioId,
} from "./render-protocol.js";
import { counterbalancedOrder } from "./stats.js";

export const RENDER_FULL_CONFIG: RenderRunConfig = {
  engines: ["sheetwrite", "handsontable"],
  rows: [100_000],
  scenarios: RENDER_SCENARIOS.map((scenario) => scenario.id),
};

export const RENDER_SMOKE_CONFIG: RenderRunConfig = {
  engines: ["sheetwrite"],
  rows: [200],
  scenarios: RENDER_SCENARIOS.map((scenario) => scenario.id),
};

export const RENDER_DATASET_HASHES: Readonly<Record<number, string>> = {
  200: "fnv1a32:cb2b7734",
  100000: "fnv1a32:178eac66",
};

const RENDER_HEAP_CEILING_BYTES = 4 * 1024 * 1024 * 1024;
const RENDER_HEAP_DELTA_CEILING_BYTES = 2 * 1024 * 1024 * 1024;

export interface RenderGatePolicy {
  readonly matrixId: string;
  readonly config: RenderRunConfig;
  readonly rounds: number;
  readonly measuredSamples: number;
  readonly warmupSamples: number;
  readonly minimumSampleDurationMs: number;
}

export const RENDER_GATE_POLICIES: Readonly<Record<BenchmarkMode, RenderGatePolicy>> = {
  full: {
    matrixId: MATRIX_IDS.render.full,
    config: RENDER_FULL_CONFIG,
    rounds: 2,
    measuredSamples: 3,
    warmupSamples: 1,
    minimumSampleDurationMs: RENDER_MINIMUM_SAMPLE_MS,
  },
  smoke: {
    matrixId: MATRIX_IDS.render.smoke,
    config: RENDER_SMOKE_CONFIG,
    rounds: 1,
    measuredSamples: 1,
    warmupSamples: 1,
    minimumSampleDurationMs: RENDER_MINIMUM_SAMPLE_MS,
  },
};

function equal_values<T extends string | number>(
  observed: readonly T[],
  expected: readonly T[],
): boolean {
  return (
    observed.length === expected.length &&
    observed.every((value, index) => value === expected[index])
  );
}

export interface RenderGateOptions extends ParseRenderOptions {
  /** Controlled baseline generation deliberately uses >=10 rounds. */
  readonly rounds?: number;
}

/** Apply deterministic gate policy to the typed benchmark artifact. */
export function validateRenderGateArtifact(
  value: unknown,
  mode: BenchmarkMode,
  options: RenderGateOptions = {},
): RenderBenchmarkArtifact {
  const artifact = parseRenderArtifact(value, options);
  const policy = RENDER_GATE_POLICIES[mode];
  const expected_rounds = options.rounds ?? policy.rounds;
  const config = artifact.config;
  if (
    !equal_values(config.engines, policy.config.engines as readonly EngineId[]) ||
    !equal_values(config.rows, policy.config.rows) ||
    !equal_values(config.scenarios, policy.config.scenarios as readonly ScenarioId[])
  ) {
    throw new Error(`${policy.matrixId} configuration does not match the exact declared matrix`);
  }
  if (
    artifact.metadata.rounds !== expected_rounds ||
    artifact.metadata.measuredSamples !== policy.measuredSamples ||
    artifact.metadata.warmupSamples !== policy.warmupSamples ||
    artifact.metadata.minimumSampleDurationMs !== policy.minimumSampleDurationMs
  ) {
    throw new Error(`${policy.matrixId} sample/warmup protocol does not match the declared matrix`);
  }
  const expected_hashes = Object.fromEntries(
    policy.config.rows.map((rows) => [String(rows), RENDER_DATASET_HASHES[rows]]),
  );
  const expected_order = counterbalancedOrder(
    policy.config.engines,
    expected_rounds,
    RENDER_ORDER_SEED,
  );
  if (
    artifact.metadata.datasetSeed !== DEFAULT_SEED ||
    artifact.metadata.orderSeed !== RENDER_ORDER_SEED ||
    artifact.metadata.viewport.width !== RENDER_VIEWPORT.width ||
    artifact.metadata.viewport.height !== RENDER_VIEWPORT.height ||
    JSON.stringify(artifact.metadata.datasetHashes) !== JSON.stringify(expected_hashes) ||
    JSON.stringify(artifact.metadata.engineOrder) !== JSON.stringify(expected_order)
  ) {
    throw new Error(`${policy.matrixId} metadata does not match the controlled dataset/run policy`);
  }
  if (
    artifact.metadata.launchAttempts.some(
      (attempt) =>
        attempt.round > expected_rounds ||
        !policy.config.engines.includes(attempt.engine) ||
        !policy.config.rows.includes(attempt.rows),
    )
  ) {
    throw new Error(`${policy.matrixId} contains an unexpected browser launch attempt`);
  }
  if (!artifact.completeness.successful) {
    throw new Error(
      `${policy.matrixId} contains failed cells: ${artifact.completeness.failedKeys.join(", ")}`,
    );
  }
  for (const result of artifact.results) {
    if (result.status !== "success") continue;
    const key = renderMatrixKey(result);
    const {
      beforeBytes: before_bytes,
      afterBytes: after_bytes,
      deltaBytes: delta_bytes,
    } = result.memory;
    if (before_bytes === null || after_bytes === null || delta_bytes === null) {
      throw new Error(`${key}.memory is missing`);
    }
    if (
      !Number.isSafeInteger(before_bytes) ||
      !Number.isSafeInteger(after_bytes) ||
      !Number.isSafeInteger(delta_bytes) ||
      before_bytes < 0 ||
      after_bytes < 0
    ) {
      throw new Error(`${key}.memory must contain finite non-negative integer heap samples`);
    }
    if (
      before_bytes >= RENDER_HEAP_CEILING_BYTES ||
      after_bytes >= RENDER_HEAP_CEILING_BYTES ||
      Math.abs(delta_bytes) >= RENDER_HEAP_DELTA_CEILING_BYTES
    ) {
      throw new Error(`${key}.memory exceeded the broad renderer heap safety ceiling`);
    }
    if (result.scenarioId === "formatted-paint.top-left") {
      if (!result.resources) throw new Error(`${key}.resources is missing`);
      const expected =
        result.engine === "sheetwrite"
          ? {
              compiledFormats: 2,
              numberFormatters: 1,
              dateTimeFormatters: 1,
              formatCacheEntries: 2,
              numberFormatterCacheEntries: 1,
              dateTimeFormatterCacheEntries: 1,
            }
          : {
              compiledFormats: 0,
              numberFormatters: 0,
              dateTimeFormatters: 0,
              formatCacheEntries: 0,
              numberFormatterCacheEntries: 0,
              dateTimeFormatterCacheEntries: 0,
            };
      if (JSON.stringify(result.resources) !== JSON.stringify(expected)) {
        throw new Error(`${key}.resources does not match bounded formatter construction`);
      }
    }
    if (result.scenarioId === "merge-heavy.paint") {
      if (!result.mergeResources) throw new Error(`${key}.mergeResources is missing`);
      const { indexConstructions: index_constructions, candidatesExamined: candidates_examined } =
        result.mergeResources;
      if (result.engine === "sheetwrite") {
        if (
          index_constructions !== 1 ||
          candidates_examined <= 0 ||
          candidates_examined > (result.operationCount + 1) * 1_000
        ) {
          throw new Error(`${key}.mergeResources exceeded the visible-intersection budget`);
        }
      } else if (index_constructions !== 0 || candidates_examined !== 0) {
        throw new Error(`${key}.mergeResources must be zero for the comparison engine`);
      }
    }
  }
  return artifact;
}
