import { mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { matchingCaptureAffinities, readCaptureArtifacts } from "./capture-scope.js";
import { independentMedianDeltaLowerBound } from "./check.js";
import { CONTROLLED_COMPARISON_POLICY } from "./controlled-baseline.js";
import { DATA_GATE_PROTOCOL_VERSION, parseEngineBaselineLabel } from "./gate-protocol.js";
import { INTERACTION_CEILINGS } from "./interaction-gate.js";
import { sourceTreeDirty } from "./protocol-meta.js";
import { RELEASE_ARTIFACTS, RELEASE_SUITE_ARTIFACTS } from "./release-capture.js";
import { summarizeFinite } from "./stats.js";

const BENCH_ROOT = resolve(import.meta.dir, "..");
const REPOSITORY_ROOT = resolve(BENCH_ROOT, "..");
const RELEASE_FORMULA_RATIO_LIMIT = 1.25;
const RELEASE_FORMULA_FLOOR_MS = 0.1;
const SUB_MILLISECOND_MEDIAN_FLOOR_MS = 0.3;
const CAPTURE_MEMORY_GIB = 8;
const CAPTURE_MEMORY_MAX = `${CAPTURE_MEMORY_GIB}G`;
const CAPTURE_MEMORY_BYTES = CAPTURE_MEMORY_GIB * 1024 ** 3;
const CAPTURE_CPU_SLOT = 4;
const ENGINE_ONLY_ARTIFACTS: Readonly<Record<string, true>> = {
  "formula-results.json": true,
  "formula-default-results.json": true,
  "formula-full-results.json": true,
  "full-engine-results.json": true,
  "full-engine-matched-results.json": true,
};
const IDENTITY_FIELDS = [
  "key",
  "engine",
  "id",
  "name",
  "rows",
  "size",
  "scenarioId",
  "scenario",
  "operation",
  "chartCount",
  "source",
] as const;
const INTERACTION_LIMITS = new Map(Object.entries(INTERACTION_CEILINGS));

/** What the baseline engine artifacts say they measured; every engine artifact must agree. */
interface BaselineIdentity {
  /** The context label of the baseline engine captures. */
  readonly engineLabel: string;
  /** The release the baseline measures. */
  readonly baseVersion: string;
  /** The release line of the core and harness both sides ran under. */
  readonly harnessVersion: string;
}

type RecordValue = Record<string, unknown>;
type Verdict =
  | "regression"
  | "improvement"
  | "within-noise"
  | "slower"
  | "faster"
  | "unchanged"
  | "new-only"
  | "removed";
type Unit = "ms" | "ns" | "bytes" | "count" | "ratio";

interface Point {
  median: number;
  p95: number;
  mad?: number;
  max?: number;
}

interface ExtractedMetric {
  key: string;
  unit: Unit;
  labels: Record<string, string | number>;
  points: Point[];
  samples: number[];
}

interface MetricComparison {
  key: string;
  unit: Unit;
  rounds: { base: number; candidate: number };
  base: Point | null;
  candidate: Point | null;
  medianRatio: number | null;
  p95Ratio: number | null;
  medianDelta: number | null;
  p95Delta: number | null;
  verdict: Verdict;
  limit: number | null;
  lowerConfidenceBoundMs?: number;
  ceilingPassed?: boolean;
  note?: string;
}

function record(value: unknown): RecordValue | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function median(values: readonly number[]): number {
  return summarizeFinite(values).median;
}

function git(args: readonly string[]): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: REPOSITORY_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0)
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString().trim()}`);

  return result.stdout.toString().trim();
}

function point_of(value: RecordValue): Point | undefined {
  const median_value = value.median ?? value.medianMs;
  const p95 = value.p95 ?? value.p95Ms;
  if (!finite(median_value) || !finite(p95)) return undefined;

  const mad = value.mad ?? value.madMs ?? value.observedMadMs;

  return {
    median: median_value,
    p95,
    ...(finite(mad) ? { mad } : {}),
    ...(finite(value.max) ? { max: value.max } : {}),
  };
}

function unit_of(key: string, value: RecordValue): Unit {
  if (finite(value.medianMs) || key.endsWith("Ms")) return "ms";
  if (key.endsWith("Ns")) return "ns";
  if (key.endsWith("Bytes")) return "bytes";
  if (/ratioStat$/i.test(key)) return "ratio";
  if (key.endsWith("Allocations")) return "count";

  return "ms";
}

/** Round identity is intentionally absent: no fastest-round selection or index pairing. */
function identity(value: RecordValue): Record<string, string | number> {
  const labels: Record<string, string | number> = {};
  for (const field of IDENTITY_FIELDS) {
    const label = value[field];
    if (typeof label === "string" || finite(label)) labels[field] = label;
  }

  return labels;
}

function extract_metrics(artifact: unknown): Map<string, ExtractedMetric> {
  const metrics = new Map<string, ExtractedMetric>();

  function visit(
    value: unknown,
    path: string,
    leaf: string,
    inherited: Record<string, string | number>,
  ): void {
    if (Array.isArray(value)) {
      value.forEach((element: unknown, index: number) => {
        const element_record = record(element);
        const labels = element_record === undefined ? {} : identity(element_record);
        const selector =
          Object.entries(labels)
            .map(([field, label]) => `${field}=${label}`)
            .join(";") || String(index);
        visit(element, `${path}[${selector}]`, leaf, { ...inherited, ...labels });
      });
      return;
    }

    const fields = record(value);
    if (fields === undefined) return;

    const point = point_of(fields);
    if (point !== undefined) {
      const existing = metrics.get(path);
      const samples =
        Array.isArray(fields.samplesMs) && fields.samplesMs.every(finite) ? fields.samplesMs : [];
      if (existing === undefined) {
        metrics.set(path, {
          key: path,
          unit: unit_of(leaf, fields),
          labels: inherited,
          points: [point],
          samples,
        });
      } else {
        existing.points.push(point);
        existing.samples = [];
      }
      return;
    }

    for (const [field, child] of Object.entries(fields)) {
      // Embedded predecessor captures and raw samples are not current measurements.
      if (
        field === "previous" ||
        field === "samples" ||
        field === "rawSamples" ||
        field === "samplesMs"
      )
        continue;
      visit(child, path === "" ? field : `${path}.${field}`, field, inherited);
    }
  }

  visit(artifact, "", "", {});

  return metrics;
}

function reduce_metric(metric: ExtractedMetric | undefined): Point | null {
  if (metric === undefined) return null;

  const mads = metric.points.map((point) => point.mad).filter(finite);
  const maxima = metric.points.map((point) => point.max).filter(finite);

  return {
    median: median(metric.points.map((point) => point.median)),
    p95: median(metric.points.map((point) => point.p95)),
    ...(mads.length === metric.points.length ? { mad: median(mads) } : {}),
    ...(maxima.length === metric.points.length ? { max: Math.max(...maxima) } : {}),
  };
}

function ratio(candidate: number, base: number): number | null {
  return base === 0 ? (candidate === 0 ? 1 : null) : candidate / base;
}

function threshold_of(artifact: string) {
  if (artifact === "render-baseline.json")
    return {
      kind: "bootstrap-median-delta",
      source: "bench/src/controlled-baseline.ts",
      description:
        "Independent raw-sample median bootstrap; 99% familywise confidence, 20,000 resamples, maximum regression 0 ms. Historical/candidate harnesses are not asserted identical; descriptive release evidence, not bench:check approval.",
    };
  if (/^(formula-(results|default-results|full-results)|full-engine-results)\.json$/.test(artifact))
    return {
      kind: "formula-release-limit",
      source: "bench/src/formula-bench.ts; bench/README.md",
      description:
        "Release limits: max(baseline × 1.25, baseline + 0.1 ms) for median and p95; baseline medians below 1 ms gate median only with a 0.3 ms floor. Attributed allocation summaries may not grow. Independent release comparison, not a paired gate verdict.",
    };
  if (artifact === "interaction-results.json")
    return {
      kind: "absolute-ceiling",
      source: "bench/src/interaction-gate.ts",
      description:
        "lookupP95Ns uses the median; byte and owned long-task ceilings apply to every sample. Historical deltas are descriptive, not relative gates.",
    };

  return {
    kind: "none",
    source: "bench/README.md",
    description:
      artifact === "xlsx-results.json"
        ? "No documented historical-capture noise threshold. The XLSX 1.25 baseline ratio is an in-capture codec gate, not a historical/new comparison limit."
        : artifact === "pivot-results.json"
          ? "No historical artifact at the base ref. The 100x incremental/full-build speedup target is an in-capture gate, not a historical comparison threshold."
          : "No documented historical-capture noise threshold for this suite; increases/decreases are reported without a regression claim.",
  };
}

function compare_metric(
  artifact: string,
  base: ExtractedMetric | undefined,
  candidate: ExtractedMetric | undefined,
  family_size: number,
): MetricComparison {
  const metric = candidate ?? base;
  if (metric === undefined) throw new Error(`${artifact}: missing both metric sides`);

  const old_point = reduce_metric(base);
  const new_point = reduce_metric(candidate);
  const comparison: MetricComparison = {
    key: metric.key,
    unit: metric.unit,
    rounds: { base: base?.points.length ?? 0, candidate: candidate?.points.length ?? 0 },
    base: old_point,
    candidate: new_point,
    medianRatio: old_point && new_point ? ratio(new_point.median, old_point.median) : null,
    p95Ratio: old_point && new_point ? ratio(new_point.p95, old_point.p95) : null,
    medianDelta: old_point && new_point ? new_point.median - old_point.median : null,
    p95Delta: old_point && new_point ? new_point.p95 - old_point.p95 : null,
    verdict:
      old_point === null
        ? "new-only"
        : new_point === null
          ? "removed"
          : new_point.median > old_point.median
            ? "slower"
            : new_point.median < old_point.median
              ? "faster"
              : "unchanged",
    limit: null,
  };

  if (artifact === "interaction-results.json" && new_point !== null) {
    const key = metric.key.replace(/^values\./, "");
    const ceiling = INTERACTION_LIMITS.get(key);
    if (ceiling !== undefined) {
      comparison.limit = ceiling;
      comparison.ceilingPassed =
        (key === "lookupP95Ns" ? new_point.median : (new_point.max ?? Number.POSITIVE_INFINITY)) <=
        ceiling;
      if (!comparison.ceilingPassed) comparison.verdict = "regression";
    }
  }

  if (old_point === null || new_point === null) return comparison;

  if (artifact === "render-baseline.json" && base !== undefined && candidate !== undefined) {
    comparison.limit = CONTROLLED_COMPARISON_POLICY.maximumRegressionMs;
    comparison.lowerConfidenceBoundMs = independentMedianDeltaLowerBound(
      base.samples,
      candidate.samples,
      metric.key,
      family_size,
    );
    const improvement_bound = independentMedianDeltaLowerBound(
      candidate.samples,
      base.samples,
      metric.key,
      family_size,
    );
    comparison.verdict =
      comparison.lowerConfidenceBoundMs > comparison.limit
        ? "regression"
        : improvement_bound > comparison.limit
          ? "improvement"
          : "within-noise";
  }

  if (threshold_of(artifact).kind === "formula-release-limit") {
    if (metric.key.endsWith(".stat")) {
      const is_sub_millisecond = old_point.median < 1;
      const floor = is_sub_millisecond ? SUB_MILLISECOND_MEDIAN_FLOOR_MS : RELEASE_FORMULA_FLOOR_MS;
      const median_limit = Math.max(
        old_point.median * RELEASE_FORMULA_RATIO_LIMIT,
        old_point.median + floor,
      );
      const p95_limit = Math.max(
        old_point.p95 * RELEASE_FORMULA_RATIO_LIMIT,
        old_point.p95 + floor,
      );
      comparison.limit = median_limit;
      comparison.verdict =
        new_point.median > median_limit || (!is_sub_millisecond && new_point.p95 > p95_limit)
          ? "regression"
          : new_point.median < old_point.median
            ? "faster"
            : "within-noise";
    } else if (metric.unit === "bytes" || metric.unit === "count") {
      comparison.limit = old_point.median;
      if (new_point.median > old_point.median || new_point.p95 > old_point.p95) {
        comparison.verdict = "regression";
      }
    }
  }

  return comparison;
}

function stamp_of(value: unknown): RecordValue | null {
  const artifact = record(value);
  if (artifact === undefined) return null;

  const stamp = record(artifact.meta) ?? record(artifact.metadata) ?? record(artifact.source);
  if (stamp === undefined) return null;

  return {
    commit: stamp.commit ?? null,
    dirty: stamp.dirty ?? null,
    timestamp: stamp.timestamp ?? null,
  };
}

/**
 * Reads the scope receipts of a result set. A candidate needs one receipt for
 * every release suite. A baseline has a receipt for each suite its release
 * measured; a suite without one is new in the candidate.
 */
async function read_capture_records(
  directory: string,
  engine_commit: string,
  baseline: boolean,
): Promise<readonly RecordValue[]> {
  // Sorted: directory order differs between filesystems, and the comparison embeds these records.
  const paths = readdirSync(resolve(directory, "capture-runs"))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const expected = new Set(RELEASE_SUITE_ARTIFACTS.keys());
  const records: RecordValue[] = [];
  for (const path of paths) {
    const capture = record(await Bun.file(resolve(directory, "capture-runs", path)).json());
    const metadata = record(capture?.metadata);
    if (metadata?.purpose === "rehearsal") continue;
    const label = capture?.label;
    if (
      capture?.status !== "passed" ||
      metadata?.engineCommit !== engine_commit ||
      metadata.dirty !== false ||
      metadata.memoryMax !== CAPTURE_MEMORY_MAX ||
      metadata.effectiveMemoryMaxBytes !== CAPTURE_MEMORY_BYTES ||
      metadata.memoryMaxProof !== `MemoryMax=${CAPTURE_MEMORY_BYTES}` ||
      metadata.cpuSlot !== CAPTURE_CPU_SLOT ||
      capture.sliceHighAfter !== metadata.sliceHighBefore ||
      typeof label !== "string" ||
      !expected.delete(label)
    ) {
      throw new Error(
        `Invalid, duplicate, or throttled capture: ${directory}/capture-runs/${path}`,
      );
    }
    const actual = await readCaptureArtifacts(label, directory);
    const proofs = Array.isArray(capture.artifacts) ? capture.artifacts.map(record) : [];
    const start = Date.parse(String(metadata.timestamp));
    const end = Date.parse(String(capture.endedAt));
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      proofs.length !== actual.length ||
      actual.some((artifact, index) => {
        const proof = proofs[index];
        return (
          proof?.file !== artifact.file ||
          proof.sha256 !== artifact.sha256 ||
          !finite(proof.modifiedAtMs) ||
          proof.modifiedAtMs < start ||
          proof.modifiedAtMs > end
        );
      })
    ) {
      throw new Error(`Capture artifact bytes or coverage changed: ${path}`);
    }
    records.push(capture);
  }
  if (!baseline && expected.size > 0) {
    throw new Error(`Missing capture records: ${[...expected].join(", ")}`);
  }
  return records;
}

function covering_capture(
  captures: readonly RecordValue[],
  artifact: string,
): RecordValue | undefined {
  return captures.find(
    (capture) =>
      Array.isArray(capture.artifacts) &&
      capture.artifacts.some((proof: unknown) => record(proof)?.file === artifact),
  );
}

function capture_for_artifact(captures: readonly RecordValue[], artifact: string): RecordValue {
  const capture = covering_capture(captures, artifact);
  if (capture === undefined) throw new Error(`No scope receipt covers ${artifact}`);
  const metadata = record(capture.metadata);
  if (metadata === undefined) throw new Error(`No capture metadata for ${artifact}`);
  return metadata;
}

function baseline_context_of(artifact: RecordValue | undefined): RecordValue | undefined {
  return record(artifact?.baselineContext) ?? record(record(artifact?.source)?.baselineContext);
}

/**
 * The baseline release, read from its engine captures: each records the older
 * engine measured under the candidate's harness, and they must all agree.
 */
async function read_baseline_identity(baseline_dir: string): Promise<BaselineIdentity> {
  const labels = new Set<string>();
  for (const artifact of Object.keys(ENGINE_ONLY_ARTIFACTS)) {
    const file = Bun.file(resolve(baseline_dir, artifact));
    if (!(await file.exists())) continue;
    const label = baseline_context_of(record(await file.json()))?.label;
    labels.add(typeof label === "string" ? label : "");
  }
  const [engine_label] = labels;
  const parsed = engine_label === undefined ? undefined : parseEngineBaselineLabel(engine_label);
  if (labels.size !== 1 || engine_label === undefined || parsed === undefined) {
    throw new Error("Baseline engine captures do not name one frozen-harness baseline release");
  }
  return {
    engineLabel: engine_label,
    baseVersion: parsed.engineVersion,
    harnessVersion: parsed.harnessVersion,
  };
}

function assert_matching_conditions(
  baseline: readonly RecordValue[],
  candidate: readonly RecordValue[],
): Readonly<Record<string, string>> {
  const first = record(candidate[0]?.metadata);
  if (first === undefined) throw new Error("No candidate capture conditions");
  const fields = [
    "machine",
    "cpu",
    "bun",
    "node",
    "npm",
    "kernel",
    "cpuSlot",
    "effectiveMemoryMaxBytes",
  ];
  for (const capture of [...baseline, ...candidate]) {
    const metadata = record(capture.metadata);
    for (const field of fields) {
      if (metadata?.[field] !== first[field])
        throw new Error(`Capture conditions differ: ${field}`);
    }
  }
  const before = capture_for_artifact(baseline, "data-results.json");
  const after = capture_for_artifact(candidate, "data-results.json");
  // Both data captures run the same harness: the same bench-only patch, or none when the
  // baseline release's own harness already follows the current data protocol.
  const patch = before.harnessPatchSha256;
  if (
    patch !== after.harnessPatchSha256 ||
    (patch !== undefined && (typeof patch !== "string" || !/^[a-f0-9]{64}$/.test(patch)))
  ) {
    throw new Error("Data captures do not record the same harness patch");
  }

  return matchingCaptureAffinities(baseline, candidate);
}

async function compare_suite(
  artifact: string,
  results_dir: string,
  baseline_dir: string,
  base_commit: string,
  candidate_commit: string,
  baseline_captures: readonly RecordValue[],
  candidate_captures: readonly RecordValue[],
  identity: BaselineIdentity,
) {
  const base_file = Bun.file(resolve(baseline_dir, artifact));
  const base: unknown = (await base_file.exists()) ? await base_file.json() : null;
  const candidate_file = Bun.file(resolve(results_dir, artifact));
  const candidate: unknown = (await candidate_file.exists()) ? await candidate_file.json() : null;
  // The baseline release measured a suite exactly when its result set has that suite's receipt.
  const new_only = covering_capture(baseline_captures, artifact) === undefined;
  if (candidate === null || (base === null && !new_only))
    throw new Error(`Missing fresh capture for ${artifact}`);
  if (new_only && base !== null) throw new Error(`No scope receipt covers baseline ${artifact}`);
  const candidate_capture = capture_for_artifact(candidate_captures, artifact);
  const baseline_capture = new_only ? null : capture_for_artifact(baseline_captures, artifact);
  const base_stamp = stamp_of(base);
  if (
    stamp_of(candidate)?.commit !== candidate_commit ||
    stamp_of(candidate)?.dirty === true ||
    (baseline_capture !== null &&
      (base_stamp?.dirty === true ||
        (base_stamp?.commit !== baseline_capture.commit &&
          base_stamp?.commit !== baseline_capture.harnessCommit)))
  ) {
    throw new Error(`Wrong commit or dirty source in ${artifact}`);
  }
  const baseline_object = record(base);
  const candidate_object = record(candidate);
  if (artifact === "data-results.json") {
    const old_meta = record(baseline_object?.meta);
    const new_meta = record(candidate_object?.meta);
    if (
      baseline_object?.protocolVersion !== DATA_GATE_PROTOCOL_VERSION ||
      candidate_object?.protocolVersion !== DATA_GATE_PROTOCOL_VERSION ||
      baseline_object.matrixId !== candidate_object.matrixId ||
      old_meta?.gcBetweenSamples !== true ||
      new_meta?.gcBetweenSamples !== true ||
      old_meta.freshDocumentBetweenIngestSamples !== true ||
      new_meta.freshDocumentBetweenIngestSamples !== true
    ) {
      throw new Error(
        "Data protocol mismatch: both sides require v2, untimed full GC, and fresh ingest documents",
      );
    }
  }
  if (ENGINE_ONLY_ARTIFACTS[artifact] && !new_only) {
    const context = baseline_context_of(baseline_object);
    if (
      context?.label !== identity.engineLabel ||
      context.engineCommit !== base_commit ||
      context.harnessCommit !== candidate_commit
    ) {
      throw new Error(`Missing frozen-harness engine identity in ${artifact}`);
    }
  }
  const base_metrics = extract_metrics(base);
  const candidate_metrics = extract_metrics(candidate);
  const core_only_keys = new Set<string>();
  for (const key of base_metrics.keys()) {
    if (
      key.includes("grid-constant-edit") ||
      (artifact === "full-engine-results.json" && key.includes(".initialization."))
    ) {
      core_only_keys.add(key);
      base_metrics.delete(key);
    }
  }
  const keys = [...new Set([...base_metrics.keys(), ...candidate_metrics.keys()])].sort();
  const metrics = keys.map((key) => {
    const metric = compare_metric(
      artifact,
      base_metrics.get(key),
      candidate_metrics.get(key),
      keys.length,
    );
    if (core_only_keys.has(key))
      metric.note = `${identity.harnessVersion}-only: timed current-core path; no version ratio`;
    else if (metric.verdict === "new-only" && ENGINE_ONLY_ARTIFACTS[artifact])
      metric.note = `not in ${identity.baseVersion}`;
    return metric;
  });
  const count = (verdict: Verdict) => metrics.filter((metric) => metric.verdict === verdict).length;
  return {
    artifact,
    status: new_only ? "new-only" : "compared",
    comparisonLabel: ENGINE_ONLY_ARTIFACTS[artifact] ? identity.engineLabel : identity.baseVersion,
    base: base_stamp,
    candidate: stamp_of(candidate),
    baselineCapture: baseline_capture,
    candidateCapture: candidate_capture,
    threshold: threshold_of(artifact),
    summary: {
      metrics: metrics.length,
      regression: count("regression"),
      improvement: count("improvement"),
      withinNoise: count("within-noise"),
      slower: count("slower"),
      faster: count("faster"),
      unchanged: count("unchanged"),
      newOnly: count("new-only"),
      removed: count("removed"),
      ceilingFailures: metrics.filter((metric) => metric.ceilingPassed === false).length,
    },
    metrics,
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((argument) => argument !== "--"),
    options: {
      // A label for the baseline in the output; the commit itself comes from the capture metadata.
      // It defaults to the release branch of the baseline release.
      "base-ref": { type: "string" },
      // The baseline release's result set, with its capture receipts.
      "baseline-results-dir": { type: "string" },
      "results-dir": { type: "string", default: "results" },
      output: { type: "string", default: "results/release-comparison.json" },
    },
  });
  const generator_commit = git(["rev-parse", "HEAD"]);
  const dirty = sourceTreeDirty(false);
  const generated_at = new Date().toISOString();
  if (dirty) throw new Error("Comparison source tree must be clean");
  const results_dir = resolve(BENCH_ROOT, values["results-dir"]);
  const baseline_results_dir = values["baseline-results-dir"];
  if (baseline_results_dir === undefined) throw new Error("--baseline-results-dir is required");
  const baseline_dir = resolve(BENCH_ROOT, baseline_results_dir);
  const identity = await read_baseline_identity(baseline_dir);
  // Both measured commits come from the capture metadata: captures run on frozen
  // commits, and this generator may run from a later tooling commit. They are
  // provenance only: receipts and artifacts are matched against them as strings,
  // so a clone need not contain either commit.
  const capture_metadata = record(
    await Bun.file(resolve(results_dir, "release-capture-metadata.json")).json(),
  );
  const commit_id = /^[a-f0-9]{40}$/u;
  const candidate_commit = capture_metadata?.captureCommit;
  const base_commit = capture_metadata?.baselineEngineCommit;
  if (
    typeof candidate_commit !== "string" ||
    !commit_id.test(candidate_commit) ||
    typeof base_commit !== "string" ||
    !commit_id.test(base_commit)
  ) {
    throw new Error("Capture methodology metadata does not identify the measured commits");
  }
  const baseline_captures = await read_capture_records(baseline_dir, base_commit, true);
  const candidate_captures = await read_capture_records(results_dir, candidate_commit, false);
  const effective_cpu_affinity_by_suite = assert_matching_conditions(
    baseline_captures,
    candidate_captures,
  );
  // assert_matching_conditions proved these fields equal across every capture.
  const conditions = record(candidate_captures[0]?.metadata);
  const suites = [];
  for (const artifact of RELEASE_ARTIFACTS)
    suites.push(
      await compare_suite(
        artifact,
        results_dir,
        baseline_dir,
        base_commit,
        candidate_commit,
        baseline_captures,
        candidate_captures,
        identity,
      ),
    );

  const comparison = {
    schemaVersion: 1,
    protocol: "sheetwrite-release-comparison-v1",
    generatedAt: generated_at,
    captureMetadata: capture_metadata,
    meta: {
      commit: candidate_commit,
      dirty,
      timestamp: generated_at,
      generatorCommit: generator_commit,
      machine: conditions?.machine,
      cpu: conditions?.cpu,
      bun: conditions?.bun,
      node: conditions?.node,
      npm: conditions?.npm,
      kernel: conditions?.kernel,
      effectiveCpuAffinityBySuite: effective_cpu_affinity_by_suite,
      cpuSlotMeaning:
        "Reserved entry slot; effectiveCpuAffinityBySuite records the per-suite mask.",
      legacyAffinitySource:
        "Receipts without an explicit mask or override marker use their original slot mask; these are not observed-affinity proofs.",
      memoryMax: CAPTURE_MEMORY_MAX,
      effectiveMemoryMaxBytes: CAPTURE_MEMORY_BYTES,
      memoryMaxProof: `MemoryMax=${CAPTURE_MEMORY_BYTES}`,
      cpuSlot: CAPTURE_CPU_SLOT,
    },
    base: {
      ref: values["base-ref"] ?? `release/version-${identity.baseVersion}`,
      commit: base_commit,
      captureRecords: baseline_captures,
    },
    candidate: { commit: candidate_commit, dirty, captureRecords: candidate_captures },
    reduction:
      "Median of per-round medians and median of per-round p95s for repeated keys; single-record summaries are preserved. Round labels are not paired between independent captures. Missing metrics are never silently dropped. Ratios are candidate/base; zero base gives null except zero/zero = 1. Lower is better; faster/slower for byte/count/ratio metrics means decreased/increased. This artifact is descriptive release evidence, not controlled gate approval.",
    suites,
  };
  const output = resolve(BENCH_ROOT, values.output);
  mkdirSync(dirname(output), { recursive: true });
  await Bun.write(output, `${JSON.stringify(comparison, null, 2)}\n`);
  process.stderr.write(
    `Wrote ${output}: ${suites.length} suites, ${suites.reduce((total, suite) => total + suite.metrics.length, 0)} metrics\n`,
  );
}

if (import.meta.main) await main();
