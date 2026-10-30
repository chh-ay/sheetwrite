import { benchScaleFigure } from "./bench-figures.js";
import {
  formatBytes,
  formatCaptureTime,
  formatCount,
  html,
  provenanceList,
  shortHash,
} from "./evidence-format.js";

interface CaptureMeta {
  commit: string;
  dirty: boolean;
  timestamp: string;
  cpu?: string;
  machine?: string;
  memoryMax?: string;
  bun?: string;
  node?: string;
  npm?: string;
  kernel?: string;
}

/**
 * Release-specific methodology notes. They live in the capture metadata next to
 * the evidence they explain, so this renderer stays the same between releases.
 */
interface ReleaseCaptureNotes {
  captureCommit: string;
  publicationNotes: Array<{ title: string; paragraphs: string[] }>;
}

interface ReleaseComparisonMeta extends CaptureMeta {
  effectiveCpuAffinityBySuite: Record<string, string>;
}

interface Timing {
  median: number;
  p95: number;
  min: number;
  max: number;
  mean: number;
  stddev: number;
  iters: number;
}

interface ChartTrackingEvidence {
  schemaVersion: 1;
  protocol: "sheetwrite-chart-tracking-v2";
  mode: "full";
  meta: CaptureMeta;
  samples: number;
  warmups: number;
  baseline: Timing;
  rows: Array<{
    chartCount: number;
    source: "literal" | "formula";
    scenario: "outside" | "inside" | "literal-dependency-edit";
    commitMs: Timing;
    baselineMs: Timing;
    eventMs: Timing | null;
    expectedEvents: number;
    expectedCharts: number;
    resolutionsPerCommit: number;
  }>;
}

interface PivotEvidence {
  schemaVersion: 1;
  protocol: "sheetwrite-pivot-v1";
  mode: "full";
  meta: CaptureMeta;
  sourceRows: number;
  rowFields: number;
  columnFields: number;
  valueFields: number;
  buildMs: Timing;
  editMs: Timing;
  donorKeyEditMs: Timing;
  maxBuildMs: Timing;
  maxExtremeEditMs: Timing;
  retainedBytesBeforePivot: number;
  retainedBytesWithPivot: number;
  retainedBytesPerPivot: number;
  status: number[];
}

function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function timing(value: unknown): value is Timing {
  if (value === null || typeof value !== "object") return false;

  const stat = value as Timing;

  return (
    [stat.median, stat.p95, stat.min, stat.max, stat.mean, stat.stddev].every(nonnegative) &&
    Number.isInteger(stat.iters) &&
    stat.iters > 0 &&
    stat.min <= stat.median &&
    stat.median <= stat.p95 &&
    stat.p95 <= stat.max
  );
}

export function validateChartTrackingArtifact(
  value: Record<string, unknown>,
): ChartTrackingEvidence | string {
  const artifact = value as unknown as ChartTrackingEvidence;

  if (
    artifact.schemaVersion !== 1 ||
    artifact.protocol !== "sheetwrite-chart-tracking-v2" ||
    artifact.mode !== "full"
  ) {
    return "artifact is not a full-mode chart-tracking v2 capture";
  }

  if (
    !Number.isInteger(artifact.samples) ||
    artifact.samples <= 0 ||
    !Number.isInteger(artifact.warmups) ||
    artifact.warmups < 0 ||
    !timing(artifact.baseline) ||
    !Array.isArray(artifact.rows) ||
    artifact.rows.length === 0
  ) {
    return "chart-tracking capture has no complete timing sample";
  }

  const keys = new Set<string>();

  for (const row of artifact.rows) {
    const key = `${row.chartCount}/${row.source}/${row.scenario}`;

    if (
      keys.has(key) ||
      !Number.isInteger(row.chartCount) ||
      row.chartCount < 0 ||
      !["literal", "formula"].includes(row.source) ||
      !["outside", "inside", "literal-dependency-edit"].includes(row.scenario) ||
      !timing(row.commitMs) ||
      !timing(row.baselineMs) ||
      row.commitMs.iters !== artifact.samples ||
      (row.eventMs !== null && !timing(row.eventMs)) ||
      ![row.expectedEvents, row.expectedCharts, row.resolutionsPerCommit].every(nonnegative)
    ) {
      return "chart-tracking capture contains invalid or duplicate measurements";
    }

    keys.add(key);
  }

  return artifact;
}

