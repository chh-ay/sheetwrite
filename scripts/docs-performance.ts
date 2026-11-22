import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { validateEngineVersions } from "../bench/src/engine-versions.js";
import { DATA_GATE_PROTOCOL_VERSION } from "../bench/src/gate-protocol.js";
import { median } from "../bench/src/stats.js";
import { inlineIcon } from "../docs/src/icons/inline-icon.js";
import { formatTimes, type PerfRow, type PerfStat } from "../docs/src/lib/perf-bars.js";
import type { ChangeMachine } from "../docs/src/lib/release-change.js";
import {
  renderSpeedupStory,
  STORY_CATEGORIES,
  type StoryMachine,
} from "../docs/src/lib/speedup-story.js";
import { exists, frontmatter, posix, repositoryRoot } from "./docs-shared.js";
import {
  allMeasurements,
  evidenceHeadline,
  formatCaptureTime,
  formatCount,
  formatMs,
  html,
  provenanceList,
  readableId,
  readableText,
  shortHash,
} from "./evidence-format.js";
import {
  renderFullEngineEvidence,
  validateFullEngineArtifact,
  validateMatchedEngineArtifact,
} from "./full-engine-docs.js";
import {
  type CaptureMachine,
  captureMachines,
  captureNote,
  FASTEST_TO_P95,
  fastestToP95,
  type MachineEvidence,
  machineCaptureLines,
  machineFailure,
  machineGroups,
  machineName,
  perfFigure,
  releaseChange,
  type RunStat,
  speedStory,
} from "./perf-figures.js";
import {
  renderChartTrackingSection,
  renderPivotSection,
  renderReleaseComparisonSection,
  validateChartTrackingArtifact,
  validatePivotArtifact,
  validateReleaseComparisonArtifact,
} from "./release-performance-docs.js";
import {
  formatMetricDelta,
  formatMetricDisplay,
  type Metric,
  type SizeHistory,
  type SizeReport,
  validateSizeHistory,
} from "./size-report.js";

interface EvidenceState {
  available: false;
  reason: string;
  source: string;
  reproduction: string;
}

interface RenderEvidenceResult {
  engine: string;
  scenarioId: string;
  round: number;
  rows: number;
  status: string;
  medianMs: number;
  p95Ms: number;
  madMs: number;
  memory: { beforeBytes: number; afterBytes: number; deltaBytes: number };
  validation: Array<{ passed: boolean }>;
  /** Recorded only on failures: where the scenario stopped and what it reported. */
  stage?: string;
  errorClass?: string;
  message?: string;
}

interface ValidatedRenderEvidence {
  protocolVersion: number;
  metadata: {
    commit: string;
    dirty: boolean;
    timestamp: string;
    bunVersion: string;
    nodeVersion: string;
    browserVersion: string;
    os: string;
    arch: string;
    cpu: string;
    engineVersions: Readonly<Record<"sheetwrite" | "handsontable", string>>;
    rounds: number;
    launchAttempts: Array<{ success: boolean }>;
  };
  config: { engines: string[]; rows: number[]; scenarios: string[] };
  results: RenderEvidenceResult[];
  completeness?: { failedKeys: string[]; missingKeys: string[]; complete: boolean };
}

interface CaptureMeta {
  commit: string;
  dirty: boolean;
  timestamp: string;
}

function capture_meta_of(value: Record<string, unknown>): CaptureMeta | undefined {
  const raw = value.metadata ?? value.meta;
  if (raw === null || typeof raw !== "object") return undefined;
  const meta = raw as Record<string, unknown>;
  if (
    typeof meta.commit !== "string" ||
    meta.dirty !== false ||
    typeof meta.timestamp !== "string" ||
    !Number.isFinite(Date.parse(meta.timestamp))
  ) {
    return undefined;
  }
  return { commit: meta.commit, dirty: meta.dirty, timestamp: meta.timestamp };
}

/**
 * Landing-page benchmark summary. Each engine is aggregated across rounds
 * like the evidence page, then ratios pair per scenario - never a
 * ratio of cross-scenario medians. Real numbers only: when the artifact is
 * missing or invalid the landing renders a "run the protocol" placeholder.
 */
export async function renderLandingBench(): Promise<string> {
  const size_report = JSON.parse(
    await readFile(join(repositoryRoot, "scripts/size-report.json"), "utf8"),
  ) as Pick<SizeReport, "metrics">;
  const full_engine = await load_evidence(
    "bench/results/full-engine-results.json",
    "bun run --filter @sheetwrite/bench bench:formula:engines",
    validateFullEngineArtifact,
  );
  const machines = captureMachines();
  const scale = await load_machine_captures(
    machines,
    "render-scale.json",
    "bun run --filter @sheetwrite/bench bench:render:scale",
    validate_render_artifact,
  );
  return landingBenchPayload(
    scale.release,
    "evidence" in full_engine
      ? landingDownloads(size_report.metrics, full_engine.evidence.engines)
      : undefined,
  );
}

/**
 * The speed story as built HTML, for the landing page and the performance
 * showcase. It is its own generated file, inlined by the server render and
 * fetched as an asset after a client-side navigation, so no page script
 * carries it (docs/src/routes/index.tsx and showcases.performance.tsx import it).
 */
export async function renderLandingStory(): Promise<string> {
  const scale = await load_machine_captures(
    captureMachines(),
    "render-scale.json",
    "bun run --filter @sheetwrite/bench bench:render:scale",
    validate_render_artifact,
  );
  return scale.machines.length === 0
    ? ""
    : renderSpeedupStory(
        { id: "story", baseName: "Handsontable", machines: story_machines(scale.machines) },
        (name) => inlineIcon(name),
      );
}

/** Download sizes on the landing page, Brotli-compressed as browsers fetch them. */
export interface LandingDownloads {
  /** JavaScript, WASM and CSS of `@sheetwrite/core` in a Vite production build. */
  coreFirstLoadBrotliBytes: number;
  defaultEngineBrotliBytes: number;
  fullEngineBrotliBytes: number;
}

const CORE_FIRST_LOAD_METRICS = ["javascript", "wasm", "css"].map(
  (kind) => `bundler.vite.coreInitial.${kind}.brotliBytes`,
);

