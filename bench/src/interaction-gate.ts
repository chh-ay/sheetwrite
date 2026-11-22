import { validateEngineVersions } from "./engine-versions.js";
import type { BenchmarkMode } from "./gate-protocol.js";
import { validateRawStat, validateStat } from "./gate-protocol.js";
import type { ProtocolCaptureMeta } from "./protocol-meta.js";
import type { Stat } from "./stats.js";

/**
 * Schema of the performance showcase's interaction evidence.
 *
 * Version 1 recorded a before/after pair from a one-off comparison capture and
 * gated the improvement ratios of that pair. A ratio gate cannot be refreshed
 * by a release: re-measuring the "before" build is a separate protocol, and a
 * copied forward old sample would be a fabricated input. Version 2 therefore
 * records the current values of the four published metrics with their raw
 * samples and provenance, and gates them on absolute release ceilings.
 */
export const INTERACTION_PROTOCOL_VERSION = 2 as const;
export const INTERACTION_MATRIX_ID = "interaction-current-v2" as const;
export const INTERACTION_ROWS = 1_000_000;
export const INTERACTION_LOOKUPS_PER_RUN = 524_288;
/** Raw samples per matrix: the published matrix asks for five, a rehearsal two. */
export const INTERACTION_SAMPLE_COUNTS: Readonly<Record<BenchmarkMode, number>> = {
  full: 5,
  smoke: 2,
};

export const INTERACTION_SAMPLE_KEYS = [
  "lookupMedianNs",
  "lookupP95Ns",
  "inverseIndexBytes",
  "dirty100Bytes",
  "ownedColdLongTaskMs",
  "unattributedColdLongTaskMs",
  "usableMs",
] as const;
export type InteractionMetric = (typeof INTERACTION_SAMPLE_KEYS)[number];
/** Metrics the release refuses to exceed; the rest are reported, never gated. */
export const INTERACTION_CEILING_KEYS = [
  "lookupP95Ns",
  "inverseIndexBytes",
  "dirty100Bytes",
  "ownedColdLongTaskMs",
] as const;
export type InteractionCeilingMetric = (typeof INTERACTION_CEILING_KEYS)[number];

export type InteractionSamples = { readonly [K in InteractionMetric]: readonly number[] };
export type InteractionValues = { readonly [K in InteractionMetric]: Stat };

/**
 * Absolute release ceilings, not comparisons against another build. The lookup
 * ceiling applies to the median of the sample p95s, because one batch of a
 * sub-microsecond measurement can always be disturbed; the byte and long-task
 * ceilings apply to every sample.
 *
 * - `lookupP95Ns`: a packed inverse-index lookup at one million rows must stay
 *   under one microsecond at its 95th percentile.
 * - `inverseIndexBytes`: the packed inverse index may use at most four bytes
 *   per data row, the Uint32 view-row-per-data-row bound the view-index
 *   protocol asserts.
 * - `dirty100Bytes`: a hundred distant edits must stay inside the one mebibyte
 *   sparse overlay budget the paged protocol asserts for `dirty-100`.
 * - `ownedColdLongTaskMs`: no long task owned by Sheetwrite on the cold route
 *   may reach the 50 ms long-task threshold, the freeze budget the version 1
 *   capture stated.
 */
export const INTERACTION_CEILINGS: Readonly<Record<InteractionCeilingMetric, number>> = {
  lookupP95Ns: 1_000,
  inverseIndexBytes: INTERACTION_ROWS * 4,
  dirty100Bytes: 1024 * 1024,
  ownedColdLongTaskMs: 50,
};

/** Ceilings every raw sample must meet, as opposed to a summary of the samples. */
export const INTERACTION_SAMPLE_CEILING_KEYS = [
  "inverseIndexBytes",
  "dirty100Bytes",
  "ownedColdLongTaskMs",
] as const satisfies readonly InteractionCeilingMetric[];