export function validatePivotArtifact(value: Record<string, unknown>): PivotEvidence | string {
  const artifact = value as unknown as PivotEvidence;

  if (
    artifact.schemaVersion !== 1 ||
    artifact.protocol !== "sheetwrite-pivot-v1" ||
    artifact.mode !== "full"
  ) {
    return "artifact is not a full-mode pivot capture";
  }

  if (
    ![artifact.sourceRows, artifact.rowFields, artifact.columnFields, artifact.valueFields].every(
      (value) => Number.isInteger(value) && value > 0,
    ) ||
    ![
      artifact.buildMs,
      artifact.editMs,
      artifact.donorKeyEditMs,
      artifact.maxBuildMs,
      artifact.maxExtremeEditMs,
    ].every(timing) ||
    ![
      artifact.retainedBytesBeforePivot,
      artifact.retainedBytesWithPivot,
      artifact.retainedBytesPerPivot,
    ].every(nonnegative) ||
    !Array.isArray(artifact.status) ||
    artifact.status[0] !== 0
  ) {
    return "pivot capture has invalid measurements or a failed pivot status";
  }

  return artifact;
}

function provenance(meta: CaptureMeta, source: string, timeLabel = "Captured"): string[] {
  return provenanceList([
    [timeLabel, `${formatCaptureTime(meta.timestamp)} UTC`],
    ["Commit", `${shortHash(meta.commit)} clean worktree`],
    ...(meta.cpu === undefined ? [] : [["CPU", html(meta.cpu)] as [string, string]]),
    ...(meta.machine === undefined ? [] : [["Machine", html(meta.machine)] as [string, string]]),
    ...(meta.memoryMax === undefined
      ? []
      : [["Capture memory cap", html(meta.memoryMax)] as [string, string]]),
    ...(meta.bun === undefined ? [] : [["Bun", html(meta.bun)] as [string, string]]),
    ...(meta.node === undefined ? [] : [["Node executable", html(meta.node)] as [string, string]]),
    ...(meta.npm === undefined ? [] : [["npm", html(meta.npm)] as [string, string]]),
    ...(meta.kernel === undefined ? [] : [["Kernel", html(meta.kernel)] as [string, string]]),
    ["Raw artifact", `<code>${html(source)}</code>`],
  ]);
}

export function renderChartTrackingSection(
  evidence: ChartTrackingEvidence,
  source: string,
): string[] {
  const outside = evidence.rows.find(
    (row) => row.chartCount === 2_000 && row.source === "literal" && row.scenario === "outside",
  );
  const largest = evidence.rows.find(
    (row) => row.chartCount === 20_000 && row.source === "literal" && row.scenario === "outside",
  );

  if (outside === undefined || largest === undefined) {
    throw new Error("Full chart evidence needs the 2,000 and 20,000 chart outside-edit cases");
  }

  return [
    "## Chart source tracking",
    "",
    `With 2,000 literal-source charts, an outside-source edit takes ${(outside.commitMs.median * 1_000).toFixed(2)} µs median / ${(outside.commitMs.p95 * 1_000).toFixed(2)} µs p95, versus ${(outside.baselineMs.median * 1_000).toFixed(2)} / ${(outside.baselineMs.p95 * 1_000).toFixed(2)} µs with no charts. No chart is reported or resolved. Median cost does not rise proportionally across 200, 2,000 and 20,000 charts in this capture. This is not an asymptotic guarantee: the 20,000-chart p95 is ${(largest.commitMs.p95 * 1_000).toFixed(2)} µs versus ${(largest.baselineMs.p95 * 1_000).toFixed(2)} µs without charts.`,
    "",
    "These are transaction-tracking costs, not SVG drawing or browser frame times. The no-chart control belongs to the same 0.6 capture, not an older release. Formula-backed sources refresh conservatively on value commits; their full costs and event counts remain visible below.",
    "",
    ...provenance(evidence.meta, source),
    ...benchScaleFigure("commit", [
      { label: "No-chart baseline", entries: [{ sizeLabel: "", ...evidence.baseline }] },
      ...evidence.rows.map((row) => ({
        label: `${row.chartCount} charts · ${row.source} · ${row.scenario} source`,
        entries: [
          { sizeLabel: "Commit", ...row.commitMs },
          { sizeLabel: "No charts", ...row.baselineMs, series: "compare" as const },
          ...(row.eventMs === null ? [] : [{ sizeLabel: "Event", ...row.eventMs }]),
        ],
      })),
    ]),
    "",
    "### Tracking checkpoints",
    "",
    "Event timings are omitted when no event is expected. Counts below are checked for every commit. Chart views are resolved only after the timer stops.",
    "",
    "| Charts | Source | Edit | Expected events | Expected charts | Resolutions / commit |",
    "| ---: | --- | --- | ---: | ---: | ---: |",
    ...evidence.rows.map(
      (row) =>
        `| ${row.chartCount} | ${row.source} | ${row.scenario} | ${row.expectedEvents} | ${row.expectedCharts} | ${row.resolutionsPerCommit} |`,
    ),
    "",
    `Each commit series contains ${evidence.samples} measured samples after ${evidence.warmups} warmups.`,
    "",
    "Each chart reads two cells on its own row in one contiguous source region. Owners hold at most 100 charts per sheet. Inside edits change the second cell of chart 0's source and must report exactly that chart for literal sources. For formula sources, the row named literal-dependency-edit changes the literal second cell that chart 0's formula reads. The formula stays in place, so the index is not rebuilt. The conservative policy still reports every computed chart. A formula-replacement edit, which rebuilds the index, is not measured in 0.6. After each commit, an untimed check confirms the dependent formula value changed and the expected charts were reported. Outside edits occur after the source region. They must trigger no event or view resolution for literal sources. Both formula cases report every computed chart, so their cost can grow with chart count. View resolution and value checks run after the timer stops. Event latency ends on entry to the callback. Setup is untimed. Outside edits still query source-index blocks; a silent event stream is not a constant-cost guarantee.",
    "",
    "Reproduce with:",
    "",
    '```sh verify title="Chart source-tracking evidence"',
    "bun run --filter @sheetwrite/bench bench:charts",
    "```",
    "",
  ];
}

