import { validateEngineVersions } from "./engine-versions.js";
import type { AggregateSample } from "./stats.js";
import { counterbalancedOrder, summarizeFinite } from "./stats.js";

export const RENDER_PROTOCOL_VERSION = 1;
export const RENDER_MINIMUM_SAMPLE_MS = 100;
export const RENDER_MAX_LAUNCH_ATTEMPTS = 2;
export const RENDER_VIEWPORT = { width: 640, height: 480 } as const;
export const RENDER_ORDER_SEED = 0x51c0ffee;
export const WINDOW_TRANSFER_ORDER_SEED = 0x57494e44;
export const WINDOW_TRANSFER_BASELINE_SCENARIO_ID = "window-transfer.scroll.baseline" as const;
export const WINDOW_TRANSFER_UPPER_BOUND_SCENARIO_ID =
  "window-transfer.scroll.reuse-decoded-view-upper-bound" as const;
export const WINDOW_TRANSFER_SCENARIO_IDS = [
  WINDOW_TRANSFER_BASELINE_SCENARIO_ID,
  WINDOW_TRANSFER_UPPER_BOUND_SCENARIO_ID,
] as const;
export type WindowTransferScenarioId = (typeof WINDOW_TRANSFER_SCENARIO_IDS)[number];
export type RenderDataValidity = "product-valid" | "pixel-data-invalid";

export const ENGINE_IDS = ["sheetwrite", "handsontable"] as const;
export type EngineId = (typeof ENGINE_IDS)[number];

export type ScenarioGroup =
  | "view-scrolling"
  | "editing"
  | "altering"
  | "arrow-keys-navigation"
  | "formatting"
  | "merges"
  | "formulae"
  | "geometry";

export const RENDER_SCENARIOS = [
  { id: "scroll-down.top-left", group: "view-scrolling" },
  { id: "scroll-down.middle", group: "view-scrolling" },
  { id: "scroll-smooth.same-window", group: "view-scrolling" },
  { id: "scroll-right.top-left", group: "view-scrolling" },
  { id: "edit-open.top-left", group: "editing" },
  { id: "edit-open.middle", group: "editing" },
  { id: "edit-open.bottom-right", group: "editing" },
  { id: "edit-commit.middle", group: "editing" },
  { id: "altering.insert-5-rows-top", group: "altering" },
  { id: "altering.remove-5-rows-top", group: "altering" },
  { id: "arrow-down.top-left", group: "arrow-keys-navigation" },
  { id: "arrow-right.middle", group: "arrow-keys-navigation" },
  { id: "formatted-paint.top-left", group: "formatting" },
  { id: "merge-heavy.paint", group: "merges" },
] as const satisfies readonly { readonly id: string; readonly group: ScenarioGroup }[];

export const DIAGNOSTIC_RENDER_SCENARIOS = [
  { id: "formula-dense.paint", group: "formulae" },
  { id: "text-heavy.long-scroll", group: "view-scrolling" },
  { id: "wrap-heavy.scroll", group: "view-scrolling" },
  { id: "search-many.scroll", group: "view-scrolling" },
  { id: "frozen.scroll", group: "view-scrolling" },
  { id: "hscroll-small", group: "view-scrolling" },
  { id: "cond-format.scroll", group: "formatting" },
  { id: "number-format.hscroll", group: "formatting" },
  { id: "scroll-fractional.same-window", group: "view-scrolling" },
  { id: "geometry-unresized.1m", group: "geometry" },
  { id: "wrap-unicode.paint.200", group: "formatting" },
  { id: "wrap-unicode.paint.2000", group: "formatting" },
  { id: "wrap-unicode.paint.20000", group: "formatting" },
  { id: WINDOW_TRANSFER_BASELINE_SCENARIO_ID, group: "view-scrolling" },
  { id: WINDOW_TRANSFER_UPPER_BOUND_SCENARIO_ID, group: "view-scrolling" },
] as const satisfies readonly { readonly id: string; readonly group: ScenarioGroup }[];

export const ALL_RENDER_SCENARIOS = [...RENDER_SCENARIOS, ...DIAGNOSTIC_RENDER_SCENARIOS] as const;

export type ScenarioId = (typeof ALL_RENDER_SCENARIOS)[number]["id"];

export function scenarioDataValidity(scenarioId: ScenarioId): RenderDataValidity | undefined {
  if (scenarioId === WINDOW_TRANSFER_BASELINE_SCENARIO_ID) return "product-valid";
  if (scenarioId === WINDOW_TRANSFER_UPPER_BOUND_SCENARIO_ID) return "pixel-data-invalid";
  return undefined;
}
export type FailureStage =
  | "build"
  | "launch"
  | "mount"
  | "warmup"
  | "measure"
  | "validate"
  | "teardown";

export interface ScenarioIdentity {
  readonly runId: string;
  readonly round: number;
  readonly engine: EngineId;
  readonly rows: number;
  readonly scenarioId: ScenarioId;
  readonly group: ScenarioGroup;
  /** Required only for the controlled visible-window transfer diagnostic pair. */
  readonly dataValidity?: RenderDataValidity;
}

export interface ValidationObservation {
  readonly checkpoint: string;
  readonly expected: string;
  readonly observed: string;
  readonly passed: boolean;
}

export interface MemoryDelta {
  readonly beforeBytes: number | null;
  readonly afterBytes: number | null;
  readonly deltaBytes: number | null;
}

export interface RenderResourceMetrics {
  readonly compiledFormats: number;
  readonly numberFormatters: number;
  readonly dateTimeFormatters: number;
  readonly formatCacheEntries: number;
  readonly numberFormatterCacheEntries: number;
  readonly dateTimeFormatterCacheEntries: number;
}

export interface MergeIndexResourceMetrics {
  readonly indexConstructions: number;
  readonly candidatesExamined: number;
}

export interface WindowTransferMetrics {
  /** Timed paint calls completed by the coordinator. */
  readonly logicalFrames: number;
  /** Visible-window reads requested by the coordinator. */
  readonly windowReadRequests: number;
  /** Requests that performed a fresh WASM window read and decode. */
  readonly logicalWindowReads: number;
  /** Exact copied WASM-to-JS output payload bytes. */
  readonly copiedBytes: number;
  /** Exact consuming output-accessor return allocations. */
  readonly outputAllocationEvents: number;
  readonly copiedBytesPerLogicalFrame: number;
  readonly outputAllocationEventsPerLogicalFrame: number;
  readonly copiedBytesPerLogicalRead: number | null;
  readonly outputAllocationEventsPerLogicalRead: number | null;
}

