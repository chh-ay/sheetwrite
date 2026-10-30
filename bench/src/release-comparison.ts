import { mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { matchingCaptureAffinities, readCaptureArtifacts } from "./capture-scope.js";
import { independentMedianDeltaLowerBound } from "./check.js";
import { CONTROLLED_COMPARISON_POLICY } from "./controlled-baseline.js";
import { DATA_GATE_PROTOCOL_VERSION } from "./gate-protocol.js";
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
const NEW_ONLY_SUITES: Readonly<Record<string, true>> = { "chart-tracking": true, pivot: true };
const ENGINE_ONLY_ARTIFACTS: Readonly<Record<string, true>> = {
  "formula-results.json": true,
  "formula-default-results.json": true,
  "formula-full-results.json": true,
  "full-engine-results.json": true,
  "full-engine-matched-results.json": true,
};
const ENGINE_BASELINE_LABEL = "0.5.4 engine (WASM) under 0.6 core and harness";
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
const ARTIFACTS = [
  ...new Set([...RELEASE_ARTIFACTS, "pivot-results.json", "chart-tracking-results.json"]),
];

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

function pointOf(value: RecordValue): Point | undefined {
  const medianValue = value.median ?? value.medianMs;
  const p95 = value.p95 ?? value.p95Ms;
  if (!finite(medianValue) || !finite(p95)) return undefined;

  const mad = value.mad ?? value.madMs ?? value.observedMadMs;

  return {
    median: medianValue,
    p95,
    ...(finite(mad) ? { mad } : {}),
    ...(finite(value.max) ? { max: value.max } : {}),
  };
}

function unitOf(key: string, value: RecordValue): Unit {
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

function extractMetrics(artifact: unknown): Map<string, ExtractedMetric> {
  const metrics = new Map<string, ExtractedMetric>();

  function visit(
    value: unknown,
    path: string,
    leaf: string,
    inherited: Record<string, string | number>,
  ): void {
    if (Array.isArray(value)) {
      value.forEach((element: unknown, index: number) => {
        const elementRecord = record(element);
        const labels = elementRecord === undefined ? {} : identity(elementRecord);
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

    const point = pointOf(fields);
    if (point !== undefined) {
      const existing = metrics.get(path);
      const samples =
        Array.isArray(fields.samplesMs) && fields.samplesMs.every(finite) ? fields.samplesMs : [];
      if (existing === undefined) {
        metrics.set(path, {
          key: path,
          unit: unitOf(leaf, fields),
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

function reduceMetric(metric: ExtractedMetric | undefined): Point | null {
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

function thresholdOf(artifact: string) {
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

function compareMetric(
  artifact: string,
  base: ExtractedMetric | undefined,
  candidate: ExtractedMetric | undefined,
  familySize: number,
): MetricComparison {
  const metric = candidate ?? base;
  if (metric === undefined) throw new Error(`${artifact}: missing both metric sides`);

  const oldPoint = reduceMetric(base);
  const newPoint = reduceMetric(candidate);
  const comparison: MetricComparison = {
    key: metric.key,
    unit: metric.unit,
    rounds: { base: base?.points.length ?? 0, candidate: candidate?.points.length ?? 0 },
    base: oldPoint,
    candidate: newPoint,
    medianRatio: oldPoint && newPoint ? ratio(newPoint.median, oldPoint.median) : null,
    p95Ratio: oldPoint && newPoint ? ratio(newPoint.p95, oldPoint.p95) : null,
    medianDelta: oldPoint && newPoint ? newPoint.median - oldPoint.median : null,
    p95Delta: oldPoint && newPoint ? newPoint.p95 - oldPoint.p95 : null,
    verdict:
      oldPoint === null
        ? "new-only"
        : newPoint === null
          ? "removed"
          : newPoint.median > oldPoint.median
            ? "slower"
            : newPoint.median < oldPoint.median
              ? "faster"
              : "unchanged",
    limit: null,
  };

  if (artifact === "interaction-results.json" && newPoint !== null) {
    const key = metric.key.replace(/^values\./, "");
    const ceiling = INTERACTION_LIMITS.get(key);
    if (ceiling !== undefined) {
      comparison.limit = ceiling;
      comparison.ceilingPassed =
        (key === "lookupP95Ns" ? newPoint.median : (newPoint.max ?? Number.POSITIVE_INFINITY)) <=
        ceiling;
      if (!comparison.ceilingPassed) comparison.verdict = "regression";
    }
  }

  if (oldPoint === null || newPoint === null) return comparison;

  if (artifact === "render-baseline.json" && base !== undefined && candidate !== undefined) {
    comparison.limit = CONTROLLED_COMPARISON_POLICY.maximumRegressionMs;
    comparison.lowerConfidenceBoundMs = independentMedianDeltaLowerBound(
      base.samples,
      candidate.samples,
      metric.key,
      familySize,
    );
    const improvementBound = independentMedianDeltaLowerBound(
      candidate.samples,
      base.samples,
      metric.key,
      familySize,
    );
    comparison.verdict =
      comparison.lowerConfidenceBoundMs > comparison.limit
        ? "regression"
        : improvementBound > comparison.limit
          ? "improvement"
          : "within-noise";
  }

  if (thresholdOf(artifact).kind === "formula-release-limit") {
    if (metric.key.endsWith(".stat")) {
      const isSubMillisecond = oldPoint.median < 1;
      const floor = isSubMillisecond ? SUB_MILLISECOND_MEDIAN_FLOOR_MS : RELEASE_FORMULA_FLOOR_MS;
      const medianLimit = Math.max(
        oldPoint.median * RELEASE_FORMULA_RATIO_LIMIT,
        oldPoint.median + floor,
      );
      const p95Limit = Math.max(oldPoint.p95 * RELEASE_FORMULA_RATIO_LIMIT, oldPoint.p95 + floor);
      comparison.limit = medianLimit;
      comparison.verdict =
        newPoint.median > medianLimit || (!isSubMillisecond && newPoint.p95 > p95Limit)
          ? "regression"
          : newPoint.median < oldPoint.median
            ? "faster"
            : "within-noise";
    } else if (metric.unit === "bytes" || metric.unit === "count") {
      comparison.limit = oldPoint.median;
      if (newPoint.median > oldPoint.median || newPoint.p95 > oldPoint.p95) {
        comparison.verdict = "regression";
      }
    }
  }

  return comparison;
}

function stampOf(value: unknown): RecordValue | null {
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

async function readCaptureRecords(
  directory: string,
  engineCommit: string,
  baseline: boolean,
): Promise<readonly RecordValue[]> {
  // Sorted: directory order differs between filesystems, and the comparison embeds these records.
  const paths = readdirSync(resolve(directory, "capture-runs"))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const expected = new Set(
    [...RELEASE_SUITE_ARTIFACTS.keys()].filter((suite) => !baseline || !NEW_ONLY_SUITES[suite]),
  );
  const records: RecordValue[] = [];
  for (const path of paths) {
    const capture = record(await Bun.file(resolve(directory, "capture-runs", path)).json());
    const metadata = record(capture?.metadata);
    if (metadata?.purpose === "rehearsal") continue;
    const label = capture?.label;
    if (
      capture?.status !== "passed" ||
      metadata?.engineCommit !== engineCommit ||
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
  if (expected.size > 0) throw new Error(`Missing capture records: ${[...expected].join(", ")}`);
  return records;
}

function captureForArtifact(captures: readonly RecordValue[], artifact: string): RecordValue {
  const capture = captures.find(
    (capture) =>
      Array.isArray(capture.artifacts) &&
      capture.artifacts.some((proof: unknown) => record(proof)?.file === artifact),
  );
  if (capture === undefined) throw new Error(`No scope receipt covers ${artifact}`);
  const metadata = record(capture.metadata);
  if (metadata === undefined) throw new Error(`No capture metadata for ${artifact}`);
  return metadata;
}

function assertMatchingConditions(
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
  const before = captureForArtifact(baseline, "data-results.json");
  const after = captureForArtifact(candidate, "data-results.json");
  if (
    typeof before.harnessPatchSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(before.harnessPatchSha256) ||
    before.harnessPatchSha256 !== after.harnessPatchSha256
  ) {
    throw new Error("Data captures do not record the same harness patch");
  }

  return matchingCaptureAffinities(baseline, candidate);
}

async function compareSuite(
  artifact: string,
  resultsDir: string,
  baselineDir: string,
  baseCommit: string,
  candidateCommit: string,
  baselineCaptures: readonly RecordValue[],
  candidateCaptures: readonly RecordValue[],
) {
  const baseFile = Bun.file(resolve(baselineDir, artifact));
  const base: unknown = (await baseFile.exists()) ? await baseFile.json() : null;
  const candidateFile = Bun.file(resolve(resultsDir, artifact));
  const candidate: unknown = (await candidateFile.exists()) ? await candidateFile.json() : null;
  const newOnly = artifact === "chart-tracking-results.json" || artifact === "pivot-results.json";
  if (candidate === null || (base === null && !newOnly))
    throw new Error(`Missing fresh capture for ${artifact}`);
  const candidateCapture = captureForArtifact(candidateCaptures, artifact);
  const baselineCapture = newOnly ? null : captureForArtifact(baselineCaptures, artifact);
  const baseStamp = stampOf(base);
  if (
    stampOf(candidate)?.commit !== candidateCommit ||
    stampOf(candidate)?.dirty === true ||
    (baselineCapture !== null &&
      (baseStamp?.dirty === true ||
        (baseStamp?.commit !== baselineCapture.commit &&
          baseStamp?.commit !== baselineCapture.harnessCommit)))
  ) {
    throw new Error(`Wrong commit or dirty source in ${artifact}`);
  }
  const baselineObject = record(base);
  const candidateObject = record(candidate);
  if (artifact === "data-results.json") {
    const oldMeta = record(baselineObject?.meta);
    const newMeta = record(candidateObject?.meta);
    if (
      baselineObject?.protocolVersion !== DATA_GATE_PROTOCOL_VERSION ||
      candidateObject?.protocolVersion !== DATA_GATE_PROTOCOL_VERSION ||
      baselineObject.matrixId !== candidateObject.matrixId ||
      oldMeta?.gcBetweenSamples !== true ||
      newMeta?.gcBetweenSamples !== true ||
      oldMeta.freshDocumentBetweenIngestSamples !== true ||
      newMeta.freshDocumentBetweenIngestSamples !== true
    ) {
      throw new Error(
        "Data protocol mismatch: both sides require v2, untimed full GC, and fresh ingest documents",
      );
    }
  }
  if (ENGINE_ONLY_ARTIFACTS[artifact]) {
    const context =
      record(baselineObject?.baselineContext) ??
      record(record(baselineObject?.source)?.baselineContext);
    if (
      context?.label !== ENGINE_BASELINE_LABEL ||
      context.engineCommit !== baseCommit ||
      context.harnessCommit !== candidateCommit
    ) {
      throw new Error(`Missing frozen-harness engine identity in ${artifact}`);
    }
  }
  const baseMetrics = extractMetrics(base);
  const candidateMetrics = extractMetrics(candidate);
  const coreOnlyKeys = new Set<string>();
  for (const key of baseMetrics.keys()) {
    if (
      key.includes("grid-constant-edit") ||
      (artifact === "full-engine-results.json" && key.includes(".initialization."))
    ) {
      coreOnlyKeys.add(key);
      baseMetrics.delete(key);
    }
  }
  const keys = [...new Set([...baseMetrics.keys(), ...candidateMetrics.keys()])].sort();
  const metrics = keys.map((key) => {
    const metric = compareMetric(
      artifact,
      baseMetrics.get(key),
      candidateMetrics.get(key),
      keys.length,
    );
    if (coreOnlyKeys.has(key)) metric.note = "0.6-only: timed current-core path; no version ratio";
    else if (metric.verdict === "new-only" && ENGINE_ONLY_ARTIFACTS[artifact])
      metric.note = "not in 0.5.4";
    return metric;
  });
  const count = (verdict: Verdict) => metrics.filter((metric) => metric.verdict === verdict).length;
  return {
    artifact,
    status: newOnly ? "new-only" : "compared",
    comparisonLabel: ENGINE_ONLY_ARTIFACTS[artifact] ? ENGINE_BASELINE_LABEL : "0.5.4",
    base: baseStamp,
    candidate: stampOf(candidate),
    baselineCapture,
    candidateCapture,
    threshold: thresholdOf(artifact),
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
      "base-ref": { type: "string", default: "release/version-0.5.4" },
      "baseline-results-dir": { type: "string", default: "results/releases/0.5.4" },
      "results-dir": { type: "string", default: "results" },
      output: { type: "string", default: "results/release-comparison.json" },
    },
  });
  const generatorCommit = git(["rev-parse", "HEAD"]);
  const dirty = sourceTreeDirty(false);
  const generatedAt = new Date().toISOString();
  if (dirty) throw new Error("Comparison source tree must be clean");
  const resultsDir = resolve(BENCH_ROOT, values["results-dir"]);
  const baselineDir = resolve(BENCH_ROOT, values["baseline-results-dir"]);
  // Both measured commits come from the capture metadata: captures run on frozen
  // commits, and this generator may run from a later tooling commit. They are
  // provenance only: receipts and artifacts are matched against them as strings,
  // so a clone need not contain either commit.
  const captureMetadata = record(
    await Bun.file(resolve(resultsDir, "release-capture-metadata.json")).json(),
  );
  const commitId = /^[a-f0-9]{40}$/u;
  const candidateCommit = captureMetadata?.captureCommit;
  const baseCommit = captureMetadata?.baselineEngineCommit;
  if (
    typeof candidateCommit !== "string" ||
    !commitId.test(candidateCommit) ||
    typeof baseCommit !== "string" ||
    !commitId.test(baseCommit)
  ) {
    throw new Error("Capture methodology metadata does not identify the measured commits");
  }
  const baselineCaptures = await readCaptureRecords(baselineDir, baseCommit, true);
  const candidateCaptures = await readCaptureRecords(resultsDir, candidateCommit, false);
  const effectiveCpuAffinityBySuite = assertMatchingConditions(baselineCaptures, candidateCaptures);
  // assertMatchingConditions proved these fields equal across every capture.
  const conditions = record(candidateCaptures[0]?.metadata);
  const suites = [];
  for (const artifact of ARTIFACTS)
    suites.push(
      await compareSuite(
        artifact,
        resultsDir,
        baselineDir,
        baseCommit,
        candidateCommit,
        baselineCaptures,
        candidateCaptures,
      ),
    );

  const comparison = {
    schemaVersion: 1,
    protocol: "sheetwrite-release-comparison-v1",
    generatedAt,
    captureMetadata,
    meta: {
      commit: candidateCommit,
      dirty,
      timestamp: generatedAt,
      generatorCommit,
      machine: conditions?.machine,
      cpu: conditions?.cpu,
      bun: conditions?.bun,
      node: conditions?.node,
      npm: conditions?.npm,
      kernel: conditions?.kernel,
      effectiveCpuAffinityBySuite,
      cpuSlotMeaning:
        "Reserved entry slot; effectiveCpuAffinityBySuite records the per-suite mask.",
      legacyAffinitySource:
        "Receipts without an explicit mask or override marker use their original slot mask; these are not observed-affinity proofs.",
      memoryMax: CAPTURE_MEMORY_MAX,
      effectiveMemoryMaxBytes: CAPTURE_MEMORY_BYTES,
      memoryMaxProof: `MemoryMax=${CAPTURE_MEMORY_BYTES}`,
      cpuSlot: CAPTURE_CPU_SLOT,
    },
    base: { ref: values["base-ref"], commit: baseCommit, captureRecords: baselineCaptures },
    candidate: { commit: candidateCommit, dirty, captureRecords: candidateCaptures },
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