/** Runner identity of a capture: enough to judge whether a number is comparable. */
export interface InteractionRunner {
  readonly runtime: string;
  readonly browser: string;
  readonly cpu: string;
}

/**
 * How each metric was produced. Cold-route attribution is reconstructed rather
 * than inherited: the version 1 capture shipped its numbers without a producer,
 * so this record states exactly what the current numbers mean.
 */
export interface InteractionMethod {
  readonly lookup: string;
  readonly dirty: string;
  readonly coldRoute: string;
  readonly attribution: string;
  readonly previous: string;
}

/** The capture this artifact was written over, when one existed at its path. */
export interface InteractionPreviousCapture {
  readonly matrixId: typeof INTERACTION_MATRIX_ID;
  readonly mode: BenchmarkMode;
  readonly commit: string;
  readonly timestamp: string;
  readonly values: InteractionValues;
}

export interface InteractionPerformanceArtifact {
  readonly protocolVersion: typeof INTERACTION_PROTOCOL_VERSION;
  readonly matrixId: typeof INTERACTION_MATRIX_ID;
  readonly mode: BenchmarkMode;
  readonly metadata: ProtocolCaptureMeta & {
    readonly engineVersions: Readonly<Record<"sheetwrite", string>>;
  };
  readonly runner: InteractionRunner;
  readonly method: InteractionMethod;
  readonly rows: typeof INTERACTION_ROWS;
  readonly lookupsPerRun: typeof INTERACTION_LOOKUPS_PER_RUN;
  readonly samples: InteractionSamples;
  readonly values: InteractionValues;
  readonly previous: InteractionPreviousCapture | null;
  readonly ceilings: Readonly<Record<InteractionCeilingMetric, number>>;
}

export const INTERACTION_METRIC_LABELS: Readonly<Record<InteractionMetric, string>> = {
  lookupMedianNs: "packed inverse-index lookup, median (ns)",
  lookupP95Ns: "packed inverse-index lookup, p95 (ns)",
  inverseIndexBytes: "packed inverse-index backing store (bytes)",
  dirty100Bytes: "retained bytes after 100 distant edits",
  ownedColdLongTaskMs: "owned cold-route long task (ms)",
  unattributedColdLongTaskMs: "reported unattributed cold-route long task (ms)",
  usableMs: "cold route to first resolved feed cell (ms)",
};

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value;
}