export function createWindowTransferMetrics(input: {
  readonly logicalFrames: number;
  readonly windowReadRequests: number;
  readonly logicalWindowReads: number;
  readonly copiedBytes: number;
  readonly outputAllocationEvents: number;
}): WindowTransferMetrics {
  if (
    !Number.isSafeInteger(input.logicalFrames) ||
    input.logicalFrames <= 0 ||
    !Number.isSafeInteger(input.windowReadRequests) ||
    input.windowReadRequests < 0 ||
    !Number.isSafeInteger(input.logicalWindowReads) ||
    input.logicalWindowReads < 0 ||
    input.logicalWindowReads > input.windowReadRequests ||
    !Number.isSafeInteger(input.copiedBytes) ||
    input.copiedBytes < 0 ||
    !Number.isSafeInteger(input.outputAllocationEvents) ||
    input.outputAllocationEvents < 0
  ) {
    throw new RangeError("invalid visible-window transfer counters");
  }
  return {
    ...input,
    copiedBytesPerLogicalFrame: input.copiedBytes / input.logicalFrames,
    outputAllocationEventsPerLogicalFrame: input.outputAllocationEvents / input.logicalFrames,
    copiedBytesPerLogicalRead:
      input.logicalWindowReads === 0 ? null : input.copiedBytes / input.logicalWindowReads,
    outputAllocationEventsPerLogicalRead:
      input.logicalWindowReads === 0
        ? null
        : input.outputAllocationEvents / input.logicalWindowReads,
  };
}

export interface MeasuredSample extends AggregateSample {
  readonly index: number;
  readonly windowTransfer?: WindowTransferMetrics;
}

export interface SuccessfulScenario extends ScenarioIdentity {
  readonly status: "success";
  readonly operationCount: number;
  readonly rawSamples: readonly MeasuredSample[];
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly madMs: number;
  readonly validation: readonly ValidationObservation[];
  readonly memory: MemoryDelta;
  readonly resources?: RenderResourceMetrics;
  readonly mergeResources?: MergeIndexResourceMetrics;
  readonly windowTransfer?: WindowTransferMetrics;
}

export interface FailedScenario extends ScenarioIdentity {
  readonly status: "failed";
  readonly stage: FailureStage;
  readonly errorClass: string;
  readonly message: string;
  readonly timeout: boolean;
  readonly crash: boolean;
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly partialSamples: readonly MeasuredSample[];
  readonly validation: readonly ValidationObservation[];
  readonly memory: MemoryDelta;
}

export type ScenarioResult = SuccessfulScenario | FailedScenario;

export interface BrowserLaunchAttempt {
  readonly round: number;
  readonly engine: EngineId;
  readonly rows: number;
  readonly attempt: number;
  readonly success: boolean;
  readonly errorClass: string | null;
  readonly message: string | null;
}

export interface RenderRunMetadata {
  readonly commit: string;
  readonly dirty: boolean;
  readonly timestamp: string;
  readonly bunVersion: string;
  readonly nodeVersion: string;
  readonly browserVersion: string;
  readonly os: string;
  readonly arch: string;
  readonly cpu: string;
  readonly engineVersions: Readonly<Record<EngineId, string>>;
  readonly datasetSeed: number;
  readonly datasetHashes: Readonly<Record<string, string>>;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly measuredSamples: number;
  readonly warmupSamples: number;
  readonly minimumSampleDurationMs: number;
  readonly rounds: number;
  readonly orderSeed: number;
  readonly engineOrder: readonly (readonly EngineId[])[];
  readonly launchAttempts: readonly BrowserLaunchAttempt[];
  /** Present only when the controlled window-transfer diagnostic pair is configured. */
  readonly windowTransferScenarioOrder?: readonly (readonly WindowTransferScenarioId[])[];
}

export interface RenderRunConfig {
  readonly engines: readonly EngineId[];
  readonly rows: readonly number[];
  readonly scenarios: readonly ScenarioId[];
}

export interface CompletenessSummary {
  readonly expectedKeys: readonly string[];
  readonly observedKeys: readonly string[];
  readonly missingKeys: readonly string[];
  readonly duplicateKeys: readonly string[];
  readonly unexpectedKeys: readonly string[];
  readonly failedKeys: readonly string[];
  readonly complete: boolean;
  readonly successful: boolean;
}

export interface RenderBenchmarkArtifact {
  readonly protocolVersion: typeof RENDER_PROTOCOL_VERSION;
  readonly runId: string;
  readonly metadata: RenderRunMetadata;
  readonly config: RenderRunConfig;
  readonly results: readonly ScenarioResult[];
  readonly completeness: CompletenessSummary;
  readonly reproductionCommands: readonly string[];
}

export interface BrowserCombinationResult {
  readonly protocolVersion: typeof RENDER_PROTOCOL_VERSION;
  readonly runId: string;
  readonly round: number;
  readonly engine: EngineId;
  readonly rows: number;
  readonly datasetHash: string;
  readonly results: readonly ScenarioResult[];
}

const SCENARIO_GROUPS = new Map<ScenarioId, ScenarioGroup>(
  ALL_RENDER_SCENARIOS.map((scenario) => [scenario.id, scenario.group]),
);

export function scenarioGroup(scenarioId: ScenarioId): ScenarioGroup {
  const group = SCENARIO_GROUPS.get(scenarioId);
  if (!group) throw new RangeError(`unknown render scenario: ${scenarioId}`);
  return group;
}

export function renderMatrixKey(identity: ScenarioIdentity): string {
  return `round=${identity.round};engine=${identity.engine};rows=${identity.rows};scenario=${identity.scenarioId}`;
}

export function expectedMatrixKeys(config: RenderRunConfig, rounds: number): string[] {
  const keys: string[] = [];
  for (let round = 1; round <= rounds; round++) {
    for (const engine of config.engines) {
      for (const rows of config.rows) {
        for (const scenario_id of config.scenarios) {
          keys.push(
            renderMatrixKey({
              runId: "expected",
              round,
              engine,
              rows,
              scenarioId: scenario_id,
              group: scenarioGroup(scenario_id),
            }),
          );
        }
      }
    }
  }
  return keys.sort();
}