/** A size the landing can show: present and a finite number of bytes. */
function is_known_bytes(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

/**
 * Reads the landing download sizes from the size report and the engine
 * artifact. Any missing or non-finite part yields `undefined`: a partial sum
 * would understate the download.
 */
export function landingDownloads(
  metrics: Readonly<Record<string, Pick<Metric, "actual">>>,
  engines: ReadonlyArray<{ engine: string; wasm: { brotliBytes: number } }>,
): LandingDownloads | undefined {
  const first_load = CORE_FIRST_LOAD_METRICS.map((key) => metrics[key]?.actual);
  const default_engine = engines.find((entry) => entry.engine === "default")?.wasm.brotliBytes;
  const full_engine = engines.find((entry) => entry.engine === "full")?.wasm.brotliBytes;

  if (
    !first_load.every(is_known_bytes) ||
    !is_known_bytes(default_engine) ||
    !is_known_bytes(full_engine)
  ) {
    return undefined;
  }

  return {
    coreFirstLoadBrotliBytes: first_load.reduce((sum, bytes) => sum + bytes, 0),
    defaultEngineBrotliBytes: default_engine,
    fullEngineBrotliBytes: full_engine,
  };
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Per size, how many times faster Sheetwrite is than Handsontable: the ratio
 * pairs per scenario, then the median across scenarios. Sizes with zero
 * full-round pairs are omitted rather than emitted as NaN (JSON.stringify
 * silently turns NaN into null, which would render as a number).
 */
function landing_sizes(evidence: ValidatedRenderEvidence) {
  const successes = (size: number, engine: string, scenario: string): RenderEvidenceResult[] =>
    evidence.results.filter(
      (result) =>
        result.rows === size &&
        result.engine === engine &&
        result.scenarioId === scenario &&
        result.status === "success",
    );
  return evidence.config.rows.flatMap((size) => {
    const ratios: Array<{ scenario: string; ratio: number }> = [];
    let handsontable_incomplete = 0;
    for (const scenario of evidence.config.scenarios) {
      const ours = successes(size, "sheetwrite", scenario);
      const theirs = successes(size, "handsontable", scenario);
      // Round-aware: a bucket with fewer successes than the declared round
      // count is incomplete, and only full-round pairs enter the ratios.
      if (theirs.length < evidence.metadata.rounds) handsontable_incomplete += 1;
      if (ours.length < evidence.metadata.rounds || theirs.length < evidence.metadata.rounds)
        continue;
      ratios.push({
        scenario,
        ratio: median(theirs.map((r) => r.medianMs)) / median(ours.map((r) => r.medianMs)),
      });
    }
    if (ratios.length === 0) return [];
    const best = ratios.reduce((a, b) => (b.ratio > a.ratio ? b : a));
    return [
      {
        size,
        comparedScenarios: ratios.length,
        medianRatio: round1(median(ratios.map((r) => r.ratio))),
        bestRatio: round1(best.ratio),
        bestScenario: best.scenario,
        handsontableIncomplete: handsontable_incomplete,
      },
    ];
  });
}

/** Pure payload builder, exported so the finite/fallback contract is testable. */
export function landingBenchPayload(
  scale: { evidence: ValidatedRenderEvidence; source: string } | EvidenceState,
  downloads?: LandingDownloads,
): string {
  // Download sizes do not depend on the benchmark, so both payloads carry them.
  const downloads_field = downloads ? { downloads } : {};
  const unavailable = (reason: string): string =>
    `${JSON.stringify({ available: false, reason, ...downloads_field }, null, 2)}\n`;
  if (!("evidence" in scale)) return unavailable(scale.reason);
  const { evidence } = scale;
  const successes = (size: number, engine: string, scenario: string): RenderEvidenceResult[] =>
    evidence.results.filter(
      (result) =>
        result.rows === size &&
        result.engine === engine &&
        result.scenarioId === scenario &&
        result.status === "success",
    );
  const sizes = landing_sizes(evidence);
  const scenario_medians: number[] = [];
  const scenario_heaps: number[] = [];
  for (const scenario of evidence.config.scenarios) {
    const bucket = successes(1_000_000, "sheetwrite", scenario);
    // Hero stats hold the same full-round bar as the ratio pairs.
    if (bucket.length < evidence.metadata.rounds) continue;
    scenario_medians.push(median(bucket.map((r) => r.medianMs)));
    scenario_heaps.push(median(bucket.map((r) => r.memory.afterBytes)));
  }
  const hero_stats = {
    millionRowScenarios: scenario_medians.length,
    millionRowMedianMs: round1(median(scenario_medians)),
    millionRowHeapMb: Math.round(median(scenario_heaps) / 1_000_000),
  };
  const displayed = [
    ...sizes.flatMap((entry) => [entry.medianRatio, entry.bestRatio]),
    hero_stats.millionRowMedianMs,
    hero_stats.millionRowHeapMb,
  ];

  // Never publish a payload whose displayed values are not all finite: a
  // structurally valid artifact with no comparable pairs must fall back to
  // the "run the protocol" placeholder, not render null.
  if (sizes.length === 0 || displayed.some((value) => !Number.isFinite(value))) {
    return unavailable("artifact has no full-round engine pairs to compare");
  }
  const payload = {
    available: true,
    capture: {
      commit: evidence.metadata.commit,
      timestamp: evidence.metadata.timestamp,
      browser: `Chromium ${evidence.metadata.browserVersion}`,
      rounds: evidence.metadata.rounds,
      engineVersions: evidence.metadata.engineVersions,
    },
    heroStats: hero_stats,
    sizes,
    ...downloads_field,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

async function load_evidence<T>(
  rel_path: string,
  reproduction: string,
  validate: (value: Record<string, unknown>) => T | string,
): Promise<{ evidence: T; source: string } | EvidenceState> {
  const path = join(repositoryRoot, rel_path);
  const source = posix(relative(repositoryRoot, path));
  if (!(await exists(path)))
    return { available: false, reason: "artifact is missing", source, reproduction };
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    if (capture_meta_of(value) === undefined) {
      return {
        available: false,
        reason:
          "artifact has no clean-tree protocol stamp (commit, timestamp, dirty=false), so freshness cannot be established",
        source,
        reproduction,
      };
    }
    const evidence = validate(value);
    if (typeof evidence === "string") {
      return { available: false, reason: evidence, source, reproduction };
    }
    return { evidence, source };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return {
      available: false,
      reason: `artifact could not be validated: ${error.message}`,
      source,
      reproduction,
    };
  }
}

/** One artifact as every machine captured it. */
interface MachineCaptures<T> {
  /** The Linux release machine's capture: each section renders only when it validates. */
  readonly release: { evidence: T; source: string } | EvidenceState;
  /** Every machine whose capture validates, Linux first; each is its own group of bars. */
  readonly machines: readonly MachineEvidence<T>[];
  /** Other machines' captures that do not validate, for the pending list. */
  readonly otherPending: readonly EvidenceState[];
}

const MACHINE_REPRODUCTION =
  "cd bench && bun run bench:release:machine -- --machine mac --release <version> --checkout <clean checkout of the release, packages built> --xlsx-baseline-root <XLSX baseline checkout>";

/** Loads `artifact` from every machine's results directory. */
async function load_machine_captures<T>(
  machines: readonly CaptureMachine[],
  artifact: string,
  reproduction: string,
  validate: (value: Record<string, unknown>) => T | string,
): Promise<MachineCaptures<T>> {
  const loaded = await Promise.all(
    machines.map(async (machine) => ({
      machine,
      state: await load_evidence(
        `${machine.directory}/${artifact}`,
        machine.machine === "linux" ? reproduction : MACHINE_REPRODUCTION,
        validate,
      ),
    })),
  );
  const release = loaded[0]?.state;
  if (release === undefined) throw new Error("the Linux release machine has no results directory");
  return {
    release,
    machines: loaded.flatMap(({ machine, state }) =>
      "evidence" in state ? [{ machine, evidence: state.evidence, source: state.source }] : [],
    ),
    otherPending: loaded.slice(1).flatMap(({ machine, state }) => {
      if ("evidence" in state) return [];
      const failure = machineFailure(machine, artifact);
      return [failure === undefined ? state : { ...state, reason: failure }];
    }),
  };
}

function validate_render_artifact(
  value: Record<string, unknown>,
): ValidatedRenderEvidence | string {
  const artifact = value as unknown as Partial<ValidatedRenderEvidence>;
  const metadata = artifact.metadata;
  const config = artifact.config;
  const results = artifact.results;
  if (
    artifact.protocolVersion !== 1 ||
    metadata === undefined ||
    !Number.isInteger(metadata.rounds) ||
    metadata.rounds < 1 ||
    !Array.isArray(metadata.launchAttempts) ||
    !metadata.launchAttempts.every((attempt) => attempt.success === true) ||
    config === undefined ||
    !Array.isArray(config.engines) ||
    !Array.isArray(config.rows) ||
    !Array.isArray(config.scenarios) ||
    !Array.isArray(results)
  ) {
    return "artifact does not match controlled render protocol version 1";
  }
  validateEngineVersions(metadata.engineVersions, ["sheetwrite", "handsontable"]);

  // Failed cells are allowed - the page reports them as crashes.
  // Failed cells legitimately carry null samples; only successes must be finite.
  const valid = results.every(
    (result) =>
      result.status !== "success" ||
      (Number.isFinite(result.medianMs) &&
        Number.isFinite(result.p95Ms) &&
        Number.isFinite(result.memory?.afterBytes) &&
        Array.isArray(result.validation)),
  );
  if (!valid) return "controlled render results carry non-finite samples";
  return artifact as ValidatedRenderEvidence;
}

interface CorePathsEvidence {
  schemaVersion: number;
  protocol: string;
  mode: string;
  metadata: CaptureMeta;
  toolchain: { bun: string; nodeCompat: string; cpu: string };
  methodology: { timing: string; scope: string };
  scale: Record<string, number>;
  scenarios: Array<{
    id: string;
    unit: string;
    samplesMs: number[];
    timing: { median: number; p95: number; min?: number; iters: number };
    counters: Record<string, number>;
    observations?: Record<string, string>;
    variants?: Array<{
      id: string;
      samplesMs: number[];
      timing: { median: number; p95: number; min?: number; iters: number };
    }>;
    validation: string;
  }>;
}

/**
 * Full-mode core-path capture. The artifact is written by `bench:core-paths`;
 * each reported scenario needs finite timings and a written validation
 * checkpoint to be publishable.
 */
function validate_core_paths_artifact(value: Record<string, unknown>): CorePathsEvidence | string {
  const artifact = value as unknown as Partial<CorePathsEvidence>;
  if (
    artifact.schemaVersion !== 1 ||
    artifact.protocol !== "sheetwrite-core-paths-v1" ||
    artifact.mode !== "full"
  ) {
    return "artifact is not a full-mode core-path capture";
  }
  if (!Array.isArray(artifact.scenarios) || artifact.scenarios.length === 0) {
    return "artifact carries no core-path scenarios";
  }
  for (const scenario of artifact.scenarios) {
    const timings = [scenario.timing, ...(scenario.variants ?? []).map((entry) => entry.timing)];
    if (
      typeof scenario.unit !== "string" ||
      scenario.unit.length === 0 ||
      typeof scenario.validation !== "string" ||
      scenario.validation.length === 0 ||
      timings.some(
        (timing) =>
          !Number.isFinite(timing?.median) ||
          !Number.isFinite(timing?.p95) ||
          !Number.isInteger(timing?.iters) ||
          timing.iters < 1,
      )
    ) {
      return "core-path scenarios carry an unvalidated or non-finite timing";
    }
  }
  return artifact as CorePathsEvidence;
}

interface XlsxEvidence {
  protocol: string;
  mode: string;
  metadata: CaptureMeta & {
    engineVersions: Readonly<Record<"sheetwrite" | "exceljs", string>>;
  };
  rounds: number;
  maxBaselineRatio: number;
  fixture: { path: string; bytes: number; sha256: string; producer: string };
  toolchain: { bun: string; node: string; cpu: string; baselineCommit?: string };
  summaries: Array<{
    engine: string;
    operation: string;
    scenario: string;
    durationMs: { median: number; p95: number; mad: number; iters: number };
    maxRssBytes: { median: number; p95: number; mad: number; max: number };
  }>;
  comparisons: Array<{
    operation: string;
    scenario: string;
    medianWallRatio: number;
    peakRssRatio: number;
  }>;
}

function validate_xlsx_artifact(value: Record<string, unknown>): XlsxEvidence | string {
  const artifact = value as unknown as Partial<XlsxEvidence>;
  if (
    (artifact.protocol !== "sheetwrite-xlsx-codec-v1" &&
      artifact.protocol !== "sheetwrite-xlsx-codec-v2") ||
    artifact.mode !== "full"
  ) {
    return "artifact is not a full-mode XLSX codec capture";
  }
  validateEngineVersions(artifact.metadata?.engineVersions, ["sheetwrite", "exceljs"]);
  if (!/^[0-9a-f]{40}$/u.test(artifact.toolchain?.baselineCommit ?? "")) {
    return "XLSX comparison is missing its measured baseline commit";
  }
  const rounds = artifact.rounds;
  if (
    typeof rounds !== "number" ||
    !Number.isInteger(rounds) ||
    rounds < 1 ||
    !Array.isArray(artifact.summaries) ||
    artifact.summaries.length === 0 ||
    !Array.isArray(artifact.comparisons)
  ) {
    return "XLSX capture is missing its rounds, summaries, or comparisons";
  }
  if (
    artifact.summaries.some(
      (summary) =>
        !Number.isFinite(summary?.durationMs?.median) ||
        !Number.isFinite(summary?.durationMs?.p95) ||
        !Number.isFinite(summary?.maxRssBytes?.max),
    )
  ) {
    return "XLSX summaries carry non-finite samples";
  }
  return artifact as XlsxEvidence;
}

interface DataEvidence {
  protocolVersion: number;
  mode: string;
  meta: CaptureMeta & {
    bun: string;
    engineVersions: Readonly<Record<"sheetwrite" | "handsontable", string>>;
  };
  sheetwrite: Record<string, { rows: number; stats: Record<string, RunStat> }>;
  handsontable: Record<string, { rows: number; stats: Record<string, RunStat> }>;
}

/** Sizes both engines complete headlessly; the data page compares the engines here. */
const DATA_HEAD_TO_HEAD_ROWS = [1_000, 10_000] as const;
/** Sizes the data page shows for Sheetwrite alone. */
const DATA_SCALE_ROWS = [100_000, 500_000, 1_000_000] as const;
const DATA_OPERATIONS = ["ingest", "windowRead", "edit", "sort", "filter", "aggregate"] as const;

/**
 * Accepts a data capture only when it holds every row and operation the data
 * page renders, so "Validated evidence" never heads an empty or partial figure.
 */
export function validateDataArtifact(value: Record<string, unknown>): DataEvidence | string {
  const artifact = value as unknown as Partial<DataEvidence>;
  if (artifact.protocolVersion !== DATA_GATE_PROTOCOL_VERSION || artifact.mode !== "full") {
    return "artifact is not a full-mode data protocol capture";
  }
  validateEngineVersions(artifact.meta?.engineVersions, ["sheetwrite", "handsontable"]);
  const required = [
    ["sheetwrite", [...DATA_HEAD_TO_HEAD_ROWS, ...DATA_SCALE_ROWS]],
    ["handsontable", DATA_HEAD_TO_HEAD_ROWS],
  ] as const;
  for (const [engine, rows_list] of required) {
    const block = artifact[engine];
    if (block === undefined || typeof block !== "object") return `artifact lacks ${engine} results`;
    for (const rows of rows_list) {
      const stats = block[String(rows)]?.stats;
      for (const operation of DATA_OPERATIONS) {
        const stat = stats?.[operation];
        if (stat === undefined) return `artifact lacks ${engine} ${operation} at ${rows} rows`;
        if (!Number.isFinite(stat.median) || !Number.isFinite(stat.p95)) {
          return "data medians carry non-finite samples";
        }
      }
    }
  }
  return artifact as DataEvidence;
}

interface FormulaEvidence {
  protocolVersion: number;
  mode: string;
  meta: CaptureMeta;
  workloads: Array<{ id: string; size: number; stat: RunStat }>;
  memory: Array<{ formulas: number; wasmDeltaBytes: number }>;
}

function validate_formula_artifact(value: Record<string, unknown>): FormulaEvidence | string {
  const artifact = value as unknown as Partial<FormulaEvidence>;
  if (artifact.protocolVersion !== 1 || artifact.mode !== "full") {
    return "artifact is not a full-mode formula protocol capture";
  }
  if (!Array.isArray(artifact.workloads) || artifact.workloads.length === 0) {
    return "artifact carries no formula workloads";
  }
  if (
    !artifact.workloads.every(
      (workload) => Number.isFinite(workload.stat?.median) && Number.isFinite(workload.stat?.p95),
    )
  ) {
    return "formula workloads carry non-finite samples";
  }
  return artifact as FormulaEvidence;
}

const BENCH_SIZES = [1_000, 10_000, 100_000, 1_000_000] as const;

function fmt_rows(rows: number): string {
  return rows >= 1_000_000 ? `${rows / 1_000_000}M` : `${rows / 1_000}k`;
}

/** The median of per-round values, banded by the lowest and highest round. */
function across_rounds(values: readonly number[]): PerfStat | undefined {
  if (values.length === 0) return undefined;
  return { value: median([...values]), spread: [Math.min(...values), Math.max(...values)] };
}

/** Panels of bars behind size tabs (and, for the render benchmark, metric tabs). */
interface TabbedPanels {
  /** Radio group name, which also prefixes each size tab's ID: `bench-size` → `bench-size-1000`. */
  readonly name: "bench-size" | "bench-data";
  readonly sizes: readonly number[];
  readonly panels: ReadonlyArray<{ size: number; metric?: "speed" | "memory"; figure: string }>;
  readonly metricTabs: boolean;
}

/** Size tabs over panels of bars, without client JavaScript. */
function size_tabs({ name, sizes, panels, metricTabs: metric_tabs }: TabbedPanels): string {
  const radio_name = name === "bench-data" ? "bench-data-size" : name;
  return [
    `<div class="bench-widget${name === "bench-data" ? " bench-widget--data" : ""}" data-pagefind-ignore>`,
    // No checked attribute: hydrated React treats it as a controlled input
    // and reverts user toggles. The default tab lives in CSS.
    ...sizes.map((size) => `<input type="radio" name="${radio_name}" id="${name}-${size}">`),
    ...(metric_tabs
      ? [
          '<input type="radio" name="bench-metric" id="bench-metric-speed">',
          '<input type="radio" name="bench-metric" id="bench-metric-memory">',
        ]
      : []),
    '<div class="bench-widget__tabs">',
    '<div class="bench-tabs" aria-label="Workbook size">',
    ...sizes.map((size) => `<label for="${name}-${size}">${fmt_rows(size)} rows</label>`),
    "</div>",
    ...(metric_tabs
      ? [
          '<div class="bench-tabs bench-tabs--metric" aria-label="Metric">',
          '<label for="bench-metric-speed">Speed</label>',
          '<label for="bench-metric-memory">Memory</label>',
          "</div>",
        ]
      : []),
    "</div>",
    ...panels.map(
      (panel) =>
        `<section class="bench-panel" data-size="${panel.size}"${panel.metric ? ` data-metric="${panel.metric}"` : ""}>\n${panel.figure}\n</section>`,
    ),
    "</div>",
  ].join("\n");
}

function bench_method(
  summary: string,
  paragraphs: string[],
  entries: Array<[string, string]>,
): string {
  return [
    '<details class="bench-method" data-pagefind-ignore>',
    `<summary>${summary}</summary>`,
    '<div class="bench-method__body">',
    ...paragraphs.map((paragraph) => `<p>${paragraph}</p>`),
    "<dl>",
    ...entries.map(([term, def]) => `<div><dt><code>${term}</code></dt><dd>${def}</dd></div>`),
    "</dl>",
    "</div>",
    "</details>",
  ].join("\n");
}

const RENDER_METHOD = bench_method(
  "Methodology: what each scenario does",
  [
    "Live grid in controlled headless Chromium. Ten counterbalanced rounds; all fourteen scenarios run warm per mount, and the fixture is rebuilt after any failure so crashes cannot leak state. Every scenario must prove its effect (scroll really moved, editor really opened, rows really changed) or it fails.",
    "Each measured sample repeats one logical action until it covers at least 100 ms of measured time, so timer resolution and scheduler jitter cannot decide a sample. Every raw sample is retained in the artifact.",
    "Bright = median round, faded = p95 round. <strong>Did not complete</strong> = recorded crash, timeout, or failed checkpoint - never a timing. The failure table names the stage and the recorded error behind every missing cell.",
  ],
  [
    [
      "scroll-down.top-left",
      "From the origin, jump-scroll 50 px down: a fresh row band enters the viewport and must paint.",
    ],
    [
      "scroll-down.middle",
      "The same 50 px jump starting from the vertical middle of the scroll range.",
    ],
    [
      "scroll-smooth.same-window",
      "Scroll 1 px without changing the visible row window: pure repaint cost, zero new data.",
    ],
    ["scroll-right.top-left", "Jump-scroll 50 px right: a fresh column band paints."],
    ["edit-open.top-left", "Select a cell near the origin and open its editor."],
    ["edit-open.middle", "Open the editor on the center cell of the workbook."],
    [
      "edit-open.bottom-right",
      "Open the editor on the last row and column - the far end of every index.",
    ],
    ["edit-commit.middle", "Commit a typed value into the center cell and paint the result."],
    ["altering.insert-5-rows-top", "Insert five rows at the top: every following row reindexes."],
    ["altering.remove-5-rows-top", "Remove those five rows again - the inverse reindex."],
    [
      "arrow-down.top-left",
      "Move the selection one cell down with the arrow key, including the selection overlay repaint.",
    ],
    ["arrow-right.middle", "Arrow-key selection move at the workbook center."],
    ["formatted-paint.top-left", "Repaint a viewport dense with per-cell formatting."],
    [
      "merge-heavy.paint",
      "Repaint a viewport dense with merged ranges; Sheetwrite additionally proves it builds exactly one merge revision index.",
    ],
  ],
);

const DATA_METHOD = bench_method(
  "Methodology: what each operation does",
  [
    "Identical columnar datasets, per-operation warmup and iteration plans. Fresh instance per ingest; window reads rotate offsets to defeat caches; sort and filter reset between runs; Handsontable edits run with rendering suspended so only its data path is timed.",
    "Memory = JS-heap delta around one ingest in an isolated subprocess, plus Sheetwrite's WASM linear-memory delta.",
  ],
  [
    ["ingest", "Load the full dataset into a fresh engine instance."],
    ["windowRead", "Read a 50x5 cell window at a rotating offset that sweeps the whole sheet."],
    ["edit", "1,000 single-cell edits."],
    ["sort", "Sort by the numeric amount column."],
    ["filter", "Substring filter over the city column."],
    ["aggregate", "Numeric aggregation over the amount column."],
  ],
);

const FORMULA_METHOD = bench_method(
  "Methodology: what each workload does",
  [
    "Each workload builds a fresh WASM cell-store of the named dependency shape and times the recalculation from one action - usually a single edit. Sizes are formula-cell counts; bright = median, faded = p95.",
  ],
  [
    ["linear-chain", "A chain A1 -> A2 -> ... -> AN; editing the head recomputes the full depth."],
    ["wide-fan-out-edit", "One scalar feeds N dependent formulas; edit the scalar."],
    ["diamond-edit", "Fan-out that reconverges (diamond graph); edit the apex."],
    ["shared-range-edit", "N formulas aggregate one shared range; edit one cell inside it."],
    ["distinct-range-edit", "Each formula owns its own range; one edit recomputes only its owner."],
    ["cross-sheet-range-edit", "Summary-sheet formulas range over another sheet; edit the source."],
    [
      "scalar-edit-affects-N",
      "One scalar edit invalidating exactly N dependents; N=0 touches an unrelated cell, so it prices pure dependency lookup.",
    ],
    ["topology-remove-add", "Remove and re-add rows so the dependency graph itself changes shape."],
    ["cycles", "Introduce a reference cycle; detection and cycle-error propagation."],
    [
      "removed-sheet-ref",
      "Formulas referencing a deleted sheet must all degrade to reference errors.",
    ],
    ["error-propagation", "An error value (=1/0) flows through every dependent."],
    [
      "criteria-range-edit",
      "Criteria-style aggregation (SUMIF shape) over 100k cells; edit inside the criteria range.",
    ],
    [
      "lookup-range-edit",
      "Lookup-shape formulas over 100k cells; edit inside the looked-up range.",
    ],
  ],
);

/** Each scenario at one size: Handsontable is the base, Sheetwrite the measured bar. */
function render_rows(
  evidence: ValidatedRenderEvidence,
  size: number,
  metric: "speed" | "memory",
): PerfRow[] {
  const round_value = (result: RenderEvidenceResult): number =>
    metric === "speed" ? result.medianMs : result.memory.afterBytes;
  const stat_of = (engine: string, scenario: string): PerfStat | undefined =>
    across_rounds(
      evidence.results
        .filter(
          (result) =>
            result.rows === size &&
            result.engine === engine &&
            result.scenarioId === scenario &&
            result.status === "success",
        )
        .map(round_value),
    );
  return evidence.config.scenarios.map((scenario) => {
    const handsontable = stat_of("handsontable", scenario);
    const sheetwrite = stat_of("sheetwrite", scenario);
    return {
      label: readableId(scenario),
      id: scenario,
      bars: [
        { label: "Handsontable", role: "base", ...(handsontable ? { stat: handsontable } : {}) },
        { label: "Sheetwrite", role: "measured", ...(sheetwrite ? { stat: sheetwrite } : {}) },
      ],
    };
  });
}

/** The workbook size the speed story leads with. */
const STORY_ROWS = 100_000;

/** Each render scenario's kind in the speed story, named after the scenario family. */
const STORY_CATEGORY_OF: ReadonlyArray<readonly [RegExp, (typeof STORY_CATEGORIES)[number]]> = [
  [/^scroll-/u, "Scroll"],
  [/^edit-/u, "Edit"],
  [/^altering\./u, "Insert/remove rows"],
  [/paint/u, "Paint"],
  [/^arrow-/u, "Keyboard"],
];

/** Each render scenario named within its kind, for the speed story's numbers table. */
const STORY_SHORT_LABELS: Readonly<Record<string, string>> = {
  "scroll-down.top-left": "Down 50 px from the top",
  "scroll-down.middle": "Down 50 px from the middle",
  "scroll-smooth.same-window": "1 px, same rows",
  "scroll-right.top-left": "Right 50 px",
  "edit-open.top-left": "Open editor, top left",
  "edit-open.middle": "Open editor, middle",
  "edit-open.bottom-right": "Open editor, last cell",
  "edit-commit.middle": "Commit a value",
  "altering.insert-5-rows-top": "Insert 5 rows at the top",
  "altering.remove-5-rows-top": "Remove 5 rows at the top",
  "arrow-down.top-left": "Arrow down, top left",
  "arrow-right.middle": "Arrow right, middle",
  "formatted-paint.top-left": "Formatted cells",
  "merge-heavy.paint": "Merged cells",
};

/** Each machine's interactions at `STORY_ROWS`: the speed story's data, on the pages and the landing. */
function story_machines(
  machines: readonly MachineEvidence<ValidatedRenderEvidence>[],
): StoryMachine[] {
  return machines.map(({ machine, evidence }) => {
    const { name, detail } = machineName(machine);
    const rounds = (engine: string, scenario: string): number[] =>
      evidence.results
        .filter(
          (result) =>
            result.rows === STORY_ROWS &&
            result.engine === engine &&
            result.scenarioId === scenario &&
            result.status === "success",
        )
        .map((result) => result.medianMs);
    return {
      machine: machine.machine,
      name,
      detail,
      note: `${formatCount(STORY_ROWS)} rows · median of ${evidence.metadata.rounds} rounds · Chromium ${evidence.metadata.browserVersion} · captured ${evidence.metadata.timestamp.slice(0, 10)}`,
      interactions: evidence.config.scenarios.flatMap((scenario) => {
        const ours = rounds("sheetwrite", scenario);
        const theirs = rounds("handsontable", scenario);
        if (ours.length === 0) return [];
        return [
          {
            id: scenario,
            label: readableId(scenario),
            shortLabel: STORY_SHORT_LABELS[scenario] ?? readableId(scenario),
            category: STORY_CATEGORY_OF.find(([pattern]) => pattern.test(scenario))?.[1] ?? "Paint",
            measured: {
              value: median(ours),
              spread: [Math.min(...ours), Math.max(...ours)] as const,
            },
            ...(theirs.length === 0 ? {} : { base: median(theirs) }),
          },
        ];
      }),
    };
  });
}

/** Headline cards, the speedup overview and every number, per machine at `STORY_ROWS`. */
function render_speed_story(machines: readonly MachineEvidence<ValidatedRenderEvidence>[]): string {
  return speedStory({
    id: "render-story",
    baseName: "Handsontable",
    machines: story_machines(machines),
  });
}

function render_bench_widget(
  evidence: ValidatedRenderEvidence,
  machines: readonly MachineEvidence<ValidatedRenderEvidence>[],
): string {
  const sizes = BENCH_SIZES.filter((size) => evidence.config.rows.includes(size));
  const note = (capture: ValidatedRenderEvidence): string =>
    `${captureNote(capture.metadata)} · ${capture.metadata.rounds} rounds · Chromium ${capture.metadata.browserVersion}`;
  const panels = sizes.flatMap((size) =>
    (["speed", "memory"] as const).map((metric) => ({
      size,
      metric,
      figure: perfFigure({
        id: `render-${metric}-${size}`,
        title:
          metric === "speed"
            ? `Median interaction time at ${fmt_rows(size)} rows`
            : `Renderer heap after the interaction at ${fmt_rows(size)} rows`,
        unit: metric === "speed" ? "ms" : "bytes",
        scale: metric === "speed" ? "log" : "linear",
        rowHeader: "Interaction",
        verdictWords: metric === "speed" ? ["faster", "slower"] : ["smaller heap", "larger heap"],
        series: { base: "Handsontable", measured: "Sheetwrite" },
        spreadLabel: "Lowest to highest round",
        groups: machineGroups(machines, (capture) => render_rows(capture, size, metric), note),
      }),
    })),
  );
  return [
    size_tabs({ name: "bench-size", sizes, panels, metricTabs: true }),
    "",
    "Each bar is the median of the per-round medians; the band runs from the lowest to the highest round. The verdict compares Sheetwrite with Handsontable on the same machine and reads within noise when the two bands overlap. Each machine has its own axis: results from different machines are never compared. A run that did not finish shows as not completed, never as a timing; the failure table below names its recorded error.",
  ].join("\n");
}

/** Head-to-head store operations at the sizes both engines complete. */
function data_widget(machines: readonly MachineEvidence<DataEvidence>[]): string {
  const panels = DATA_HEAD_TO_HEAD_ROWS.map((rows) => ({
    size: rows,
    figure: perfFigure({
      id: `data-${rows}`,
      title: `Median operation time at ${fmt_rows(rows)} rows`,
      unit: "ms",
      scale: "log",
      rowHeader: "Operation",
      series: { base: "Handsontable", measured: "Sheetwrite" },
      spreadLabel: FASTEST_TO_P95,
      groups: machineGroups(
        machines,
        (capture) =>
          DATA_OPERATIONS.map((operation) => {
            const handsontable = capture.handsontable[String(rows)]?.stats[operation];
            const sheetwrite = capture.sheetwrite[String(rows)]?.stats[operation];
            return {
              label: readableId(operation),
              id: operation,
              bars: [
                {
                  label: "Handsontable",
                  role: "base",
                  ...(handsontable ? { stat: fastestToP95(handsontable) } : {}),
                },
                {
                  label: "Sheetwrite",
                  role: "measured",
                  ...(sheetwrite ? { stat: fastestToP95(sheetwrite) } : {}),
                },
              ],
            };
          }),
        (capture) => captureNote(capture.meta),
      ),
    }),
  }));
  return size_tabs({
    name: "bench-data",
    sizes: DATA_HEAD_TO_HEAD_ROWS,
    panels,
    metricTabs: false,
  });
}

/** Sheetwrite alone at the sizes Handsontable does not complete headlessly. */
function data_scale_figure(machines: readonly MachineEvidence<DataEvidence>[]): string {
  return perfFigure({
    id: "data-scale",
    title: "Median operation time, Sheetwrite at scale",
    unit: "ms",
    scale: "log",
    rowHeader: "Operation",
    spreadLabel: FASTEST_TO_P95,
    groups: machineGroups(
      machines,
      (capture) =>
        DATA_OPERATIONS.map((operation) => ({
          label: readableId(operation),
          id: operation,
          bars: DATA_SCALE_ROWS.flatMap((rows) => {
            const stat = capture.sheetwrite[String(rows)]?.stats[operation];
            return stat === undefined
              ? []
              : [
                  {
                    label: `${fmt_rows(rows)} rows`,
                    role: "measured" as const,
                    stat: fastestToP95(stat),
                  },
                ];
          }),
        })),
      (capture) => captureNote(capture.meta),
    ),
  });
}

/**
 * The scalar-edit-affects-N workloads are one series: recompute cost tracks the
 * affected dependents, not the sheet size. As separate rows their near-zero
 * baselines would read like broken benchmarks.
 */
const SCALAR_FAMILY = /^scalar-edit-affects-(\d+)$/u;

function formula_rows(capture: FormulaEvidence): PerfRow[] {
  const scalar = capture.workloads.flatMap((workload) => {
    const affected = SCALAR_FAMILY.exec(workload.id)?.[1];
    return affected === undefined ? [] : [{ workload, affected: Number(affected) }];
  });
  const ids = [
    ...new Set(
      capture.workloads.map((workload) => workload.id).filter((id) => !SCALAR_FAMILY.test(id)),
    ),
  ].sort();
  const rows: PerfRow[] = ids.map((id) => ({
    label: readableId(id),
    id,
    bars: capture.workloads
      .filter((workload) => workload.id === id)
      .sort((left, right) => left.size - right.size)
      .map((workload) => ({
        label: `${formatCount(workload.size)} ${workload.size === 1 ? "cell" : "cells"}`,
        role: "measured" as const,
        stat: fastestToP95(workload.stat),
      })),
  }));
  if (scalar.length > 0) {
    rows.push({
      label: "Scalar edit affects N formulas",
      id: "scalar-edit-affects-N",
      bars: scalar
        .sort((left, right) => left.affected - right.affected)
        .map(({ workload, affected }) => ({
          label: `${formatCount(affected)} affected`,
          role: "measured" as const,
          stat: fastestToP95(workload.stat),
        })),
    });
  }
  return rows;
}

function formula_figure(machines: readonly MachineEvidence<FormulaEvidence>[]): string {
  return perfFigure({
    id: "formula-workloads",
    title: "Median recalculation time",
    unit: "ms",
    scale: "log",
    rowHeader: "Workload",
    spreadLabel: FASTEST_TO_P95,
    groups: machineGroups(machines, formula_rows, (capture) => captureNote(capture.meta)),
  });
}

/**
 * "countif-100k" at 100,000 cells reads "Countif · 100,000 cells": a size the
 * ID repeats is dropped from the name, so the label states it once.
 */
function workload_label(id: string, size: number): string {
  const scalar = /^scalar-edit-affects-(\d+)$/u.exec(id);
  if (scalar?.[1] !== undefined) {
    return `Scalar edit read by ${formatCount(Number(scalar[1]))} formulas`;
  }
  const name = id.replace(/-(\d+)(k?)$/u, (suffix, digits: string, thousands: string) =>
    Number(digits) * (thousands ? 1000 : 1) === size ? "" : suffix,
  );
  return `${readableId(name)} · ${formatCount(size)} ${size === 1 ? "cell" : "cells"}`;
}

/** Where `bench:engine-comparison` writes each machine's captures, by platform. */
const ENGINE_COMPARISON_DIRECTORIES: ReadonlyArray<{
  readonly machine: "linux" | "mac";
  readonly directory: string;
}> = [
  { machine: "linux", directory: "bench/results/engine-comparison/linux" },
  { machine: "mac", directory: "bench/results/engine-comparison/darwin" },
];

interface EngineComparisonManifest {
  readonly protocol: string;
  readonly base: { readonly version: string; readonly commit: string };
  readonly candidate: { readonly commit: string };
  readonly machine: { readonly cpu: string; readonly bun: string; readonly powerProfile: string };
  readonly finishedAt: string;
}

/** The name the pages use for the engine on develop, before its release. */
const NEXT_ENGINE = "0.7.0 engine";

/** The workloads both formula captures timed, keyed "id/size". */
function shared_medians(
  left: FormulaEvidence,
  right: FormulaEvidence,
): Array<readonly [left: number, right: number]> {
  return left.workloads.flatMap((workload) => {
    const other = right.workloads.find(
      (entry) => entry.id === workload.id && entry.size === workload.size,
    );
    return other === undefined ? [] : [[workload.stat.median, other.stat.median] as const];
  });
}

/**
 * The next release's formula engine against the last release, on every
 * machine; a machine without a capture reads "pending". Both sides ran in one
 * process tree on the same CPUs, so the comparison holds only within a machine.
 */
async function render_engine_change(machines: readonly CaptureMachine[]): Promise<string[]> {
  const entries: ChangeMachine[] = [];
  let base_name = "";
  let window_note = "";
  for (const { machine, directory } of ENGINE_COMPARISON_DIRECTORIES) {
    const owner = machines.find((entry) => entry.machine === machine);
    const { name, detail } =
      owner === undefined
        ? { name: machine === "linux" ? "Linux" : "Mac", detail: "" }
        : machineName(owner);
    const manifest_path = join(repositoryRoot, directory, "capture.json");
    if (!(await exists(manifest_path))) {
      entries.push({
        machine,
        name,
        detail,
        pending: "Pending: this machine's capture follows with the next release capture.",
      });
      continue;
    }
    const manifest = JSON.parse(await readFile(manifest_path, "utf8")) as EngineComparisonManifest;
    if (manifest.protocol !== "sheetwrite-engine-comparison-v3") {
      throw new Error(`${directory}/capture.json is not an engine comparison manifest`);
    }
    const command = "cd bench && bun run bench:engine-comparison";
    const [base, candidate, control] = await Promise.all(
      ["formula-base.json", "formula-candidate.json", "formula-control.json"].map((file) =>
        load_evidence(`${directory}/${file}`, command, validate_formula_artifact),
      ),
    );
    if (
      base === undefined ||
      candidate === undefined ||
      control === undefined ||
      !("evidence" in base) ||
      !("evidence" in candidate) ||
      !("evidence" in control)
    ) {
      throw new Error(`${directory} holds an engine comparison whose captures do not validate`);
    }
    base_name = manifest.base.version;
    const workloads = candidate.evidence.workloads.flatMap((measured) => {
      const before = base.evidence.workloads.find(
        (workload) => workload.id === measured.id && workload.size === measured.size,
      );
      return before === undefined
        ? []
        : [
            {
              id: `${measured.id}/${measured.size}`,
              label: workload_label(measured.id, measured.size),
              base: fastestToP95(before.stat),
              measured: fastestToP95(measured.stat),
            },
          ];
    });
    entries.push({
      machine,
      name,
      detail,
      note: `Captured ${manifest.finishedAt.slice(0, 10)} · develop ${manifest.candidate.commit.slice(0, 7)} against ${manifest.base.version} (${manifest.base.commit.slice(0, 7)}) · Bun ${manifest.machine.bun}`,
      workloads,
    });
    // The release's own benchmark on its own engine, timed in the same window, set beside the release capture.
    const release =
      owner === undefined
        ? undefined
        : await load_evidence(
            `${owner.directory}/formula-results.json`,
            "bun run --filter @sheetwrite/bench bench:formula",
            validate_formula_artifact,
          );
    if (release !== undefined && "evidence" in release) {
      const pairs = shared_medians(control.evidence, release.evidence);
      const slowdown = median(pairs.map(([window, captured]) => window / captured));
      window_note = `On ${name}, the absolute times here are not comparable with the release capture under "Every workload": ${manifest.base.version}'s own benchmark, run on its own engine in this window, took a median ${formatTimes(slowdown)} its release-capture time (power profile ${manifest.machine.powerProfile}). Compare times only within this figure.`;
    }
  }
  if (entries.every((entry) => entry.workloads === undefined)) return [];
  return [
    `### The ${NEXT_ENGINE}`,
    "",
    `The formula engine on develop, measured against the last release on the same machine and CPUs. A workload is faster or slower only when its run ranges (fastest to p95 run) do not overlap.`,
    "",
    releaseChange({
      id: "engine-change",
      baseName: base_name,
      measuredName: NEXT_ENGINE,
      machines: entries,
    }),
    "",
    ...(window_note === "" ? [] : [window_note, ""]),
    "Reproduce with clean, built checkouts of the last release and of develop, from `bench/`:",
    "",
    '```sh partial="needs clean, built checkouts of the release and of develop" title="Engine comparison"',
    "bun run bench:engine-comparison -- --base 0.6.0 --base-checkout <v0.6.0 checkout> --candidate-checkout <develop checkout>",
    "```",
    "",
  ];
}

/**
 * Run-completion arithmetic for the evidence headline. `results` already
 * contains failed entries - failedKeys must never be added on top.
 */
export function runCompletionSummary(results: ReadonlyArray<{ status: string }>): {
  successes: number;
  total: number;
  failures: number;
} {
  const successes = results.filter((result) => result.status === "success").length;
  return { successes, total: results.length, failures: results.length - successes };
}

interface EvidenceCapture {
  readonly label: string;
  readonly source: string;
  readonly meta: CaptureMeta;
}

/** Every loaded artifact states its capture stamp as either `meta` or `metadata`. */
type CapturedEvidence =
  | { evidence: { meta?: CaptureMeta; metadata?: CaptureMeta }; source: string }
  | EvidenceState;

/**
 * Release captures run before the version bump, so they record the previous
 * release's package version. Each entry maps such a capture commit to the
 * release it measured.
 */
const RELEASE_CANDIDATE_CAPTURES: Readonly<Record<string, string>> = {
  "49e05e298c3f39a8cede038fe8d0062343abc21f": "0.5.0",
};

function sheetwrite_label(recorded_version: string, commit: string): string {
  const release = RELEASE_CANDIDATE_CAPTURES[commit];
  return html(
    release === undefined
      ? `Sheetwrite ${recorded_version}`
      : `Sheetwrite ${release} release candidate`,
  );
}

/**
 * One capture header for the whole page. A page assembled from artifacts of one
 * commit states that single point-in-time capture; a page assembled from
 * different commits lists every vintage instead of letting each section's own
 * commit line hide the mismatch.
 */
function render_capture_header(captures: readonly EvidenceCapture[]): string[] {
  const first = captures[0];
  if (first === undefined) return [];
  const commits = new Set(captures.map((capture) => capture.meta.commit));
  const timestamps = captures.map((capture) => capture.meta.timestamp).sort();
  const earliest = timestamps[0];
  const latest = timestamps.at(-1);
  if (earliest === undefined || latest === undefined) return [];
  const window =
    formatCaptureTime(earliest) === formatCaptureTime(latest)
      ? formatCaptureTime(earliest)
      : `${formatCaptureTime(earliest)} → ${formatCaptureTime(latest)}`;
  if (commits.size === 1) {
    return [
      "## Capture",
      "",
      ...provenanceList([
        ["Captured", `${window} UTC`],
        ["Commit", `${shortHash(first.meta.commit)} clean worktree`],
        [
          "Artifacts",
          `${captures.length} validated captures from that one commit; each section states its own environment (browser or runtime) and protocol`,
        ],
      ]),
    ];
  }
  const vintages = [...captures].sort(
    (left, right) =>
      left.meta.timestamp.localeCompare(right.meta.timestamp) ||
      left.label.localeCompare(right.label),
  );
  return [
    "## Capture",
    "",
    '<div class="evidence-mixed" data-pagefind-ignore><strong>Mixed capture vintages.</strong> The sections below were captured at different commits. Each section is internally consistent and each one names its own commit; the page as a whole is not a single point-in-time measurement.</div>',
    "",
    "| Section | Artifact | Commit | Captured |",
    "| --- | --- | --- | --- |",
    ...vintages.map(
      (capture) =>
        `| ${capture.label} | \`${capture.source}\` | ${shortHash(capture.meta.commit)} | ${formatCaptureTime(capture.meta.timestamp)} UTC |`,
    ),
    "",
  ];
}

/**
 * Failures grouped by the cell that produced them. A run that did not finish is
 * never converted into a timing, so the failure list is part of the evidence:
 * it names the stage and the recorded error behind every missing cell.
 */
function render_failure_table(evidence: ValidatedRenderEvidence): string[] {
  const failures = evidence.results.filter((result) => result.status !== "success");
  if (failures.length === 0) return [];
  const groups = new Map<
    string,
    { engine: string; rows: number; scenario: string; stage: string; error: string; cells: number }
  >();
  for (const failure of failures) {
    const stage = failure.stage ?? "unrecorded";
    const error = [failure.errorClass, failure.message]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(": ")
      .replaceAll("|", "\\|");
    const key = [failure.engine, failure.rows, failure.scenarioId, stage, error].join("\u0000");
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, {
        engine: failure.engine,
        rows: failure.rows,
        scenario: failure.scenarioId,
        stage,
        error: error.length > 0 ? error : "not recorded",
        cells: 1,
      });
    } else {
      group.cells += 1;
    }
  }
  const ordered = [...groups.values()].sort(
    (left, right) =>
      left.engine.localeCompare(right.engine) ||
      left.rows - right.rows ||
      left.scenario.localeCompare(right.scenario) ||
      left.stage.localeCompare(right.stage),
  );
  return [
    "",
    "Every expected cell carries either a timing or its recorded failure. These cells did not finish and have no timing:",
    "",
    "| Engine | Size | Scenario | Stage | Recorded error | Cells |",
    "| --- | ---: | --- | --- | --- | ---: |",
    ...ordered.map(
      (group) =>
        `| ${group.engine} | ${fmt_rows(group.rows)} | ${group.scenario} | ${group.stage} | ${group.error} | ${group.cells} |`,
    ),
    "",
  ];
}

/** Markdown table cells cannot carry a raw pipe. */
const markdown_cell = (text: string): string => text.replaceAll("|", "\\|");

/** Four representative scenarios lead the complete measurement chart. */
const CORE_PATH_HEADLINES = [
  "setblock-admission",
  "csv-import",
  "undo-large-clear",
  "node-cold-init",
] as const;

/**
 * "one fromCsv import of …" reads as a label without the leading count. The
 * first word can be an identifier, so its case stays as written.
 */
function scenario_label(unit: string): string {
  return unit.replace(/^one /u, "");
}

/**
 * Core write-path evidence: packed block writes, CSV import, large restore,
 * and paged residency work. Every scenario carries the checkpoint it proved,
 * so a timing is never published alone.
 */
function render_core_paths_section(
  evidence: CorePathsEvidence,
  source: string,
  machines: readonly MachineEvidence<CorePathsEvidence>[],
): string[] {
  const headlines = CORE_PATH_HEADLINES.flatMap((id) => {
    const scenario = evidence.scenarios.find((candidate) => candidate.id === id);
    return scenario === undefined
      ? []
      : [
          {
            value: formatMs(scenario.timing.median),
            label: readableText(scenario_label(scenario.unit)),
          },
        ];
  });
  const counters = evidence.scenarios.flatMap((scenario) =>
    Object.entries(scenario.counters).map(
      ([name, value]) => `| \`${scenario.id}\` | \`${name}\` | ${formatCount(value)} |`,
    ),
  );
  return [
    "## Core write path",
    "",
    `<div class="evidence-available"><strong>Validated evidence.</strong> ${evidence.scenarios.length} store and document scenarios at production sizes. Every scenario passed its own correctness checkpoint before its timing was accepted.</div>`,
    "",
    ...evidenceHeadline(headlines),
    ...allMeasurements(
      `All ${evidence.scenarios.length} scenarios · median time, scale, samples and checkpoints`,
      [
        perfFigure({
          id: "core-paths",
          title: "Median time per scenario",
          unit: "ms",
          scale: "log",
          rowHeader: "Scenario",
          spreadLabel: FASTEST_TO_P95,
          groups: machineGroups(
            machines,
            (capture) =>
              capture.scenarios.flatMap((scenario) => [
                {
                  label: readableId(scenario.id),
                  id: scenario.id,
                  detail: readableText(scenario_label(scenario.unit)),
                  bars: [{ label: "", role: "measured", stat: fastestToP95(scenario.timing) }],
                },
                ...(scenario.variants ?? []).map((variant): PerfRow => ({
                  label: readableId(variant.id),
                  id: variant.id,
                  detail: `Variant of ${readableId(scenario.id).toLowerCase()}, measured in the same run`,
                  bars: [{ label: "", role: "measured", stat: fastestToP95(variant.timing) }],
                })),
              ]),
            (capture) => captureNote(capture.metadata),
          ),
        }),
        "",
        ...provenanceList([
          ["Captured", `${formatCaptureTime(evidence.metadata.timestamp)} UTC`],
          ["Commit", `${shortHash(evidence.metadata.commit)} clean worktree`],
          [
            "Environment",
            `Bun ${html(evidence.toolchain.bun)} · Node compatibility ${html(evidence.toolchain.nodeCompat)} · ${html(evidence.toolchain.cpu)}`,
          ],
          ["Raw artifact", `<code>${html(source)}</code>`],
        ]),
        "### Scale",
        "",
        "| Parameter | Value |",
        "| --- | ---: |",
        ...Object.entries(evidence.scale).map(
          ([name, value]) => `| \`${name}\` | ${formatCount(value)} |`,
        ),
        "",
        "### Samples",
        "",
        "| Scenario | Samples |",
        "| --- | ---: |",
        ...evidence.scenarios.flatMap((scenario) => [
          `| \`${scenario.id}\` | ${scenario.timing.iters} |`,
          ...(scenario.variants ?? []).map(
            (variant) => `| \`${variant.id}\` | ${variant.timing.iters} |`,
          ),
        ]),
        "",
        ...(counters.length === 0
          ? []
          : [
              "### Counters",
              "",
              "Non-time evidence recorded by the same runs.",
              "",
              "| Scenario | Counter | Value |",
              "| --- | --- | ---: |",
              ...counters,
              "",
            ]),
        "### Correctness checkpoints",
        "",
        "| Scenario | Checkpoint |",
        "| --- | --- |",
        ...evidence.scenarios.map(
          (scenario) => `| \`${scenario.id}\` | ${markdown_cell(scenario.validation)} |`,
        ),
      ],
    ),
    "Reproduce with:",
    "",
    '```sh verify title="Core write-path evidence"',
    "bun run --filter @sheetwrite/bench bench:core-paths",
    "```",
    "",
  ];
}

/** Each operation: the baseline codec is the base, the current codec the measured bar. */
function xlsx_rows(capture: XlsxEvidence, metric: "time" | "memory"): PerfRow[] {
  const baseline_commit = capture.toolchain.baselineCommit;
  const stat_of = (summary: XlsxEvidence["summaries"][number]): PerfStat => {
    const run = metric === "time" ? summary.durationMs : summary.maxRssBytes;
    // The codec capture records the median absolute deviation, not the fastest run.
    return Number.isFinite(run.mad)
      ? { value: run.median, spread: [run.median - run.mad, run.median + run.mad] }
      : { value: run.median };
  };
  return capture.summaries
    .filter((summary) => summary.engine === "current")
    .map((current) => {
      const baseline =
        baseline_commit === undefined
          ? undefined
          : capture.summaries.find(
              (summary) =>
                summary.engine === "baseline" &&
                summary.operation === current.operation &&
                summary.scenario === current.scenario,
            );
      return {
        label: readableId(`${current.operation} ${current.scenario}`),
        bars: [
          ...(baseline === undefined
            ? []
            : [
                {
                  label: `Baseline ${(baseline_commit ?? "").slice(0, 7)}`,
                  role: "base" as const,
                  stat: stat_of(baseline),
                },
              ]),
          { label: "Current", role: "measured" as const, stat: stat_of(current) },
        ],
      };
    });
}

/**
 * XLSX codec evidence: when a baseline commit is recorded, compare the current
 * tree against that codec using the same checked fixture. A ratio below 1 means
 * the current codec is faster; peak RSS is the largest raw process peak.
 */
function render_xlsx_section(
  evidence: XlsxEvidence,
  source: string,
  machines: readonly MachineEvidence<XlsxEvidence>[],
): string[] {
  const baseline_commit = evidence.toolchain.baselineCommit;
  const provenance = provenanceList([
    ["Captured", `${formatCaptureTime(evidence.metadata.timestamp)} UTC`],
    ["Commit", `${shortHash(evidence.metadata.commit)} clean worktree`],
    [
      "Engines",
      `${sheetwrite_label(evidence.metadata.engineVersions.sheetwrite, evidence.metadata.commit)} · ExcelJS ${html(evidence.metadata.engineVersions.exceljs)}${baseline_commit === undefined ? "" : ` at baseline ${shortHash(baseline_commit)}`}`,
    ],
    [
      "Fixture",
      `<code>${html(evidence.fixture.path)}</code> · ${formatCount(evidence.fixture.bytes)} bytes · ${shortHash(evidence.fixture.sha256)} · ${html(evidence.fixture.producer)}`,
    ],
    [
      "Environment",
      `Bun ${html(evidence.toolchain.bun)} · Node ${html(evidence.toolchain.node)} · ${html(evidence.toolchain.cpu)}`,
    ],
    ["Raw artifact", `<code>${html(source)}</code>`],
  ]);
  const figure = (metric: "time" | "memory"): string =>
    perfFigure({
      id: `xlsx-${metric}`,
      title: metric === "time" ? "Median operation time" : "Median peak resident memory",
      unit: metric === "time" ? "ms" : "bytes",
      scale: metric === "time" ? "log" : "linear",
      rowHeader: "Operation",
      verdictWords: metric === "time" ? ["faster", "slower"] : ["less memory", "more memory"],
      series: { base: "Baseline codec", measured: "Current codec" },
      spreadLabel: "Median ± median absolute deviation",
      groups: machineGroups(
        machines,
        (capture) => xlsx_rows(capture, metric),
        (capture) => `${captureNote(capture.metadata)} · ${capture.rounds} rounds`,
      ),
    });
  return [
    "## XLSX codec benchmark",
    "",
    `<div class="evidence-available"><strong>Validated evidence.</strong> ${evidence.comparisons.length > 0 ? `${evidence.comparisons.length} compared operations` : `${evidence.summaries.length} measured operations`} over ${evidence.rounds} process-isolated rounds each, from one checked corpus fixture.</div>`,
    "",
    ...(baseline_commit === undefined
      ? ["This capture ran the current tree only. No codec comparison is claimed.", ""]
      : [
          `Current and baseline are the same codec at different commits, measured in the same session. Baseline commit: ${shortHash(baseline_commit)}.`,
          "",
        ]),
    "### Operation time",
    "",
    figure("time"),
    "",
    "### Peak resident memory",
    "",
    figure("memory"),
    "",
    ...allMeasurements("Capture details · fixture, engines and environment", provenance),
    "Reproduce with a checkout of the baseline commit, built and passed as the comparison root:",
    "",
    '```sh verify title="XLSX codec evidence"',
    `git worktree add ../sheetwrite-xlsx-baseline ${baseline_commit ?? "<baseline commit>"}`,
    "cd ../sheetwrite-xlsx-baseline && bun install --frozen-lockfile && bun run build:packages",
    "cd - && bun run --filter @sheetwrite/bench bench:xlsx -- --baseline-root ../sheetwrite-xlsx-baseline",
    "```",
    "",
  ];
}

/** One generated performance page: its route under `/docs/performance/` and its sections. */
interface PerformancePage {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  /** `##` headings of the evidence text that this page publishes, in order. */
  readonly sections: readonly string[];
}

/** The Performance section of the docs: one page per benchmark area. */
export const PERFORMANCE_PAGES: readonly PerformancePage[] = [
  {
    slug: "render",
    title: "Render performance",
    description:
      "Scroll, edit, and interaction timings of the live grid, measured against Handsontable.",
    sections: ["Render benchmark", "Chart source tracking"],
  },
  {
    slug: "data-engine",
    title: "Data engine performance",
    description:
      "Ingest, window read, edit, sort, filter, and aggregate timings of the data store.",
    sections: ["Data engine benchmark", "Incremental pivot engine"],
  },
  {
    slug: "core-write-path",
    title: "Core write path",
    description: "Timings of store and document writes at production sizes.",
    sections: ["Core write path"],
  },
  {
    slug: "formula-engine",
    title: "Formula engine performance",
    description:
      "Recalculation timings by dependency shape, and how the two engine builds compare.",
    sections: ["Formula engine benchmark"],
  },
  {
    slug: "xlsx-codec",
    title: "XLSX codec performance",
    description: "Import and export time and peak memory for XLSX files.",
    sections: ["XLSX codec benchmark"],
  },
  {
    slug: "delivery-size",
    title: "Delivery size",
    description: "Published package sizes for each Sheetwrite release.",
    sections: ["Delivery size"],
  },
  {
    slug: "memory",
    title: "Memory",
    description:
      "Release retained engine memory, free grids and trim their caches, and read which owner holds each byte.",
    sections: [
      "Release retained engine memory",
      "Grid lifetime and trimMemory",
      "Runtime resource ownership",
    ],
  },
  {
    slug: "release-comparison",
    title: "Release comparison",
    description:
      "Each release measured against the previous one on the same machine, suite by suite.",
    sections: ["Release comparison"],
  },
  {
    slug: "benchmark-protocol",
    title: "Benchmark protocol",
    description: "How the evidence is captured, and how to check a change for a timing regression.",
    sections: ["Capture", "Matched local regression check", "Pending local evidence"],
  },
];

/** How many of the latest releases the Delivery size figure draws. */
const SIZE_FIGURE_RELEASES = 4;

const PERFORMANCE_INTRO =
  "These pages show measured results for each release, and how to repeat them. A run that did not finish shows as a failure, not as a time.";

/** A Markdown code fence line: up to 3 spaces, then 3 or more backticks or tildes. */
const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Moves every heading below H2 up one level, in Markdown and in raw HTML. A
 * section never holds another H2, so nothing reaches the page's H1. Fenced
 * code is left as written: it shows text, not headings.
 */
function lift_headings(markdown: string): string {
  let fence: string | undefined;
  return markdown
    .split("\n")
    .map((line) => {
      const marker = CODE_FENCE.exec(line)?.[1];
      if (fence === undefined && marker !== undefined) {
        fence = marker;
        return line;
      }
      if (fence !== undefined) {
        // A fence closes on the same character, at least as long as it opened.
        if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) {
          fence = undefined;
        }
        return line;
      }
      return line
        .replace(/^#(#{2,6} )/, "$1")
        .replace(
          /<(\/?)h([3-6])\b/g,
          (_, slash: string, level: string) => `<${slash}h${Number(level) - 1}`,
        );
    })
    .join("\n");
}

/**
 * Splits the evidence text into the Performance pages. Each `##` section goes
 * to the page that lists it; a section no page lists is an error, so a new
 * benchmark can never drop out of the docs. A page whose evidence is pending
 * says so instead of rendering empty.
 */
export function splitPerformancePages(
  evidence: string,
): Array<{ readonly slug: string; readonly route: string; readonly content: string }> {
  const sections = new Map<string, string>();
  for (const part of evidence.split(/^(?=## )/m)) {
    if (!part.startsWith("## ")) continue;
    const newline = part.indexOf("\n");
    const heading = part.slice(3, newline === -1 ? undefined : newline).trim();
    if (!PERFORMANCE_PAGES.some((page) => page.sections.includes(heading))) {
      throw new Error(`performance section has no page: ${heading}`);
    }
    sections.set(heading, part.trimEnd());
  }
  const pages = PERFORMANCE_PAGES.map((page) => {
    const present = page.sections.flatMap((heading) => {
      const section = sections.get(heading);
      return section === undefined ? [] : [section];
    });
    // A one-section page takes its heading from the page title, so the
    // section's own headings move up a level to sit right under it.
    const body =
      present.length === 0
        ? "This benchmark has no validated evidence yet. See [Pending local evidence](/docs/performance/benchmark-protocol/#pending-local-evidence)."
        : page.sections.length === 1
          ? lift_headings((present[0] ?? "").replace(/^## [^\n]*\n+/, ""))
          : present.join("\n\n");
    return {
      slug: page.slug,
      route: `performance/${page.slug}.md`,
      content: `${frontmatter(page.title, page.description)}${body}\n`,
    };
  });
  const overview = [
    frontmatter(
      "Performance",
      "Measured speed, memory and download size of Sheetwrite, one page per area.",
    ).trimEnd(),
    PERFORMANCE_INTRO,
    "",
    "Each page shows the results first, then the method and the command that reproduces them.",
    "",
    "## Results for 0.7.0",
    "",
    "The pages below measure the code that ships as 0.7.0. The Render page includes charts that follow their source cells, and the Data engine page includes pivots that recalculate only what changed. The [0.7.0 release notes](/docs/releases/0.7.0/#performance) compare 0.7.0 with 0.6.1. The [release comparison](/docs/performance/release-comparison/) still compares 0.6.0 with 0.5.4.",
    "",
    ...PERFORMANCE_PAGES.map(
      (page) => `- [${page.title}](/docs/performance/${page.slug}/): ${page.description}`,
    ),
    "",
  ].join("\n");
  return [{ slug: "index", route: "performance/index.md", content: overview }, ...pages];
}

/** Every benchmark and delivery section as `##` Markdown; `splitPerformancePages` publishes it. */
export async function renderEvidenceText(sizeHistoryOverride?: SizeHistory): Promise<string> {
  const machines = captureMachines();
  const scale_captures = await load_machine_captures(
    machines,
    "render-scale.json",
    "bun run --filter @sheetwrite/bench bench:render:scale",
    validate_render_artifact,
  );
  const data_captures = await load_machine_captures(
    machines,
    "data-results.json",
    "bun run --filter @sheetwrite/bench bench:data",
    validateDataArtifact,
  );
  const formula_captures = await load_machine_captures(
    machines,
    "formula-results.json",
    "bun run --filter @sheetwrite/bench bench:formula",
    validate_formula_artifact,
  );
  const full_engine_captures = await load_machine_captures(
    machines,
    "full-engine-results.json",
    "bun run --filter @sheetwrite/bench bench:formula:engines",
    validateFullEngineArtifact,
  );
  const matched_engine = await load_evidence(
    "bench/results/full-engine-matched-results.json",
    "bun run --filter @sheetwrite/bench bench:formula:matched",
    validateMatchedEngineArtifact,
  );
  const core_paths_captures = await load_machine_captures(
    machines,
    "core-paths-results.json",
    "bun run --filter @sheetwrite/bench bench:core-paths",
    validate_core_paths_artifact,
  );
  const xlsx_captures = await load_machine_captures(
    machines,
    "xlsx-results.json",
    "bun run --filter @sheetwrite/bench bench:xlsx -- --baseline-root <checkout of the baseline commit>",
    validate_xlsx_artifact,
  );
  const chart_tracking_captures = await load_machine_captures(
    machines,
    "chart-tracking-results.json",
    "bun run --filter @sheetwrite/bench bench:charts",
    validateChartTrackingArtifact,
  );
  const pivot_captures = await load_machine_captures(
    machines,
    "pivot-results.json",
    "bun run --filter @sheetwrite/bench bench:pivot -- --output results/pivot-results.json",
    validatePivotArtifact,
  );
  const scale = scale_captures.release;
  const data = data_captures.release;
  const formula = formula_captures.release;
  const full_engine = full_engine_captures.release;
  const core_paths = core_paths_captures.release;
  const xlsx = xlsx_captures.release;
  const chart_tracking = chart_tracking_captures.release;
  const pivot = pivot_captures.release;
  const release_comparison = await load_evidence(
    "bench/results/release-comparison.json",
    "cd bench && bun src/release-comparison.ts --baseline-results-dir results/releases/<previous release>",
    validateReleaseComparisonArtifact,
  );
  const captures = (
    [
      { label: "Render benchmark", loaded: scale },
      { label: "Data engine benchmark", loaded: data },
      { label: "Core write path", loaded: core_paths },
      { label: "Formula engine benchmark", loaded: formula },
      { label: "Formula engines (analysis capture)", loaded: full_engine },
      { label: "Formula engines (matched capture)", loaded: matched_engine },
      { label: "XLSX codec benchmark", loaded: xlsx },
      { label: "Chart source tracking", loaded: chart_tracking },
      { label: "Incremental pivot engine", loaded: pivot },
      { label: "Release comparison", loaded: release_comparison },
    ] satisfies Array<{ label: string; loaded: CapturedEvidence }>
  ).flatMap(({ label, loaded }) => {
    if (!("evidence" in loaded)) return [];
    const evidence = loaded.evidence;
    const captured = "meta" in evidence ? evidence.meta : evidence.metadata;
    return [{ label, source: loaded.source, meta: captured }];
  });
  const size_history =
    sizeHistoryOverride ??
    validateSizeHistory(
      JSON.parse(await readFile(resolve(repositoryRoot, "scripts/size-history.json"), "utf8")),
    );
  const pending: EvidenceState[] = [
    scale_captures,
    data_captures,
    formula_captures,
    full_engine_captures,
    core_paths_captures,
    xlsx_captures,
    chart_tracking_captures,
    pivot_captures,
  ].flatMap((captures) => captures.otherPending);
  const lines = ["## Render benchmark", ""];
  // Readers come for results; the method and API notes follow every benchmark.
  const method_lines = [
    "## Release retained engine memory",
    "",
    "WebAssembly linear memory grows but does not shrink after cells or stores are cleared. When your application is idle after a large import, clear, or workbook disposal, call [`releaseEngineMemory`](/docs/api/core/release-engine-memory/) explicitly. Sheetwrite never schedules a release automatically.",
    "",
    '```ts prelude="core" partial="requires an initialized application at an idle point" title="Explicit idle memory release"',
    'import { releaseEngineMemory } from "@sheetwrite/core";',
    "",
    "const report = await releaseEngineMemory();",
    "```",
    "",
    "The call waits for synchronous transactions and active datasource page loads, then moves all live stores together into a fresh instance of the selected engine. Cell sources, styles, cached formula results (including volatile results), resident datasource pages, unsaved dirty edits, and compact undo/redo history survive. Unloaded clean pages remain unloaded and can be fetched again from the datasource. Worker renderers rebuild their frames without document-change events.",
    "",
    "The main-thread pause scales with resident cells and compact history, so do not invoke it on an interaction-critical path. Migration temporarily needs both instances and packed transfer buffers; it can increase peak memory before garbage collection reclaims the retired instance. If preparation fails, every live store stays on the original instance. Concurrent calls share the same release.",
    "",
    "`report.wasmBytesBefore` and `report.wasmBytesAfter` are committed linear-memory bytes, not live-cell bytes or process memory. `report.pauseMs` measures migration, excluding the idle wait. A release is not guaranteed to reduce committed bytes: surviving data, compact history, and migration scratch can still require substantial memory. Actual process-memory reclamation depends on garbage collection.",
    "",
    ...render_capture_header(captures),
    "`bench:release` captures render-scale, the performance showcase's paged storage at `bench/results/paged-results.json`, the interaction evidence at `bench/results/interaction-results.json`, data, core paths, formula, formula engines, matched engines, and XLSX, then re-records the render regression baseline last. Its smoke rehearsal writes only to `bench/results/smoke/`.",
    "",
    "The interaction capture (`bench:interaction`, schema `interaction-current-v2`) measures the current build, not a comparison: packed inverse-index lookup latency in nanoseconds, inverse-index backing bytes, retained bytes after 100 distant edits, and the cold-route long task owned by Sheetwrite. It records the raw samples, the summary derived from them, the runner, and the method, and it holds those four metrics to absolute release ceilings. Version 1 recorded a one-off before/after pair whose baseline build cannot be re-measured at a later release, so no old sample is carried forward into the current capture.",
    "",
    ...machineCaptureLines(machines),
    "## Matched local regression check",
    "",
    "Timing comparisons run deliberately on a controlled local machine, not as a required CI job. Capture ten fresh matched rounds, retain every raw sample, and compare the fresh artifact with the committed baseline. Any unapproved slowdown fails the local command.",
    "",
    '```sh verify title="Zero-regression benchmark"',
    "bun run --filter @sheetwrite/bench bench:render:prepare",
    "cd bench",
    "bun run src/render-driver.ts --rounds 10 --output results/render-fresh.json --markdown-output results/render-fresh.md",
    "bun run src/check.ts --baseline results/render-baseline.json --fresh results/render-fresh.json --power-mode balanced --concurrency 1",
    "```",
    "",
    "A result is a regression decision only when that final baseline check passes on the declared power mode and concurrency. `bench:verify` remains a smoke and safety-ceiling check.",
    "",
    "The committed baseline at `bench/results/render-baseline.json` pins the harness source hashes, the declared sampling, and the runner (OS, CPU, Bun, Node, Chromium, power mode, concurrency). It is therefore machine- and harness-pinned: it must be re-recorded whenever a harness file, the sampling flags, the protocol version, or the runner changes, and the release capture does that as its last step by re-recording ten controlled rounds into `bench/results/render-baseline-raw.json` and promoting that artifact over the committed baseline. Until the re-recorded baseline is committed, `bench:check` fails closed on the fingerprint mismatch instead of comparing unrelated measurements.",
    "",
  ];
  if ("evidence" in scale) {
    const { evidence, source } = scale;
    const metadata = evidence.metadata;
    const { successes, total, failures } = runCompletionSummary(evidence.results);
    lines.push(
      `<div class="evidence-available"><strong>Validated evidence.</strong> ${successes}/${total} engine/scenario/round runs completed across ${evidence.config.rows.length} workbook sizes; every completed run passed its correctness checkpoints${failures > 0 ? `; ${failures} runs did not finish and are shown as such` : ""}.</div>`,
      "",
      "Both engines drive identical scripted interactions in a live grid in a controlled browser. The headline numbers and the overview use 100,000-row workbooks; switch the machine to see its own capture.",
      "",
      "Both grids run in the same viewport with the same data and the engine versions listed below, and every timed step repaints on both sides.",
      "",
      render_speed_story(scale_captures.machines),
      "",
      "### Every size, speed and memory",
      "",
      "Pick a workbook size and a metric:",
      "",
      render_bench_widget(evidence, scale_captures.machines),
      "",
      ...provenanceList([
        ["Captured", `${formatCaptureTime(metadata.timestamp)} UTC`],
        ["Commit", `${shortHash(metadata.commit)} clean worktree`],
        [
          "Engines",
          `${sheetwrite_label(metadata.engineVersions.sheetwrite, metadata.commit)} · Handsontable ${html(metadata.engineVersions.handsontable)}`,
        ],
        [
          "Environment",
          `Bun ${html(metadata.bunVersion)} · Node compatibility ${html(metadata.nodeVersion)} · Chromium ${html(metadata.browserVersion)} · ${html(metadata.cpu)}`,
        ],
        ["Protocol", `${metadata.rounds} rounds · raw artifact <code>${html(source)}</code>`],
      ]),
      ...render_failure_table(evidence),
      "",
      RENDER_METHOD,
      "",
      "Reproduce and validate with:",
      "",
      '```sh verify title="Controlled render evidence"',
      "bun run --filter @sheetwrite/bench bench:render:prepare",
      "bun run --filter @sheetwrite/bench bench:render:scale",
      "```",
      "",
    );
  } else {
    pending.push(scale);
  }
  method_lines.push(
    "## Grid lifetime and trimMemory",
    "",
    "A grid owns its DOM, listeners, timers, renderer, worker and caches. Call `grid.destroy()` when the host view goes away. It frees all of them, and the store that the grid created. Caches that are not on the grid are keyed by their owner in a `WeakMap`, so they go with the grid; the few page-wide caches have a fixed size limit. A second `destroy()` call does nothing.",
    "",
    "`grid.trimMemory()` gives back the memory that an open grid can build again: decoded cell strings, rendered number text, compiled number formats, text measurement and unused overlay nodes, in the grid and in its worker renderer. Document data, undo history and the visible output do not change. The next frame reads its window again and builds only what it paints. Call it on a memory signal from the host, or when the page goes to the background:",
    "",
    '```ts prelude="core" partial="requires a mounted grid" title="Trim a grid in the background"',
    'document.addEventListener("visibilitychange", () => {',
    '  if (document.visibilityState === "hidden") grid.trimMemory();',
    "});",
    "```",
    "",
    "The number format caches are shared by all grids on the page, so one trim drops them for every grid. A trim does not shrink WebAssembly memory; call [`releaseEngineMemory`](/docs/api/core/release-engine-memory/) at an idle point for that. A trim after `destroy()` does nothing.",
    "",
    "Two checks hold these rules. A Chromium browser test (`test/browser/grid-memory.spec.ts`) scrolls a 200,000-row sheet, trims, and requires the same screenshot, the same document and a lower retained heap. A Chromium benchmark creates and destroys 50 warm-up grids and then 100 more in one page. After a full collection, the V8 and Blink heaps together must stay within 5% of their size after the warm-up, as the median of three runs in a fresh browser. No DOM node, event listener or grid object may remain: the page keeps weak references to each grid, its store, its action surface and its top-level elements, and all of them must be collected. The warm-up holds the engine and the code that V8 compiles for the grid, which levels off after a few dozen grids:",
    "",
    '```sh verify title="Grid lifetime memory"',
    "bun run build:packages",
    "bun bench/src/grid-lifetime-browser-bench.ts --runs 3 --warmup 50 --cycles 100",
    "```",
    "",
  );
  method_lines.push(
    "## Runtime resource ownership",
    "",
    "The performance showcase at `/showcases/performance#resource-ownership` renders the public [`RuntimeResourceSnapshot`](/docs/api/core/runtime-resource-snapshot/) protocol directly. It keeps exclusive-owner logical bytes, allocated capacity, WASM committed pages, and independent browser runtime observations in separate buckets; committed pages are never summed into live payload. Bulk-edit before/settled deltas use [`diffRuntimeResourcePhases`](/docs/api/core/diff-runtime-resource-phases/) and omit unchanged owners.",
    "",
    "The UI and this reference share [`RUNTIME_RESOURCE_SCHEMA_VERSION`](/docs/api/core/runtime-resource-schema-version/). Detailed peak phases remain in the validated benchmark artifact rather than being presented as measurements from the visitor's browser.",
    "",
    "String collection reclaims obsolete pool text and densely remaps surviving IDs. Automatic collection runs only at committed edit transaction barriers, never during painting or page loading, when dead arena/span storage exceeds 256 KiB and the surviving arena/span storage. Growth-based backoff avoids repeatedly scanning unchanged live data. Bulk clears and sheet removal request a new threshold check at the next commit.",
    "",
    "`compactStringStorage()` explicitly collects unreachable text and trims growth slack outside an active mutation/page load. Raw IDs are valid only within `stringPoolEpoch()`; retain the epoch with projections and invalidate caches on a change, as described in the [worker rendering guide](/docs/features/worker-rendering/#raw-string-ids-and-epochs). History snapshots own captured text. Persist resolved values, not pool IDs. Reclaimed Rust ownership does not imply that WebAssembly committed linear memory shrinks.",
    "",
    "Reproduce and validate the full owner/operation matrix with:",
    "",
    '```sh verify title="Runtime resource evidence"',
    "bun run --filter @sheetwrite/bench bench:resource",
    "```",
    "",
  );
  lines.push("## Data engine benchmark", "");
  if ("evidence" in data) {
    const { evidence, source } = data;
    lines.push(
      `<div class="evidence-available"><strong>Validated evidence.</strong> Head-to-head store operations at the sizes both engines complete headlessly; Sheetwrite additionally scales to 1M rows below.</div>`,
      "",
      ...provenanceList([
        ["Captured", `${formatCaptureTime(evidence.meta.timestamp)} UTC`],
        ["Commit", `${shortHash(evidence.meta.commit)} clean worktree`],
        [
          "Engines",
          `${sheetwrite_label(evidence.meta.engineVersions.sheetwrite, evidence.meta.commit)} · Handsontable ${html(evidence.meta.engineVersions.handsontable)}`,
        ],
        ["Environment", `Bun ${html(evidence.meta.bun)}`],
        ["Raw artifact", `<code>${html(source)}</code>`],
      ]),
      data_widget(data_captures.machines),
      "",
      "Sheetwrite alone at scale — Handsontable cannot complete these sizes headlessly:",
      "",
      data_scale_figure(data_captures.machines),
    );
    lines.push(
      "",
      DATA_METHOD,
      "",
      "Reproduce with:",
      "",
      '```sh verify title="Data engine evidence"',
      "bun run --filter @sheetwrite/bench bench:data",
      "```",
      "",
    );
  } else {
    pending.push(data);
  }
  if ("evidence" in core_paths) {
    lines.push(
      ...render_core_paths_section(
        core_paths.evidence,
        core_paths.source,
        core_paths_captures.machines,
      ),
    );
  } else {
    pending.push(core_paths);
  }
  lines.push("## Formula engine benchmark", "");
  if ("evidence" in formula) {
    const { evidence, source } = formula;
    // The engine change leads; the release capture's own evidence sits with its figure below.
    lines.push(...(await render_engine_change(captureMachines())));
    lines.push(
      "### Every workload",
      "",
      `The ${evidence.workloads.length} recalculation workloads as the release capture measured them, each under its own release's harness; every workload passed the protocol's safety ceilings.`,
      "",
      ...provenanceList([
        ["Captured", `${formatCaptureTime(evidence.meta.timestamp)} UTC`],
        ["Commit", `${shortHash(evidence.meta.commit)} clean worktree`],
        ["Raw artifact", `<code>${html(source)}</code>`],
      ]),
      ...allMeasurements(
        `All ${evidence.workloads.length} workloads · median time · ${formula_captures.machines.map(({ machine }) => machineName(machine).name).join(" and ")}`,
        [formula_figure(formula_captures.machines)],
      ),
    );
    lines.push(
      "",
      FORMULA_METHOD,
      "",
      "Reproduce with:",
      "",
      '```sh verify title="Formula engine evidence"',
      "bun run --filter @sheetwrite/bench bench:formula",
      "```",
      "",
    );
  } else {
    pending.push(formula);
  }
  if ("evidence" in full_engine) {
    lines.push(
      renderFullEngineEvidence(
        full_engine.evidence,
        "evidence" in matched_engine ? matched_engine.evidence : undefined,
        full_engine_captures.machines,
      ),
    );
    if (!("evidence" in matched_engine)) pending.push(matched_engine);
  } else {
    pending.push(full_engine);
    if (!("evidence" in matched_engine)) pending.push(matched_engine);
  }
  if ("evidence" in xlsx) {
    lines.push(...render_xlsx_section(xlsx.evidence, xlsx.source, xlsx_captures.machines));
  } else {
    pending.push(xlsx);
  }
  if ("evidence" in chart_tracking) {
    lines.push(
      ...renderChartTrackingSection(
        chart_tracking.evidence,
        chart_tracking.source,
        chart_tracking_captures.machines,
      ),
    );
  } else {
    pending.push(chart_tracking);
  }
  if ("evidence" in pivot) {
    lines.push(...renderPivotSection(pivot.evidence, pivot.source, pivot_captures.machines));
  } else {
    pending.push(pivot);
  }
  if ("evidence" in release_comparison) {
    lines.push(
      ...renderReleaseComparisonSection(release_comparison.evidence, release_comparison.source),
    );
  } else {
    lines.push(
      "## Release comparison",
      "",
      "The release comparison has no validated clean-tree artifact yet. Historical 0.5 evidence is preserved unmodified from `feat/chart-pivot-ui` under `bench/results/releases/0.5.0/`. No old/new timing claims are published until `bench/results/release-comparison.json` is available.",
      "",
    );
    pending.push(release_comparison);
  }
  lines.push("## Delivery size", "");
  const latest_release = size_history.releases.at(-1);
  if (latest_release !== undefined) {
    const package_metric_keys = Object.keys(latest_release.metrics).filter((name) =>
      name.endsWith(".tarballBytes"),
    );
    // Each package's download size in the last releases, oldest first: the
    // same numbers and changes as the tables below, as bars on one linear axis
    // from 0, so a package's growth between releases shows as a longer bar.
    // The tables keep every release; the figure keeps few enough bars to read
    // on a phone.
    const first_shown = Math.max(0, size_history.releases.length - SIZE_FIGURE_RELEASES);
    const shown_releases = size_history.releases.slice(first_shown);
    lines.push(
      perfFigure({
        id: "delivery-size-tarballs",
        title: `Download size per package, v${shown_releases[0]?.version ?? latest_release.version} to v${latest_release.version}`,
        unit: "bytes",
        scale: "linear",
        rowHeader: "Package",
        groups: [
          {
            label: "npm registry tarballs",
            rows: package_metric_keys.map((key) => ({
              label: key.slice("package.".length, -".tarballBytes".length),
              bars: shown_releases.flatMap((release, index) => {
                const metric = release.metrics[key];
                if (metric === undefined) return [];
                const previous = size_history.releases[first_shown + index - 1]?.metrics[key];
                // The change from the release before, as the table below gives it.
                const label =
                  previous === undefined
                    ? `v${release.version}`
                    : `v${release.version} · ${formatMetricDelta(metric, previous)[1]}`;
                return [
                  {
                    label,
                    role: "measured" as const,
                    stat: { value: metric.actual },
                  },
                ];
              }),
            })),
          },
        ],
      }),
      "",
    );
    lines.push(
      '<section class="size-history" aria-label="Published package size history">',
      '<p class="size-history__intro">Registry measurements for every published release. Each delta is measured against the release immediately before it.</p>',
    );
    for (let index = size_history.releases.length - 1; index >= 0; index -= 1) {
      const release = size_history.releases[index];
      if (release === undefined) continue;
      const previous = size_history.releases[index - 1];
      const release_date =
        release.capturedAt === undefined
          ? "Date not recorded"
          : new Intl.DateTimeFormat("en", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(release.capturedAt));
      const version_step =
        previous === undefined
          ? `<strong>v${release.version}</strong>`
          : `<span>v${previous.version}</span><svg class="size-history__arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M9 4.5 12.5 8 9 11.5"/></svg><strong>v${release.version}</strong>`;
      lines.push(
        `<details class="size-history__release"${index === size_history.releases.length - 1 ? ' data-current="true" open' : ""}>`,
        '<summary class="size-history__release-head">',
        `<span class="size-history__version-step">${version_step}</span>`,
        `<time${release.capturedAt === undefined ? "" : ` datetime="${release.capturedAt}"`}>${release.capturedAt === undefined ? release_date : `Measured ${release_date}`}</time>`,
        '<svg class="size-history__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>',
        "</summary>",
        '<div class="size-history__table-wrap">',
        '<table class="size-history__table">',
        '<thead><tr><th scope="col">Package</th><th scope="col">Tarball</th><th scope="col">Installed</th></tr></thead>',
        "<tbody>",
      );
      for (const key of package_metric_keys) {
        const package_name = key.slice("package.".length, -".tarballBytes".length);
        const unpacked_key = `package.${package_name}.unpackedBytes`;
        const tarball = release.metrics[key];
        const unpacked = release.metrics[unpacked_key];
        if (!tarball || !unpacked) continue;
        const previous_tarball = previous?.metrics[key];
        const previous_unpacked = previous?.metrics[unpacked_key];
        const tarball_change =
          previous_tarball === undefined ? undefined : formatMetricDelta(tarball, previous_tarball);
        const unpacked_change =
          previous_unpacked === undefined
            ? undefined
            : formatMetricDelta(unpacked, previous_unpacked);
        const tarball_direction =
          previous_tarball === undefined || tarball.actual === previous_tarball.actual
            ? "flat"
            : tarball.actual > previous_tarball.actual
              ? "increase"
              : "decrease";
        const unpacked_direction =
          previous_unpacked === undefined || unpacked.actual === previous_unpacked.actual
            ? "flat"
            : unpacked.actual > previous_unpacked.actual
              ? "increase"
              : "decrease";
        lines.push(
          "<tr>",
          `<th scope="row"><code>${package_name}</code></th>`,
          `<td>${formatMetricDisplay(tarball).join(" ")}${tarball_change ? `<small data-direction="${tarball_direction}"><span>${tarball_change[0]}</span><span>${tarball_change[1]}</span></small>` : ""}</td>`,
          `<td>${formatMetricDisplay(unpacked).join(" ")}${unpacked_change ? `<small data-direction="${unpacked_direction}"><span>${unpacked_change[0]}</span><span>${unpacked_change[1]}</span></small>` : ""}</td>`,
          "</tr>",
        );
      }
      lines.push("</tbody>", "</table>", "</div>", "</details>");
    }
    lines.push(
      '<footer class="size-history__footer"><span>Increase</span><span>Decrease</span><code>scripts/size-history.json</code></footer>',
      "</section>",
      "",
    );
  }
  lines.push(...method_lines);
  if (pending.length > 0) {
    lines.push(
      "## Pending local evidence",
      "",
      "These protocols have no validated artifact in this environment yet, so no numbers are published for them.",
      "",
      "| Artifact | Status | Reproduce with |",
      "| --- | --- | --- |",
      ...pending.map(
        (state) =>
          `| \`${state.source}\` | ${markdown_cell(state.reason)} | \`${state.reproduction}\` |`,
      ),
      "",
    );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