function finite(value: unknown, path: string, minimum = Number.NEGATIVE_INFINITY): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new TypeError(`${path} must be a finite number >= ${minimum}`);
  }
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean`);
  return value;
}

function mode_of(value: unknown, path: string): BenchmarkMode {
  if (value !== "full" && value !== "smoke") {
    throw new TypeError(`${path} must be full or smoke`);
  }
  return value;
}

function timestamp_of(value: unknown, path: string): string {
  const timestamp = text(value, path);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new TypeError(`${path} must be an ISO timestamp`);
  }
  return timestamp;
}

function samples_of(value: unknown, mode: BenchmarkMode): InteractionSamples {
  const input = record(value, "interaction artifact.samples");
  const expected = INTERACTION_SAMPLE_COUNTS[mode];
  const samples_of_key = (key: InteractionMetric): readonly number[] => {
    const raw = input[key];
    if (!Array.isArray(raw) || raw.length !== expected) {
      throw new TypeError(`interaction artifact.samples.${key} requires ${expected} raw samples`);
    }
    return raw.map((sample, index) =>
      finite(sample, `interaction artifact.samples.${key}[${index}]`, 0),
    );
  };
  return {
    lookupMedianNs: samples_of_key("lookupMedianNs"),
    lookupP95Ns: samples_of_key("lookupP95Ns"),
    inverseIndexBytes: samples_of_key("inverseIndexBytes"),
    dirty100Bytes: samples_of_key("dirty100Bytes"),
    ownedColdLongTaskMs: samples_of_key("ownedColdLongTaskMs"),
    unattributedColdLongTaskMs: samples_of_key("unattributedColdLongTaskMs"),
    usableMs: samples_of_key("usableMs"),
  };
}

function stat_of(value: unknown, path: string): Stat {
  const input = record(value, path);
  const stat: Stat = {
    median: finite(input.median, `${path}.median`, 0),
    p95: finite(input.p95, `${path}.p95`, 0),
    mean: finite(input.mean, `${path}.mean`, 0),
    stddev: finite(input.stddev, `${path}.stddev`, 0),
    min: finite(input.min, `${path}.min`, 0),
    max: finite(input.max, `${path}.max`, 0),
    iters: finite(input.iters, `${path}.iters`, 1),
  };
  if (!Number.isInteger(stat.iters)) throw new TypeError(`${path}.iters must be an integer`);
  return stat;
}

/** Every published value must be the summary of the raw samples beside it. */
function values_of(value: unknown, samples: InteractionSamples): InteractionValues {
  const input = record(value, "interaction artifact.values");
  const value_at = (key: InteractionMetric): Stat => {
    const stat = stat_of(input[key], `interaction artifact.values.${key}`);
    validateRawStat(samples[key], stat, `interaction artifact.values.${key}`);
    return stat;
  };
  return {
    lookupMedianNs: value_at("lookupMedianNs"),
    lookupP95Ns: value_at("lookupP95Ns"),
    inverseIndexBytes: value_at("inverseIndexBytes"),
    dirty100Bytes: value_at("dirty100Bytes"),
    ownedColdLongTaskMs: value_at("ownedColdLongTaskMs"),
    unattributedColdLongTaskMs: value_at("unattributedColdLongTaskMs"),
    usableMs: value_at("usableMs"),
  };
}

function ceilings_of(value: unknown): Readonly<Record<InteractionCeilingMetric, number>> {
  const input = record(value, "interaction artifact.ceilings");
  const ceiling_of = (key: InteractionCeilingMetric): number => {
    const ceiling = finite(input[key], `interaction artifact.ceilings.${key}`, 0);
    if (ceiling !== INTERACTION_CEILINGS[key]) {
      throw new TypeError(
        `interaction artifact.ceilings.${key} is not the release ceiling ${INTERACTION_CEILINGS[key]}`,
      );
    }
    return ceiling;
  };
  return {
    lookupP95Ns: ceiling_of("lookupP95Ns"),
    inverseIndexBytes: ceiling_of("inverseIndexBytes"),
    dirty100Bytes: ceiling_of("dirty100Bytes"),
    ownedColdLongTaskMs: ceiling_of("ownedColdLongTaskMs"),
  };
}

function meta_of(value: unknown): InteractionPerformanceArtifact["metadata"] {
  const input = record(value, "interaction artifact.metadata");
  validateEngineVersions(input.engineVersions, ["sheetwrite"]);
  return {
    commit: text(input.commit, "interaction artifact.metadata.commit"),
    dirty: bool(input.dirty, "interaction artifact.metadata.dirty"),
    timestamp: timestamp_of(input.timestamp, "interaction artifact.metadata.timestamp"),
    engineVersions: { sheetwrite: input.engineVersions.sheetwrite },
  };
}

function runner_of(value: unknown): InteractionRunner {
  const input = record(value, "interaction artifact.runner");
  return {
    runtime: text(input.runtime, "interaction artifact.runner.runtime"),
    browser: text(input.browser, "interaction artifact.runner.browser"),
    cpu: text(input.cpu, "interaction artifact.runner.cpu"),
  };
}

function method_of(value: unknown): InteractionMethod {
  const input = record(value, "interaction artifact.method");
  return {
    lookup: text(input.lookup, "interaction artifact.method.lookup"),
    dirty: text(input.dirty, "interaction artifact.method.dirty"),
    coldRoute: text(input.coldRoute, "interaction artifact.method.coldRoute"),
    attribution: text(input.attribution, "interaction artifact.method.attribution"),
    previous: text(input.previous, "interaction artifact.method.previous"),
  };
}

function previous_of(value: unknown): InteractionPreviousCapture | null {
  if (value === null) return null;
  const input = record(value, "interaction artifact.previous");
  const matrix_id = text(input.matrixId, "interaction artifact.previous.matrixId");
  if (matrix_id !== INTERACTION_MATRIX_ID) {
    throw new TypeError("interaction artifact.previous must be a capture of the same schema");
  }
  const values = record(input.values, "interaction artifact.previous.values");
  const parsed = {} as Record<InteractionMetric, Stat>;
  for (const key of INTERACTION_SAMPLE_KEYS) {
    // The predecessor's raw samples are not in this artifact, so its summary
    // can only be re-checked for internal consistency, not re-derived.
    const stat = stat_of(values[key], `interaction artifact.previous.values.${key}`);
    validateStat(stat, `interaction artifact.previous.values.${key}`);
    parsed[key] = stat;
  }
  return {
    matrixId: INTERACTION_MATRIX_ID,
    mode: mode_of(input.mode, "interaction artifact.previous.mode"),
    commit: text(input.commit, "interaction artifact.previous.commit"),
    timestamp: timestamp_of(input.timestamp, "interaction artifact.previous.timestamp"),
    values: parsed as InteractionValues,
  };
}

/**
 * Validate a published interaction artifact and return its typed value.
 * Rejects a stale schema, incomplete provenance, a weakened matrix, a value
 * that is not derived from its samples, or a sample above a release ceiling.
 */
export function validateInteractionArtifact(value: unknown): InteractionPerformanceArtifact {
  const input = record(value, "interaction artifact");
  const protocol_version = finite(input.protocolVersion, "interaction artifact.protocolVersion", 0);
  if (protocol_version !== INTERACTION_PROTOCOL_VERSION) {
    throw new TypeError(
      `interaction artifact stale protocol: expected ${INTERACTION_PROTOCOL_VERSION}, observed ${protocol_version}`,
    );
  }
  const matrix_id = text(input.matrixId, "interaction artifact.matrixId");
  if (matrix_id !== INTERACTION_MATRIX_ID) {
    throw new TypeError(
      `interaction artifact stale matrix: expected ${INTERACTION_MATRIX_ID}, observed ${matrix_id}`,
    );
  }
  const mode = mode_of(input.mode, "interaction artifact.mode");
  const rows = finite(input.rows, "interaction artifact.rows", 1);
  const lookups_per_run = finite(input.lookupsPerRun, "interaction artifact.lookupsPerRun", 1);
  if (rows !== INTERACTION_ROWS || lookups_per_run !== INTERACTION_LOOKUPS_PER_RUN) {
    throw new TypeError("interaction artifact workload changed");
  }
  const samples = samples_of(input.samples, mode);
  const values = values_of(input.values, samples);
  const ceilings = ceilings_of(input.ceilings);
  if (values.lookupP95Ns.median > ceilings.lookupP95Ns) {
    throw new TypeError(
      `interaction artifact lookupP95Ns median ${values.lookupP95Ns.median} exceeds the release ceiling ${ceilings.lookupP95Ns}`,
    );
  }
  for (const key of INTERACTION_SAMPLE_CEILING_KEYS) {
    const breached = samples[key].find((sample) => sample > ceilings[key]);
    if (breached !== undefined) {
      throw new TypeError(
        `interaction artifact ${key} sample ${breached} exceeds the release ceiling ${ceilings[key]}`,
      );
    }
  }
  return {
    protocolVersion: INTERACTION_PROTOCOL_VERSION,
    matrixId: INTERACTION_MATRIX_ID,
    mode,
    metadata: meta_of(input.metadata),
    runner: runner_of(input.runner),
    method: method_of(input.method),
    rows: INTERACTION_ROWS,
    lookupsPerRun: INTERACTION_LOOKUPS_PER_RUN,
    samples,
    values,
    previous: previous_of(input.previous),
    ceilings,
  };
}