export function summarizeCompleteness(
  config: RenderRunConfig,
  rounds: number,
  results: readonly ScenarioResult[],
): CompletenessSummary {
  const expected_keys = expectedMatrixKeys(config, rounds);
  const expected_set = new Set(expected_keys);
  const observed_keys = results.map(renderMatrixKey).sort();
  const counts = new Map<string, number>();
  for (const key of observed_keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  const missing_keys = expected_keys.filter((key) => !counts.has(key));
  const duplicate_keys = [...counts]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort();
  const unexpected_keys = [...counts.keys()].filter((key) => !expected_set.has(key)).sort();
  const failed_keys = results
    .filter((result): result is FailedScenario => result.status === "failed")
    .map(renderMatrixKey)
    .sort();
  const complete =
    missing_keys.length === 0 && duplicate_keys.length === 0 && unexpected_keys.length === 0;
  return {
    expectedKeys: expected_keys,
    observedKeys: observed_keys,
    missingKeys: missing_keys,
    duplicateKeys: duplicate_keys,
    unexpectedKeys: unexpected_keys,
    failedKeys: failed_keys,
    complete,
    successful: complete && failed_keys.length === 0,
  };
}

export interface ParseRenderOptions {
  readonly expectedRunId?: string;
  readonly nowMs?: number;
  readonly maxAgeMs?: number;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value;
}

function text(value: unknown, path: string, allow_empty = false): string {
  if (typeof value !== "string" || (!allow_empty && value.length === 0)) {
    throw new TypeError(`${path} must be ${allow_empty ? "a string" : "a non-empty string"}`);
  }
  return value;
}

function finite(value: unknown, path: string, minimum = Number.NEGATIVE_INFINITY): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new TypeError(`${path} must be a finite number >= ${minimum}`);
  }
  return value;
}