export function renderPivotSection(evidence: PivotEvidence, source: string): string[] {
  return [
    "## Incremental pivot engine",
    "",
    `Over ${formatCount(evidence.sourceRows)} source rows, the SUM/AVERAGE build takes ${evidence.buildMs.median.toFixed(3)} ms median (${evidence.buildMs.p95.toFixed(3)} ms p95), versus ${evidence.editMs.median.toFixed(4)} ms median (${evidence.editMs.p95.toFixed(4)} ms p95) for an incremental value edit. The matrix has ${evidence.rowFields} row fields, ${evidence.columnFields} column field, and ${evidence.valueFields} value fields. Build and incremental edit timings describe different operations on the same engine, not a 0.5-versus-0.6 speedup.`,
    "",
    ...provenance(evidence.meta, source),
    ...benchScaleFigure(
      "operation",
      (
        [
          ["SUM / AVERAGE build", evidence.buildMs],
          ["Value edit", evidence.editMs],
          ["Donor-key edit", evidence.donorKeyEditMs],
          ["MAX build", evidence.maxBuildMs],
          ["MAX extreme-value edit", evidence.maxExtremeEditMs],
        ] satisfies Array<[string, Timing]>
      ).map(([label, stat]) => ({
        label,
        entries: [{ sizeLabel: "", median: stat.median, p95: stat.p95 }],
      })),
    ),
    "",
    "### Retained pivot memory",
    "",
    "| Measurement | Bytes |",
    "| --- | ---: |",
    `| Before pivot | ${formatBytes(evidence.retainedBytesBeforePivot)} |`,
    `| With pivot | ${formatBytes(evidence.retainedBytesWithPivot)} |`,
    `| Pivot increment | ${formatBytes(evidence.retainedBytesPerPivot)} |`,
    "",
    "Retained engine allocation is not process peak RSS. Each edit sample is normalized per edit by the capture harness. The harness checks pivot status and edited aggregates before accepting its measurements.",
    "",
    "Reproduce with:",
    "",
    '```sh verify title="Incremental pivot evidence"',
    "bun run --filter @sheetwrite/bench bench:pivot -- --output results/pivot-results.json",
    "```",
    "",
  ];
}

interface ReleaseComparisonEvidence {
  schemaVersion: 1;
  protocol: "sheetwrite-release-comparison-v1";
  meta: ReleaseComparisonMeta;
  captureMetadata: ReleaseCaptureNotes;
  base: { ref: string; commit: string };
  candidate: { commit: string; dirty: boolean };
  suites: Array<{
    artifact: string;
    status: "compared" | "new-only" | "missing-candidate";
    comparisonLabel: string;
    base: { commit: string; timestamp: string | null } | null;
    candidate: { commit: string; dirty: boolean | null; timestamp: string | null } | null;
    baselineCapture: { timestamp: string } | null;
    candidateCapture: { timestamp: string };
    threshold: { kind: string; source: string; description: string };
    metrics: Array<{
      key: string;
      unit: "ms" | "ns" | "bytes" | "count" | "ratio";
      rounds: { base: number; candidate: number };
      base: { median: number; p95: number } | null;
      candidate: { median: number; p95: number } | null;
      medianRatio: number | null;
      p95Ratio: number | null;
      verdict: string;
      ceilingPassed?: boolean;
      note?: string;
    }>;
  }>;
}