function integer(value: unknown, path: string, minimum = 0): number {
  const parsed = finite(value, path, minimum);
  if (!Number.isInteger(parsed)) throw new TypeError(`${path} must be an integer`);
  return parsed;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean`);
  return value;
}

function nullable_finite(value: unknown, path: string): number | null {
  return value === null ? null : finite(value, path);
}

function enum_value<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new TypeError(`${path} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function string_array(value: unknown, path: string): string[] {
  return array(value, path).map((entry, index) => text(entry, `${path}[${index}]`, true));
}

function parse_observation(value: unknown, path: string): ValidationObservation {
  const input = record(value, path);
  return {
    checkpoint: text(input.checkpoint, `${path}.checkpoint`),
    expected: text(input.expected, `${path}.expected`, true),
    observed: text(input.observed, `${path}.observed`, true),
    passed: bool(input.passed, `${path}.passed`),
  };
}

function parse_memory(value: unknown, path: string): MemoryDelta {
  const input = record(value, path);
  const before_bytes = nullable_finite(input.beforeBytes, `${path}.beforeBytes`);
  const after_bytes = nullable_finite(input.afterBytes, `${path}.afterBytes`);
  const delta_bytes = nullable_finite(input.deltaBytes, `${path}.deltaBytes`);
  const null_values = [before_bytes, after_bytes, delta_bytes].filter(
    (entry) => entry === null,
  ).length;
  if (null_values !== 0 && null_values !== 3) {
    throw new TypeError(`${path} must contain either three numeric values or three null values`);
  }
  if (before_bytes !== null && after_bytes !== null && delta_bytes !== after_bytes - before_bytes) {
    throw new TypeError(`${path}.deltaBytes does not match before/after values`);
  }
  return { beforeBytes: before_bytes, afterBytes: after_bytes, deltaBytes: delta_bytes };
}

function parse_resources(value: unknown, path: string): RenderResourceMetrics {
  const input = record(value, path);
  return {
    compiledFormats: integer(input.compiledFormats, `${path}.compiledFormats`, 0),
    numberFormatters: integer(input.numberFormatters, `${path}.numberFormatters`, 0),
    dateTimeFormatters: integer(input.dateTimeFormatters, `${path}.dateTimeFormatters`, 0),
    formatCacheEntries: integer(input.formatCacheEntries, `${path}.formatCacheEntries`, 0),
    numberFormatterCacheEntries: integer(
      input.numberFormatterCacheEntries,
      `${path}.numberFormatterCacheEntries`,
      0,
    ),
    dateTimeFormatterCacheEntries: integer(
      input.dateTimeFormatterCacheEntries,
      `${path}.dateTimeFormatterCacheEntries`,
      0,
    ),
  };
}

function parse_merge_resources(value: unknown, path: string): MergeIndexResourceMetrics {
  const input = record(value, path);
  return {
    indexConstructions: integer(input.indexConstructions, `${path}.indexConstructions`, 0),
    candidatesExamined: integer(input.candidatesExamined, `${path}.candidatesExamined`, 0),
  };
}

function parse_window_transfer_metrics(value: unknown, path: string): WindowTransferMetrics {
  const input = record(value, path);
  const counters = {
    logicalFrames: integer(input.logicalFrames, `${path}.logicalFrames`, 1),
    windowReadRequests: integer(input.windowReadRequests, `${path}.windowReadRequests`, 0),
    logicalWindowReads: integer(input.logicalWindowReads, `${path}.logicalWindowReads`, 0),
    copiedBytes: integer(input.copiedBytes, `${path}.copiedBytes`, 0),
    outputAllocationEvents: integer(
      input.outputAllocationEvents,
      `${path}.outputAllocationEvents`,
      0,
    ),
  };
  const expected = createWindowTransferMetrics(counters);
  const observed = {
    copiedBytesPerLogicalFrame: finite(
      input.copiedBytesPerLogicalFrame,
      `${path}.copiedBytesPerLogicalFrame`,
      0,
    ),
    outputAllocationEventsPerLogicalFrame: finite(
      input.outputAllocationEventsPerLogicalFrame,
      `${path}.outputAllocationEventsPerLogicalFrame`,
      0,
    ),
    copiedBytesPerLogicalRead: nullable_finite(
      input.copiedBytesPerLogicalRead,
      `${path}.copiedBytesPerLogicalRead`,
    ),
    outputAllocationEventsPerLogicalRead: nullable_finite(
      input.outputAllocationEventsPerLogicalRead,
      `${path}.outputAllocationEventsPerLogicalRead`,
    ),
  };
  for (const field of [
    "copiedBytesPerLogicalFrame",
    "outputAllocationEventsPerLogicalFrame",
    "copiedBytesPerLogicalRead",
    "outputAllocationEventsPerLogicalRead",
  ] as const) {
    if (observed[field] !== expected[field]) {
      throw new TypeError(`${path}.${field} does not match its exact counters`);
    }
  }
  return expected;
}

function parse_sample(value: unknown, path: string): MeasuredSample {
  const input = record(value, path);
  const duration_ms = finite(input.durationMs, `${path}.durationMs`, 0);
  const operation_count = integer(input.operationCount, `${path}.operationCount`, 1);
  const per_operation_ms = finite(input.perOperationMs, `${path}.perOperationMs`, 0);
  const expected_per_operation = duration_ms / operation_count;
  if (
    Math.abs(per_operation_ms - expected_per_operation) >
    Number.EPSILON * Math.max(1, duration_ms)
  ) {
    throw new TypeError(`${path}.perOperationMs does not match durationMs / operationCount`);
  }
  return {
    index: integer(input.index, `${path}.index`, 0),
    durationMs: duration_ms,
    operationCount: operation_count,
    perOperationMs: per_operation_ms,
    ...(input.windowTransfer === undefined
      ? {}
      : {
          windowTransfer: parse_window_transfer_metrics(
            input.windowTransfer,
            `${path}.windowTransfer`,
          ),
        }),
  };
}

function parse_identity(value: Record<string, unknown>, path: string): ScenarioIdentity {
  const scenario_id = enum_value(
    value.scenarioId,
    ALL_RENDER_SCENARIOS.map((scenario) => scenario.id),
    `${path}.scenarioId`,
  );
  const group = enum_value(
    value.group,
    ALL_RENDER_SCENARIOS.map((scenario) => scenario.group),
    `${path}.group`,
  );
  if (group !== scenarioGroup(scenario_id)) {
    throw new TypeError(`${path}.group does not match scenario ${scenario_id}`);
  }
  const expected_data_validity = scenarioDataValidity(scenario_id);
  const data_validity =
    value.dataValidity === undefined
      ? undefined
      : enum_value(
          value.dataValidity,
          ["product-valid", "pixel-data-invalid"],
          `${path}.dataValidity`,
        );
  if (data_validity !== expected_data_validity) {
    throw new TypeError(
      expected_data_validity === undefined
        ? `${path}.dataValidity is reserved for window-transfer diagnostics`
        : `${path}.dataValidity must be ${expected_data_validity} for ${scenario_id}`,
    );
  }
  return {
    runId: text(value.runId, `${path}.runId`),
    round: integer(value.round, `${path}.round`, 1),
    engine: enum_value(value.engine, ENGINE_IDS, `${path}.engine`),
    rows: integer(value.rows, `${path}.rows`, 1),
    scenarioId: scenario_id,
    group,
    ...(data_validity === undefined ? {} : { dataValidity: data_validity }),
  };
}

export function parseScenarioResult(
  value: unknown,
  measuredSamples: number,
  minimumSampleDurationMs: number,
  path = "result",
): ScenarioResult {
  const input = record(value, path);
  const identity = parse_identity(input, path);
  const status = enum_value(input.status, ["success", "failed"], `${path}.status`);
  const validation = array(input.validation, `${path}.validation`).map((entry, index) =>
    parse_observation(entry, `${path}.validation[${index}]`),
  );
  const memory = parse_memory(input.memory, `${path}.memory`);

  if (status === "failed") {
    return {
      ...identity,
      status,
      stage: enum_value(
        input.stage,
        ["build", "launch", "mount", "warmup", "measure", "validate", "teardown"],
        `${path}.stage`,
      ),
      errorClass: text(input.errorClass, `${path}.errorClass`),
      message: text(input.message, `${path}.message`),
      timeout: bool(input.timeout, `${path}.timeout`),
      crash: bool(input.crash, `${path}.crash`),
      consoleErrors: string_array(input.consoleErrors, `${path}.consoleErrors`),
      pageErrors: string_array(input.pageErrors, `${path}.pageErrors`),
      partialSamples: array(input.partialSamples, `${path}.partialSamples`).map((entry, index) =>
        parse_sample(entry, `${path}.partialSamples[${index}]`),
      ),
      validation,
      memory,
    };
  }

  const raw_samples = array(input.rawSamples, `${path}.rawSamples`).map((entry, index) =>
    parse_sample(entry, `${path}.rawSamples[${index}]`),
  );
  if (raw_samples.length !== measuredSamples) {
    throw new TypeError(`${path}.rawSamples must contain ${measuredSamples} samples`);
  }
  for (const [index, sample] of raw_samples.entries()) {
    if (sample.index !== index)
      throw new TypeError(`${path}.rawSamples indices must be contiguous`);
    if (sample.durationMs < minimumSampleDurationMs) {
      throw new TypeError(
        `${path}.rawSamples[${index}] is below the ${minimumSampleDurationMs} ms aggregate minimum`,
      );
    }
  }
  if (validation.length === 0 || validation.some((observation) => !observation.passed)) {
    throw new TypeError(`${path}.validation must contain only passing checkpoints for success`);
  }
  const summary = summarizeFinite(raw_samples.map((sample) => sample.perOperationMs));
  const operation_count = raw_samples.reduce((total, sample) => total + sample.operationCount, 0);
  const is_window_transfer_diagnostic = identity.dataValidity !== undefined;
  let window_transfer: WindowTransferMetrics | undefined;
  if (is_window_transfer_diagnostic) {
    if (identity.engine !== "sheetwrite") {
      throw new TypeError(`${path} window-transfer diagnostics require the sheetwrite engine`);
    }
    const sample_metrics = raw_samples.map((sample, index) => {
      const metrics = sample.windowTransfer;
      if (!metrics) {
        throw new TypeError(`${path}.rawSamples[${index}].windowTransfer is required`);
      }
      if (
        metrics.logicalFrames !== sample.operationCount ||
        metrics.windowReadRequests !== metrics.logicalFrames
      ) {
        throw new TypeError(
          `${path}.rawSamples[${index}].windowTransfer must account for every timed frame`,
        );
      }
      if (identity.dataValidity === "product-valid") {
        if (
          metrics.logicalWindowReads !== metrics.logicalFrames ||
          metrics.copiedBytes <= 0 ||
          metrics.outputAllocationEvents <= 0
        ) {
          throw new TypeError(
            `${path}.rawSamples[${index}].windowTransfer is missing baseline read counters`,
          );
        }
      } else if (
        metrics.logicalWindowReads !== 0 ||
        metrics.copiedBytes !== 0 ||
        metrics.outputAllocationEvents !== 0
      ) {
        throw new TypeError(
          `${path}.rawSamples[${index}].windowTransfer upper bound performed a fresh read`,
        );
      }
      return metrics;
    });
    const expected_window_transfer = createWindowTransferMetrics({
      logicalFrames: sample_metrics.reduce((sum, metrics) => sum + metrics.logicalFrames, 0),
      windowReadRequests: sample_metrics.reduce(
        (sum, metrics) => sum + metrics.windowReadRequests,
        0,
      ),
      logicalWindowReads: sample_metrics.reduce(
        (sum, metrics) => sum + metrics.logicalWindowReads,
        0,
      ),
      copiedBytes: sample_metrics.reduce((sum, metrics) => sum + metrics.copiedBytes, 0),
      outputAllocationEvents: sample_metrics.reduce(
        (sum, metrics) => sum + metrics.outputAllocationEvents,
        0,
      ),
    });
    window_transfer = parse_window_transfer_metrics(input.windowTransfer, `${path}.windowTransfer`);
    for (const field of Object.keys(expected_window_transfer) as (keyof WindowTransferMetrics)[]) {
      if (window_transfer[field] !== expected_window_transfer[field]) {
        throw new TypeError(`${path}.windowTransfer does not match its raw samples`);
      }
    }
  } else if (
    input.windowTransfer !== undefined ||
    raw_samples.some((sample) => sample.windowTransfer !== undefined)
  ) {
    throw new TypeError(`${path}.windowTransfer is reserved for the controlled diagnostic pair`);
  }
  const median_ms = finite(input.medianMs, `${path}.medianMs`, 0);
  const p95_ms = finite(input.p95Ms, `${path}.p95Ms`, 0);
  const mad_ms = finite(input.madMs, `${path}.madMs`, 0);
  if (
    input.operationCount !== operation_count ||
    median_ms !== summary.median ||
    p95_ms !== summary.p95 ||
    mad_ms !== summary.mad
  ) {
    throw new TypeError(`${path} summary does not match its raw samples`);
  }
  return {
    ...identity,
    status,
    operationCount: operation_count,
    rawSamples: raw_samples,
    medianMs: median_ms,
    p95Ms: p95_ms,
    madMs: mad_ms,
    validation,
    memory,
    ...(input.resources === undefined
      ? {}
      : { resources: parse_resources(input.resources, `${path}.resources`) }),
    ...(input.mergeResources === undefined
      ? {}
      : {
          mergeResources: parse_merge_resources(input.mergeResources, `${path}.mergeResources`),
        }),
    ...(window_transfer === undefined ? {} : { windowTransfer: window_transfer }),
  };
}

function parse_launch_attempt(value: unknown, path: string): BrowserLaunchAttempt {
  const input = record(value, path);
  const success = bool(input.success, `${path}.success`);
  const error_class =
    input.errorClass === null ? null : text(input.errorClass, `${path}.errorClass`);
  const message = input.message === null ? null : text(input.message, `${path}.message`);
  if (success !== (error_class === null && message === null)) {
    throw new TypeError(`${path} success/error fields are inconsistent`);
  }
  return {
    round: integer(input.round, `${path}.round`, 1),
    engine: enum_value(input.engine, ENGINE_IDS, `${path}.engine`),
    rows: integer(input.rows, `${path}.rows`, 1),
    attempt: integer(input.attempt, `${path}.attempt`, 1),
    success,
    errorClass: error_class,
    message,
  };
}

function parse_metadata(value: unknown, path: string): RenderRunMetadata {
  const input = record(value, path);
  const engine_versions = record(input.engineVersions, `${path}.engineVersions`);
  validateEngineVersions(engine_versions, ENGINE_IDS);
  const hashes = record(input.datasetHashes, `${path}.datasetHashes`);
  const viewport = record(input.viewport, `${path}.viewport`);
  const engine_order = array(input.engineOrder, `${path}.engineOrder`).map((entry, round) =>
    array(entry, `${path}.engineOrder[${round}]`).map((engine, index) =>
      enum_value(engine, ENGINE_IDS, `${path}.engineOrder[${round}][${index}]`),
    ),
  );
  const window_transfer_scenario_order =
    input.windowTransferScenarioOrder === undefined
      ? undefined
      : array(input.windowTransferScenarioOrder, `${path}.windowTransferScenarioOrder`).map(
          (entry, round) =>
            array(entry, `${path}.windowTransferScenarioOrder[${round}]`).map((scenario, index) =>
              enum_value(
                scenario,
                WINDOW_TRANSFER_SCENARIO_IDS,
                `${path}.windowTransferScenarioOrder[${round}][${index}]`,
              ),
            ),
        );
  const metadata: RenderRunMetadata = {
    commit: text(input.commit, `${path}.commit`),
    dirty: bool(input.dirty, `${path}.dirty`),
    timestamp: text(input.timestamp, `${path}.timestamp`),
    bunVersion: text(input.bunVersion, `${path}.bunVersion`),
    nodeVersion: text(input.nodeVersion, `${path}.nodeVersion`),
    browserVersion: text(input.browserVersion, `${path}.browserVersion`),
    os: text(input.os, `${path}.os`),
    arch: text(input.arch, `${path}.arch`),
    cpu: text(input.cpu, `${path}.cpu`),
    engineVersions: {
      sheetwrite: text(engine_versions.sheetwrite, `${path}.engineVersions.sheetwrite`),
      handsontable: text(engine_versions.handsontable, `${path}.engineVersions.handsontable`),
    },
    datasetSeed: integer(input.datasetSeed, `${path}.datasetSeed`),
    datasetHashes: Object.fromEntries(
      Object.entries(hashes).map(([rows, hash]) => [
        rows,
        text(hash, `${path}.datasetHashes.${rows}`),
      ]),
    ),
    viewport: {
      width: integer(viewport.width, `${path}.viewport.width`, 1),
      height: integer(viewport.height, `${path}.viewport.height`, 1),
    },
    measuredSamples: integer(input.measuredSamples, `${path}.measuredSamples`, 1),
    warmupSamples: integer(input.warmupSamples, `${path}.warmupSamples`, 0),
    minimumSampleDurationMs: finite(
      input.minimumSampleDurationMs,
      `${path}.minimumSampleDurationMs`,
      RENDER_MINIMUM_SAMPLE_MS,
    ),
    rounds: integer(input.rounds, `${path}.rounds`, 1),
    orderSeed: integer(input.orderSeed, `${path}.orderSeed`),
    engineOrder: engine_order,
    launchAttempts: array(input.launchAttempts, `${path}.launchAttempts`).map((entry, index) =>
      parse_launch_attempt(entry, `${path}.launchAttempts[${index}]`),
    ),
    ...(window_transfer_scenario_order === undefined
      ? {}
      : { windowTransferScenarioOrder: window_transfer_scenario_order }),
  };
  if (!Number.isFinite(Date.parse(metadata.timestamp))) {
    throw new TypeError(`${path}.timestamp must be an ISO timestamp`);
  }
  if (metadata.engineOrder.length !== metadata.rounds) {
    throw new TypeError(`${path}.engineOrder must contain one order per round`);
  }
  return metadata;
}

function parse_config(value: unknown, path: string): RenderRunConfig {
  const input = record(value, path);
  const engines = array(input.engines, `${path}.engines`).map((engine, index) =>
    enum_value(engine, ENGINE_IDS, `${path}.engines[${index}]`),
  );
  const rows = array(input.rows, `${path}.rows`).map((count, index) =>
    integer(count, `${path}.rows[${index}]`, 1),
  );
  const scenarios = array(input.scenarios, `${path}.scenarios`).map((scenario, index) =>
    enum_value(
      scenario,
      ALL_RENDER_SCENARIOS.map((entry) => entry.id),
      `${path}.scenarios[${index}]`,
    ),
  );
  if (engines.length === 0 || new Set(engines).size !== engines.length) {
    throw new TypeError(`${path}.engines must be non-empty and unique`);
  }
  if (rows.length === 0 || new Set(rows).size !== rows.length) {
    throw new TypeError(`${path}.rows must be non-empty and unique`);
  }
  if (scenarios.length === 0 || new Set(scenarios).size !== scenarios.length) {
    throw new TypeError(`${path}.scenarios must be non-empty and unique`);
  }
  return { engines, rows, scenarios };
}

function parse_completeness(value: unknown, path: string): CompletenessSummary {
  const input = record(value, path);
  return {
    expectedKeys: string_array(input.expectedKeys, `${path}.expectedKeys`),
    observedKeys: string_array(input.observedKeys, `${path}.observedKeys`),
    missingKeys: string_array(input.missingKeys, `${path}.missingKeys`),
    duplicateKeys: string_array(input.duplicateKeys, `${path}.duplicateKeys`),
    unexpectedKeys: string_array(input.unexpectedKeys, `${path}.unexpectedKeys`),
    failedKeys: string_array(input.failedKeys, `${path}.failedKeys`),
    complete: bool(input.complete, `${path}.complete`),
    successful: bool(input.successful, `${path}.successful`),
  };
}

function equal_string_arrays(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export interface WindowTransferComparison {
  readonly rows: number;
  readonly baselineRepetitionMediansMs: readonly number[];
  readonly upperBoundRepetitionMediansMs: readonly number[];
  readonly baselineMedianMs: number;
  readonly upperBoundMedianMs: number;
  readonly estimatedWindowTransferCostMs: number;
  readonly crossVariantSpreadMs: number;
  readonly maximumWithinVariantSpreadMs: number;
  /** True only when the cross-variant effect exceeds both repetition-median spreads. */
  readonly resolved: boolean;
}

export function summarizeWindowTransferComparisons(
  artifact: Pick<RenderBenchmarkArtifact, "config" | "metadata" | "results">,
): WindowTransferComparison[] {
  if (
    !WINDOW_TRANSFER_SCENARIO_IDS.every((scenario) => artifact.config.scenarios.includes(scenario))
  ) {
    return [];
  }
  return artifact.config.rows.map((rows) => {
    const repetition_medians = (scenario_id: WindowTransferScenarioId): number[] => {
      const matching = artifact.results
        .filter(
          (result): result is SuccessfulScenario =>
            result.rows === rows &&
            result.engine === "sheetwrite" &&
            result.scenarioId === scenario_id &&
            result.status === "success",
        )
        .sort((left, right) => left.round - right.round);
      if (
        matching.length !== artifact.metadata.rounds ||
        matching.some((result, index) => result.round !== index + 1)
      ) {
        throw new TypeError(
          `window-transfer comparison for ${rows} rows requires one successful result per repetition`,
        );
      }
      return matching.map((result) => result.medianMs);
    };
    const baseline_repetition_medians_ms = repetition_medians(WINDOW_TRANSFER_BASELINE_SCENARIO_ID);
    const upper_bound_repetition_medians_ms = repetition_medians(
      WINDOW_TRANSFER_UPPER_BOUND_SCENARIO_ID,
    );
    const baseline_median_ms = summarizeFinite(baseline_repetition_medians_ms).median;
    const upper_bound_median_ms = summarizeFinite(upper_bound_repetition_medians_ms).median;
    const maximum_within_variant_spread_ms = Math.max(
      Math.max(...baseline_repetition_medians_ms) - Math.min(...baseline_repetition_medians_ms),
      Math.max(...upper_bound_repetition_medians_ms) -
        Math.min(...upper_bound_repetition_medians_ms),
    );
    const estimated_window_transfer_cost_ms = baseline_median_ms - upper_bound_median_ms;
    const cross_variant_spread_ms = Math.abs(estimated_window_transfer_cost_ms);
    return {
      rows,
      baselineRepetitionMediansMs: baseline_repetition_medians_ms,
      upperBoundRepetitionMediansMs: upper_bound_repetition_medians_ms,
      baselineMedianMs: baseline_median_ms,
      upperBoundMedianMs: upper_bound_median_ms,
      estimatedWindowTransferCostMs: estimated_window_transfer_cost_ms,
      crossVariantSpreadMs: cross_variant_spread_ms,
      maximumWithinVariantSpreadMs: maximum_within_variant_spread_ms,
      resolved: cross_variant_spread_ms > maximum_within_variant_spread_ms,
    };
  });
}

export function parseRenderArtifact(
  value: unknown,
  options: ParseRenderOptions = {},
): RenderBenchmarkArtifact {
  const input = record(value, "artifact");
  const protocol_version = integer(input.protocolVersion, "artifact.protocolVersion", 1);
  if (protocol_version !== RENDER_PROTOCOL_VERSION) {
    throw new TypeError(`unsupported render protocol version: ${protocol_version}`);
  }
  const run_id = text(input.runId, "artifact.runId");
  if (options.expectedRunId !== undefined && run_id !== options.expectedRunId) {
    throw new TypeError(
      `stale render result: expected run ${options.expectedRunId}, observed ${run_id}`,
    );
  }
  const metadata = parse_metadata(input.metadata, "artifact.metadata");
  if (options.maxAgeMs !== undefined) {
    const now_ms = options.nowMs ?? Date.now();
    if (now_ms - Date.parse(metadata.timestamp) > options.maxAgeMs) {
      throw new TypeError(`stale render result timestamp: ${metadata.timestamp}`);
    }
  }
  const config = parse_config(input.config, "artifact.config");
  const configured_window_transfer_scenarios = config.scenarios.filter((scenario) =>
    WINDOW_TRANSFER_SCENARIO_IDS.includes(scenario as WindowTransferScenarioId),
  );
  if (configured_window_transfer_scenarios.length === 0) {
    if (metadata.windowTransferScenarioOrder !== undefined) {
      throw new TypeError(
        "artifact.metadata.windowTransferScenarioOrder is reserved for the diagnostic pair",
      );
    }
  } else {
    if (
      configured_window_transfer_scenarios.length !== WINDOW_TRANSFER_SCENARIO_IDS.length ||
      !WINDOW_TRANSFER_SCENARIO_IDS.every((scenario) =>
        configured_window_transfer_scenarios.includes(scenario),
      )
    ) {
      throw new TypeError("window-transfer baseline and upper-bound scenarios must run together");
    }
    if (config.engines.length !== 1 || config.engines[0] !== "sheetwrite") {
      throw new TypeError("window-transfer diagnostics support only the sheetwrite engine");
    }
    const expected_order = counterbalancedOrder(
      WINDOW_TRANSFER_SCENARIO_IDS,
      metadata.rounds,
      WINDOW_TRANSFER_ORDER_SEED,
    );
    if (
      metadata.windowTransferScenarioOrder === undefined ||
      metadata.windowTransferScenarioOrder.length !== expected_order.length ||
      metadata.windowTransferScenarioOrder.some(
        (order, round) =>
          order.length !== expected_order[round]!.length ||
          order.some((scenario, index) => scenario !== expected_order[round]![index]),
      )
    ) {
      throw new TypeError(
        "artifact.metadata.windowTransferScenarioOrder is not the required counterbalance",
      );
    }
  }
  for (const engine of config.engines) {
    for (const order of metadata.engineOrder) {
      if (!order.includes(engine) || order.length !== config.engines.length) {
        throw new TypeError("artifact.metadata.engineOrder does not match configured engines");
      }
    }
  }
  for (const rows of config.rows) {
    if (metadata.datasetHashes[String(rows)] === undefined) {
      throw new TypeError(`artifact.metadata.datasetHashes is missing ${rows}`);
    }
  }
  const results = array(input.results, "artifact.results").map((entry, index) =>
    parseScenarioResult(
      entry,
      metadata.measuredSamples,
      metadata.minimumSampleDurationMs,
      `artifact.results[${index}]`,
    ),
  );
  if (results.some((result) => result.runId !== run_id)) {
    throw new TypeError("artifact contains a stale scenario run ID");
  }
  for (let round = 1; round <= metadata.rounds; round++) {
    for (const engine of config.engines) {
      for (const rows of config.rows) {
        const attempts = metadata.launchAttempts.filter(
          (attempt) =>
            attempt.round === round && attempt.engine === engine && attempt.rows === rows,
        );
        if (attempts.length === 0 || attempts.length > RENDER_MAX_LAUNCH_ATTEMPTS) {
          throw new TypeError(
            `artifact.metadata.launchAttempts must record 1-${RENDER_MAX_LAUNCH_ATTEMPTS} attempts per browser process`,
          );
        }
        if (attempts.some((attempt, index) => attempt.attempt !== index + 1)) {
          throw new TypeError("artifact.metadata.launchAttempts must be contiguous");
        }
        if (attempts.slice(0, -1).some((attempt) => attempt.success)) {
          throw new TypeError(
            "artifact.metadata.launchAttempts continued after a successful launch",
          );
        }
        if (!attempts.at(-1)!.success) {
          const combination = results.filter(
            (result) => result.round === round && result.engine === engine && result.rows === rows,
          );
          if (
            combination.length !== config.scenarios.length ||
            combination.some((result) => result.status !== "failed" || result.stage !== "launch")
          ) {
            throw new TypeError(
              "artifact results must preserve an exhausted browser launch failure",
            );
          }
        }
      }
    }
  }
  const completeness = parse_completeness(input.completeness, "artifact.completeness");
  const actual_completeness = summarizeCompleteness(config, metadata.rounds, results);
  for (const field of [
    "expectedKeys",
    "observedKeys",
    "missingKeys",
    "duplicateKeys",
    "unexpectedKeys",
    "failedKeys",
  ] as const) {
    if (!equal_string_arrays(completeness[field], actual_completeness[field])) {
      throw new TypeError(`artifact.completeness.${field} does not match results`);
    }
  }
  if (
    completeness.complete !== actual_completeness.complete ||
    completeness.successful !== actual_completeness.successful
  ) {
    throw new TypeError("artifact.completeness flags do not match results");
  }
  if (!completeness.complete) {
    throw new TypeError("render artifact matrix is incomplete or duplicated");
  }
  const artifact: RenderBenchmarkArtifact = {
    protocolVersion: RENDER_PROTOCOL_VERSION,
    runId: run_id,
    metadata,
    config,
    results,
    completeness,
    reproductionCommands: string_array(input.reproductionCommands, "artifact.reproductionCommands"),
  };
  if (completeness.successful && configured_window_transfer_scenarios.length > 0) {
    summarizeWindowTransferComparisons(artifact);
  }
  return artifact;
}

export function parseRenderArtifactJson(
  json: string,
  options: ParseRenderOptions = {},
): RenderBenchmarkArtifact {
  return parseRenderArtifact(JSON.parse(json) as unknown, options);
}

function escape_markdown(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function format_ms(value: number): string {
  if (value >= 100) return value.toFixed(1);
  if (value >= 1) return value.toFixed(3);
  return value.toFixed(5);
}

export function renderBenchmarkMarkdown(value: RenderBenchmarkArtifact): string {
  const artifact = parseRenderArtifact(value);
  const lines: string[] = [
    "# Auditable render benchmark",
    "",
    `Protocol version: **${artifact.protocolVersion}**  `,
    `Run ID: \`${artifact.runId}\`  `,
    `Matrix: **${artifact.completeness.successful ? "complete and successful" : "complete with structured failures"}**`,
    "",
  ];
  if (!artifact.completeness.successful) {
    lines.push(
      "> Comparative headline ratios are intentionally omitted because one or more cells failed.",
      "",
    );
  }
  lines.push(
    "## Environment",
    "",
    "| Field | Value |",
    "|:--|:--|",
    `| Commit | \`${escape_markdown(artifact.metadata.commit)}\` (${artifact.metadata.dirty ? "dirty" : "clean"}) |`,
    `| Timestamp | ${artifact.metadata.timestamp} |`,
    `| Runtime | Bun ${escape_markdown(artifact.metadata.bunVersion)}; Node ${escape_markdown(artifact.metadata.nodeVersion)} |`,
    `| Browser | ${escape_markdown(artifact.metadata.browserVersion)} |`,
    `| OS / arch | ${escape_markdown(artifact.metadata.os)} / ${escape_markdown(artifact.metadata.arch)} |`,
    `| CPU | ${escape_markdown(artifact.metadata.cpu)} |`,
    `| Engines | Sheetwrite ${escape_markdown(artifact.metadata.engineVersions.sheetwrite)}; Handsontable ${escape_markdown(artifact.metadata.engineVersions.handsontable)} |`,
    `| Dataset | seed ${artifact.metadata.datasetSeed}; ${Object.entries(
      artifact.metadata.datasetHashes,
    )
      .map(([rows, hash]) => `${Number(rows).toLocaleString("en-US")} rows = \`${hash}\``)
      .join("; ")} |`,
    `| Viewport | ${artifact.metadata.viewport.width} × ${artifact.metadata.viewport.height} |`,
    `| Sampling | ${artifact.metadata.warmupSamples} excluded warmup aggregate(s), ${artifact.metadata.measuredSamples} measured aggregate(s), minimum ${artifact.metadata.minimumSampleDurationMs} ms each |`,
    `| Counterbalance | seed ${artifact.metadata.orderSeed}; ${artifact.metadata.engineOrder
      .map((order, index) => `round ${index + 1}: ${order.join(" → ")}`)
      .join("; ")} |`,
    `| Browser launches | ${artifact.metadata.launchAttempts.length} attempt(s); ${artifact.metadata.launchAttempts.filter((attempt) => !attempt.success).length} failed attempt(s), all recorded in raw JSON |`,
    "",
    "Every cell below is linked to the raw JSON. Timings are per logical operation and use every measured sample; p95 is linearly interpolated and MAD is the median absolute deviation. Setup, cleanup, and declared warmups are excluded.",
    "",
    "## Results",
    "",
    "| round | rows | scenario / raw identity | Sheetwrite | Handsontable |",
    "|---:|---:|:--|:--|:--|",
  );

  const by_key = new Map(artifact.results.map((result) => [renderMatrixKey(result), result]));
  for (let round = 1; round <= artifact.metadata.rounds; round++) {
    for (const rows of artifact.config.rows) {
      for (const scenario_id of artifact.config.scenarios) {
        const cells = artifact.config.engines.map((engine) => {
          const identity: ScenarioIdentity = {
            runId: artifact.runId,
            round,
            engine,
            rows,
            scenarioId: scenario_id,
            group: scenarioGroup(scenario_id),
          };
          const result = by_key.get(renderMatrixKey(identity));
          if (!result) return "**INCOMPLETE — missing cell**";
          if (result.status === "failed") {
            return `**FAILED (${result.stage})** — ${escape_markdown(result.errorClass)}: ${escape_markdown(result.message)}`;
          }
          const transfer = result.windowTransfer;
          const transfer_evidence =
            transfer === undefined
              ? ""
              : `; validity ${result.dataValidity}; copied/frame ${transfer.copiedBytesPerLogicalFrame.toFixed(3)} B; allocations/frame ${transfer.outputAllocationEventsPerLogicalFrame.toFixed(3)}; copied/read ${transfer.copiedBytesPerLogicalRead === null ? "n/a" : `${transfer.copiedBytesPerLogicalRead.toFixed(3)} B`}; allocations/read ${transfer.outputAllocationEventsPerLogicalRead === null ? "n/a" : transfer.outputAllocationEventsPerLogicalRead.toFixed(3)}`;
          return `median ${format_ms(result.medianMs)} ms; p95 ${format_ms(result.p95Ms)}; MAD ${format_ms(result.madMs)}; ${result.rawSamples.length} samples / ${result.operationCount} ops${transfer_evidence}`;
        });
        const identity_label = `r${round}-${rows}-${scenario_id}`;
        lines.push(
          `| ${round} | ${rows.toLocaleString("en-US")} | [\`${escape_markdown(identity_label)}\`](./render-results.json) | ${cells.join(" | ")} |`,
        );
      }
    }
  }

  if (
    artifact.completeness.successful &&
    WINDOW_TRANSFER_SCENARIO_IDS.every((scenario) => artifact.config.scenarios.includes(scenario))
  ) {
    lines.push(
      "",
      "## Visible-window transfer diagnostic",
      "",
      "> The reuse upper bound deliberately paints a prior decoded view. Its pixels/data are invalid and it is not a product-valid rendering result.",
      "",
      `Counterbalanced scenario order: ${artifact.metadata.windowTransferScenarioOrder
        ?.map((order, index) => `round ${index + 1}: ${order.join(" → ")}`)
        .join("; ")}`,
      "",
      "| rows | baseline repetition medians | upper-bound repetition medians | estimated transfer cost | cross-variant spread | maximum within-variant spread | resolution |",
      "|---:|:--|:--|---:|---:|---:|:--|",
    );
    for (const comparison of summarizeWindowTransferComparisons(artifact)) {
      lines.push(
        `| ${comparison.rows.toLocaleString("en-US")} | ${comparison.baselineRepetitionMediansMs.map(format_ms).join(", ")} ms | ${comparison.upperBoundRepetitionMediansMs.map(format_ms).join(", ")} ms | ${format_ms(comparison.estimatedWindowTransferCostMs)} ms | ${format_ms(comparison.crossVariantSpreadMs)} ms | ${format_ms(comparison.maximumWithinVariantSpreadMs)} ms | ${comparison.resolved ? "resolved" : "unresolved"} |`,
      );
    }
  }

  lines.push("", "## Reproduce", "");
  for (const command of artifact.reproductionCommands) lines.push(`- \`${command}\``);
  lines.push(
    "",
    "The JSON artifact is authoritative. This Markdown file is generated from it and must not be edited by hand.",
    "",
  );
  return lines.join("\n");
}