export function validateReleaseComparisonArtifact(
  value: Record<string, unknown>,
): ReleaseComparisonEvidence | string {
  const artifact = value as unknown as ReleaseComparisonEvidence;

  if (
    artifact.schemaVersion !== 1 ||
    artifact.protocol !== "sheetwrite-release-comparison-v1" ||
    artifact.candidate?.dirty !== false ||
    artifact.candidate.commit !== artifact.meta?.commit ||
    artifact.captureMetadata?.captureCommit !== artifact.candidate.commit ||
    !Array.isArray(artifact.captureMetadata.publicationNotes) ||
    artifact.captureMetadata.publicationNotes.some(
      (note) =>
        typeof note?.title !== "string" ||
        !Array.isArray(note.paragraphs) ||
        note.paragraphs.some((paragraph) => typeof paragraph !== "string"),
    ) ||
    artifact.meta.effectiveCpuAffinityBySuite === null ||
    typeof artifact.meta.effectiveCpuAffinityBySuite !== "object" ||
    typeof artifact.base?.ref !== "string" ||
    typeof artifact.base.commit !== "string" ||
    !Array.isArray(artifact.suites) ||
    artifact.suites.length === 0
  ) {
    return "artifact is not a clean-tree release comparison";
  }

  for (const suite of artifact.suites) {
    if (
      typeof suite.artifact !== "string" ||
      typeof suite.comparisonLabel !== "string" ||
      !["compared", "new-only", "missing-candidate"].includes(suite.status) ||
      typeof suite.threshold?.description !== "string" ||
      typeof suite.threshold.source !== "string" ||
      !Array.isArray(suite.metrics) ||
      suite.candidate?.dirty === true
    ) {
      return "release comparison contains an invalid suite";
    }

    for (const metric of suite.metrics) {
      const measurements = [metric.base, metric.candidate].filter((stat) => stat !== null);

      if (
        typeof metric.key !== "string" ||
        typeof metric.verdict !== "string" ||
        (metric.note !== undefined && typeof metric.note !== "string") ||
        !["ms", "ns", "bytes", "count", "ratio"].includes(metric.unit) ||
        measurements.some((stat) => !nonnegative(stat.median) || !nonnegative(stat.p95)) ||
        [metric.medianRatio, metric.p95Ratio].some((ratio) => ratio !== null && !nonnegative(ratio))
      ) {
        return "release comparison contains invalid measurements";
      }
    }
  }

  return artifact;
}

function comparisonCell(value: string): string {
  return html(value).replaceAll("|", "&#124;").replaceAll("\n", " ");
}

export function renderReleaseComparisonSection(
  evidence: ReleaseComparisonEvidence,
  source: string,
): string[] {
  const stat = (measurement: { median: number; p95: number } | null, unit: string): string =>
    measurement === null
      ? "Not captured"
      : `${measurement.median.toPrecision(5)} / ${measurement.p95.toPrecision(5)} ${unit}`;
  const ratio = (value: number | null): string => (value === null ? "—" : `${value.toFixed(3)}×`);
  // A text stamp may lack its own timestamp (the promoted render baseline); then
  // the receipt's scope start is the closest bound time, and is labeled as such.
  const captureLabel = (
    stamp: { commit: string; timestamp: string | null } | null,
    scope: { timestamp: string } | null,
  ): string => {
    if (stamp === null) return "not available";
    const timestamp = stamp.timestamp ?? scope?.timestamp;
    if (timestamp === undefined) throw new Error("Missing bound capture timestamp");
    const origin = stamp.timestamp === null ? " · scope start" : "";
    return `${shortHash(stamp.commit)} · ${formatCaptureTime(timestamp)} UTC${origin}`;
  };
  const flags = evidence.suites.flatMap((suite) =>
    suite.metrics
      .filter((metric) => metric.verdict === "regression")
      .map((metric) => ({ artifact: suite.artifact, ...metric })),
  );
  const newOnly = evidence.suites
    .filter((suite) => suite.status === "new-only")
    .map((suite) => `<code>${html(suite.artifact)}</code>`);
  const affinities = Object.entries(evidence.meta.effectiveCpuAffinityBySuite).sort(
    ([left], [right]) => left.localeCompare(right),
  );

  return [
    "## Release comparison",
    "",
    "### Sheetwrite 0.6.0 compared with a fresh 0.5.4 capture",
    "",
    `**${flags.length} rows exceed their suite's recorded limit or noise test.** They are listed first, not removed or normalized against a control. The complete median/p95 and ratio tables follow. A descriptive comparison flag is not itself a controlled gate verdict; rows without a documented threshold are labeled slower or faster rather than assigned an invented noise limit.`,
    "",
    "| Artifact and metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...flags.map(
      (metric) =>
        `| <code>${comparisonCell(metric.artifact)} · ${comparisonCell(metric.key)}</code> | ${stat(metric.base, metric.unit)} | ${stat(metric.candidate, metric.unit)} | ${ratio(metric.medianRatio)} | ${ratio(metric.p95Ratio)} |`,
    ),
    "",
    "### Capture conditions",
    "",
    `Both releases were captured on the same machine and toolchain, one suite at a time, each in its own scope with a ${html(evidence.meta.memoryMax ?? "recorded")} memory cap. The parent slice's memory-high counter must stay unchanged during a suite. Each suite uses the same effective CPU mask on both sides; the comparison refuses a mismatch.`,
    "",
    "| Suite | Effective CPU mask |",
    "| --- | --- |",
    ...affinities.map(([suite, mask]) => `| <code>${html(suite)}</code> | ${html(mask)} |`),
    "",
    "For data captures, a full garbage collection runs between samples, untimed. Each ingest sample also gets a fresh happy-dom document after the prior sample has released its store or grid. Both versions use data protocol v2. Mixed protocol versions are rejected.",
    "",
    "Formula tables compare the 0.5.4 engine (WASM) under the 0.6 core and harness with the 0.6 engine under that same core and harness. They isolate the engine difference only. The source records both commits and the hashes of the loaded binaries. Grid constant edits and Node initialization time current-core paths, so those measurements are 0.6-only and have no version ratio. A workload absent from the older engine is marked not in 0.5.4.",
    "",
    ...(newOnly.length === 0
      ? []
      : [`New in 0.6, with no 0.5.4 comparison: ${newOnly.join(", ")}.`, ""]),
    ...provenance(evidence.meta, source, "Comparison generated"),
    `Comparison base: <code>${html(evidence.base.ref)}</code> at ${shortHash(evidence.base.commit)}. Candidate: ${shortHash(evidence.candidate.commit)}. Ratios are candidate / 0.5.4: below 1 is lower; above 1 is higher. Median and p95 retain the artifact's units. New-only and removed measurements are not ratios.`,
    "",
    ...evidence.captureMetadata.publicationNotes.flatMap((note) => [
      `### ${html(note.title)}`,
      "",
      ...note.paragraphs.flatMap((paragraph) => [html(paragraph), ""]),
    ]),
    ...evidence.suites.flatMap((suite) => [
      `### ${suite.artifact}`,
      "",
      `Status: **${suite.status}**. Baseline: **${html(suite.comparisonLabel)}**. Baseline capture: ${captureLabel(suite.base, suite.baselineCapture)}. Candidate capture: ${captureLabel(suite.candidate, suite.candidateCapture)}.`,
      "",
      `Threshold: **${html(suite.threshold.kind)}**. ${html(suite.threshold.description)} Source: <code>${html(suite.threshold.source)}</code>.`,
      "",
      "| Metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio | Verdict |",
      "| --- | ---: | ---: | ---: | ---: | --- |",
      ...suite.metrics.map(
        (metric) =>
          `| <code>${comparisonCell(metric.key)}</code> | ${stat(metric.base, metric.unit)} | ${stat(metric.candidate, metric.unit)} | ${ratio(metric.medianRatio)} | ${ratio(metric.p95Ratio)} | ${comparisonCell(metric.verdict)}${metric.note === undefined ? "" : ` · ${comparisonCell(metric.note)}`}${metric.ceilingPassed === false ? " · ceiling failed" : ""} |`,
      ),
      "",
    ]),
    "Generate from captured artifacts without running benchmarks:",
    "",
    '```sh verify title="Release comparison artifact"',
    "cd bench",
    "bun src/release-comparison.ts --base-ref release/version-0.5.4 --baseline-results-dir results/releases/0.5.4 --output results/release-comparison.json",
    "```",
    "",
  ];
}
