import { createRequire } from "node:module";
import { cpus } from "node:os";
import { relative, resolve } from "node:path";

import { optionValue } from "./cli-options.js";
import { validateEngineVersions } from "./engine-versions.js";
import { packageVersion, type ProtocolCaptureMeta, protocolCaptureMeta } from "./protocol-meta.js";
import { counterbalancedOrder, summarizeFinite } from "./stats.js";

const BENCH_ROOT = resolve(import.meta.dir, "..");
const REPOSITORY_ROOT = resolve(BENCH_ROOT, "..");
const WORKER = resolve(import.meta.dir, "xlsx-bench-worker.ts");
const CORPUS_FIXTURE = resolve(BENCH_ROOT, "fixtures/xlsx-codec-corpus.xlsx");
const CORPUS_GENERATOR = resolve(BENCH_ROOT, "fixtures/generate-xlsx-corpus.py");
const FIXTURE_BYTES = 1_038_346;
const FIXTURE_SHA256 = "2633e51a4a3caa8d34b2e2147b997c6ebdd0cf514be6e6c60663a0f7659e6e00";
const GENERATOR_SHA256 = "a00a25851cbb8479a13472ef07ad3a133f8901505ea89da8f967041d4b9f4fb2";
const BASELINE_COMMIT = "87fadb72397947ea8c6ba576682925c7879579b8";
const PROTOCOL = "sheetwrite-xlsx-codec-v3";
const MAX_BASELINE_RATIO = 1.25;
const MAX_REJECTION_WALL_MS = 1_000;
const MAX_REJECTION_RSS_BYTES = 256 * 1024 * 1024;

export type XlsxBenchmarkMode = "smoke" | "full";
type XlsxEngine = "current" | "baseline";
type XlsxOperation = "import" | "export" | "reject";

interface Scenario {
  readonly operation: XlsxOperation;
  readonly name: string;
  readonly fixture: string;
}

const PERFORMANCE_SCENARIOS: readonly Scenario[] = [
  { operation: "import", name: "combined", fixture: CORPUS_FIXTURE },
  { operation: "export", name: "scalar", fixture: CORPUS_FIXTURE },
  { operation: "export", name: "rich", fixture: CORPUS_FIXTURE },
  { operation: "export", name: "shared-style", fixture: CORPUS_FIXTURE },
  { operation: "export", name: "sparse", fixture: CORPUS_FIXTURE },
] as const;

const REJECTION_SCENARIOS: readonly Scenario[] = [
  {
    operation: "reject",
    name: "compression-ratio",
    fixture: resolve(REPOSITORY_ROOT, "packages/xlsx/test/fixtures/compression-ratio.xlsx"),
  },
  {
    operation: "reject",
    name: "deep-xml",
    fixture: resolve(REPOSITORY_ROOT, "packages/xlsx/test/fixtures/deep-xml.xlsx"),
  },
] as const;

export interface XlsxRawSample {
  readonly round: number;
  readonly engine: XlsxEngine;
  readonly operation: XlsxOperation;
  readonly scenario: string;
  readonly durationMs: number;
  readonly processWallMs: number;
  readonly maxRssBytes: number;
  readonly rssBeforeBytes: number;
  readonly rssAfterBytes: number;
  readonly heapBeforeBytes: number;
  readonly heapAfterBytes: number;
  readonly arrayBuffersBeforeBytes: number;
  readonly arrayBuffersAfterBytes: number;
  readonly heapRetainedBytes: number;
  readonly arrayBuffersRetainedBytes: number;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly checksum: string;
  /**
   * Heap and ArrayBuffer growth across the operation in a second worker run
   * with the collector off, so every byte the operation allocates is counted.
   */
  readonly allocatedBytes: number;
  readonly rejection?: string;
}

export interface XlsxFiniteSummary {
  readonly median: number;
  readonly p95: number;
  readonly mad: number;
  readonly iters: number;
}

export interface XlsxScenarioSummary {
  readonly engine: XlsxEngine;
  readonly operation: XlsxOperation;
  readonly scenario: string;
  readonly durationMs: XlsxFiniteSummary;
  readonly processWallMs: XlsxFiniteSummary;
  readonly maxRssBytes: XlsxFiniteSummary & { readonly max: number };
  readonly allocatedBytes: XlsxFiniteSummary & {
    readonly max: number;
  };
  readonly retainedAfterGcDeltaBytes: XlsxFiniteSummary & {
    readonly max: number;
  };
}

export interface XlsxComparison {
  readonly operation: "import" | "export";
  readonly scenario: string;
  readonly medianWallRatio: number;
  readonly peakRssRatio: number;
}

export interface XlsxBenchmarkArtifact {
  readonly protocol: typeof PROTOCOL;
  readonly mode: XlsxBenchmarkMode;
  readonly metadata: ProtocolCaptureMeta & {
    readonly engineVersions: {
      readonly sheetwrite: string;
      readonly exceljs?: string;
    };
  };
  readonly rounds: number;
  readonly maxBaselineRatio: number;
  readonly fixture: {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly generatorPath: string;
    readonly generatorSha256: string;
    readonly producer: "LibreOffice 26.2.4.2 Calc MS Excel 2007 XML";
  };
  readonly toolchain: {
    readonly bun: string;
    readonly node: string;
    readonly platform: string;
    readonly arch: string;
    readonly cpu: string;
    readonly baselineCommit?: string;
  };
  readonly methodology: {
    readonly timing: string;
    readonly memory: string;
    readonly allocation: string;
  };
  readonly scenarios: readonly string[];
  readonly samples: readonly XlsxRawSample[];
  readonly summaries: readonly XlsxScenarioSummary[];
  readonly comparisons: readonly XlsxComparison[];
}

function sha256(bytes: Uint8Array): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(bytes);
  return hasher.digest("hex");
}

function key(value: Pick<XlsxRawSample, "engine" | "operation" | "scenario">): string {
  return `${value.engine}:${value.operation}:${value.scenario}`;
}

function finite_non_negative(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${path} must be finite and non-negative`);
}

function exact_matrix(expected: readonly string[], actual: readonly string[]): void {
  const expected_sorted = [...expected].sort();
  const actual_sorted = [...actual].sort();
  if (JSON.stringify(expected_sorted) !== JSON.stringify(actual_sorted)) {
    throw new Error(
      `XLSX benchmark matrix mismatch: expected ${expected_sorted.join(", ")}; received ${actual_sorted.join(", ")}`,
    );
  }
}

function summary_for(samples: readonly XlsxRawSample[]): XlsxScenarioSummary {
  const first = samples[0];
  if (!first) throw new Error("cannot summarize an empty XLSX sample");
  const rss = samples.map((sample) => sample.maxRssBytes);
  const allocated = samples.map((sample) => sample.allocatedBytes);
  const retained = samples.map(
    (sample) =>
      Math.max(0, sample.heapRetainedBytes - sample.heapBeforeBytes) +
      Math.max(0, sample.arrayBuffersRetainedBytes - sample.arrayBuffersBeforeBytes),
  );
  return {
    engine: first.engine,
    operation: first.operation,
    scenario: first.scenario,
    durationMs: summarizeFinite(samples.map((sample) => sample.durationMs)),
    processWallMs: summarizeFinite(samples.map((sample) => sample.processWallMs)),
    maxRssBytes: { ...summarizeFinite(rss), max: Math.max(...rss) },
    allocatedBytes: {
      ...summarizeFinite(allocated),
      max: Math.max(...allocated),
    },
    retainedAfterGcDeltaBytes: {
      ...summarizeFinite(retained),
      max: Math.max(...retained),
    },
  };
}

function build_summaries(samples: readonly XlsxRawSample[]): XlsxScenarioSummary[] {
  const grouped = new Map<string, XlsxRawSample[]>();
  for (const sample of samples) {
    const bucket = grouped.get(key(sample));
    if (bucket) bucket.push(sample);
    else grouped.set(key(sample), [sample]);
  }
  return [...grouped.values()]
    .map(summary_for)
    .sort((left, right) => key(left).localeCompare(key(right)));
}

function build_comparisons(summaries: readonly XlsxScenarioSummary[]): XlsxComparison[] {
  const by_key = new Map(summaries.map((summary) => [key(summary), summary]));
  return PERFORMANCE_SCENARIOS.map((scenario) => {
    const current = by_key.get(`current:${scenario.operation}:${scenario.name}`);
    const baseline = by_key.get(`baseline:${scenario.operation}:${scenario.name}`);
    if (!current || !baseline)
      throw new Error(`missing baseline pair for ${scenario.operation}:${scenario.name}`);
    return {
      operation: scenario.operation as "import" | "export",
      scenario: scenario.name,
      medianWallRatio: current.durationMs.median / baseline.durationMs.median,
      peakRssRatio: current.maxRssBytes.max / baseline.maxRssBytes.max,
    };
  });
}

function baseline_commit(root: string): string {
  const result = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(`cannot identify XLSX baseline: ${result.stderr}`);
  return result.stdout.toString().trim();
}

/** What one worker process reports; the bench adds the round, wall time and allocation. */
type WorkerReport = Omit<XlsxRawSample, "round" | "processWallMs" | "allocatedBytes">;

interface WorkerRun {
  readonly engine: XlsxEngine;
  readonly scenario: Scenario;
  readonly mode: XlsxBenchmarkMode;
  readonly root: string;
}

/** One fresh worker process; `collector_off` turns JavaScriptCore's garbage collector off in it. */
async function spawn_worker(
  run: WorkerRun,
  collector_off: boolean,
): Promise<{ report: WorkerReport; wall_ms: number }> {
  const { engine, scenario, mode, root } = run;
  const started = performance.now();
  const child = Bun.spawn(
    [
      process.execPath,
      WORKER,
      "--engine",
      engine,
      "--operation",
      scenario.operation,
      "--scenario",
      scenario.name,
      "--mode",
      mode,
      "--root",
      root,
      "--fixture",
      scenario.fixture,
    ],
    {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      env: collector_off ? { ...process.env, BUN_JSC_useGC: "0" } : process.env,
    },
  );
  const [stdout, stderr, exit_code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const wall_ms = performance.now() - started;
  if (exit_code !== 0) {
    throw new Error(
      `${engine} ${scenario.operation}:${scenario.name} exited ${exit_code}: ${stderr.trim()}`,
    );
  }
  const [line, ...extra] = stdout.trim().split("\n");
  if (line === undefined || extra.length > 0) {
    throw new Error(`XLSX worker returned ${extra.length + 1} output lines`);
  }
  return { report: JSON.parse(line) as WorkerReport, wall_ms };
}

async function run_worker(
  round: number,
  engine: XlsxEngine,
  scenario: Scenario,
  mode: XlsxBenchmarkMode,
  root: string,
): Promise<XlsxRawSample> {
  const run = { engine, scenario, mode, root };
  const { report, wall_ms } = await spawn_worker(run, false);
  // Without collections, the heap and ArrayBuffer growth across the operation is every byte it
  // allocated; in the timed run it would also depend on when the last collection happened.
  const { report: uncollected } = await spawn_worker(run, true);
  // The baseline codec stamps the export time into its output, so only the current one compares.
  if (engine === "current" && uncollected.checksum !== report.checksum) {
    throw new Error(
      `${engine} ${scenario.operation}:${scenario.name} changed its output with the collector off`,
    );
  }
  return {
    ...report,
    round,
    processWallMs: wall_ms,
    allocatedBytes:
      Math.max(0, uncollected.heapAfterBytes - uncollected.heapBeforeBytes) +
      Math.max(0, uncollected.arrayBuffersAfterBytes - uncollected.arrayBuffersBeforeBytes),
  };
}

function expected_matrix(rounds: number, compared: boolean): string[] {
  const expected: string[] = [];
  for (let round = 0; round < rounds; round++) {
    for (const scenario of PERFORMANCE_SCENARIOS) {
      expected.push(`${round}:current:${scenario.operation}:${scenario.name}`);
      if (compared) expected.push(`${round}:baseline:${scenario.operation}:${scenario.name}`);
    }
    for (const scenario of REJECTION_SCENARIOS) {
      expected.push(`${round}:current:${scenario.operation}:${scenario.name}`);
    }
  }
  return expected;
}

export function validateXlsxBenchmarkArtifact(value: unknown): XlsxBenchmarkArtifact {
  if (!value || typeof value !== "object")
    throw new Error("XLSX benchmark artifact must be an object");
  const artifact = value as XlsxBenchmarkArtifact;
  if (artifact.protocol !== PROTOCOL)
    throw new Error(`unexpected XLSX protocol ${artifact.protocol}`);
  if (artifact.mode !== "smoke" && artifact.mode !== "full") throw new Error("invalid XLSX mode");
  if (!Number.isInteger(artifact.rounds) || artifact.rounds <= 0)
    throw new Error("invalid XLSX rounds");
  if (artifact.mode === "full" && artifact.toolchain.baselineCommit !== BASELINE_COMMIT) {
    throw new Error(`full XLSX benchmark requires baseline ${BASELINE_COMMIT}`);
  }
  validateEngineVersions(
    artifact.metadata?.engineVersions,
    artifact.toolchain.baselineCommit === undefined ? ["sheetwrite"] : ["sheetwrite", "exceljs"],
  );
  if (
    artifact.fixture.sha256 !== FIXTURE_SHA256 ||
    artifact.fixture.generatorSha256 !== GENERATOR_SHA256
  ) {
    throw new Error("XLSX fixture or generator checksum is stale");
  }
  if (
    artifact.fixture.bytes !== FIXTURE_BYTES ||
    artifact.fixture.path !== "bench/fixtures/xlsx-codec-corpus.xlsx" ||
    artifact.fixture.generatorPath !== "bench/fixtures/generate-xlsx-corpus.py" ||
    artifact.fixture.producer !== "LibreOffice 26.2.4.2 Calc MS Excel 2007 XML"
  ) {
    throw new Error("XLSX fixture provenance is incomplete");
  }
  exact_matrix(
    [
      ...PERFORMANCE_SCENARIOS.map((scenario) => `${scenario.operation}:${scenario.name}`),
      ...REJECTION_SCENARIOS.map((scenario) => `${scenario.operation}:${scenario.name}`),
    ],
    artifact.scenarios,
  );
  if (
    typeof artifact.metadata.commit !== "string" ||
    typeof artifact.metadata.dirty !== "boolean" ||
    !Number.isFinite(Date.parse(artifact.metadata.timestamp))
  ) {
    throw new Error("XLSX capture metadata is invalid");
  }
  for (const name of ["bun", "node", "platform", "arch", "cpu"] as const) {
    if (typeof artifact.toolchain[name] !== "string" || artifact.toolchain[name].length === 0) {
      throw new Error(`XLSX toolchain ${name} is missing`);
    }
  }
  if (artifact.maxBaselineRatio !== MAX_BASELINE_RATIO) throw new Error("XLSX ratio gate is stale");
  const compared = artifact.toolchain.baselineCommit !== undefined;
  exact_matrix(
    expected_matrix(artifact.rounds, compared),
    artifact.samples.map(
      (sample) => `${sample.round}:${sample.engine}:${sample.operation}:${sample.scenario}`,
    ),
  );
  for (const [index, sample] of artifact.samples.entries()) {
    for (const metric of [
      "durationMs",
      "processWallMs",
      "maxRssBytes",
      "rssBeforeBytes",
      "rssAfterBytes",
      "heapBeforeBytes",
      "heapAfterBytes",
      "arrayBuffersBeforeBytes",
      "arrayBuffersAfterBytes",
      "heapRetainedBytes",
      "arrayBuffersRetainedBytes",
      "inputBytes",
      "outputBytes",
      "allocatedBytes",
    ] as const) {
      finite_non_negative(sample[metric], `samples[${index}].${metric}`);
    }
    if (!/^[a-f\d]{64}$/.test(sample.checksum)) {
      throw new Error(`samples[${index}].checksum must be SHA-256`);
    }
    if (sample.maxRssBytes < sample.rssAfterBytes) {
      throw new Error(`samples[${index}] peak RSS is below final RSS`);
    }
    if (sample.operation === "reject") {
      const expected_resource =
        sample.scenario === "compression-ratio" ? "maxCompressionRatio" : "maxXmlDepth";
      if (!sample.rejection?.includes(expected_resource)) {
        throw new Error(`samples[${index}] did not reject the expected hostile resource`);
      }
      if (
        sample.durationMs > MAX_REJECTION_WALL_MS ||
        sample.maxRssBytes > MAX_REJECTION_RSS_BYTES
      ) {
        throw new Error(`samples[${index}] exceeded the bounded rejection envelope`);
      }
    } else if (sample.rejection !== undefined) {
      throw new Error(`samples[${index}] recorded a rejection for a successful operation`);
    }
  }
  for (const scenario of [...PERFORMANCE_SCENARIOS, ...REJECTION_SCENARIOS]) {
    const checksums = new Set(
      artifact.samples
        .filter(
          (sample) =>
            sample.engine === "current" &&
            sample.operation === scenario.operation &&
            sample.scenario === scenario.name,
        )
        .map((sample) => sample.checksum),
    );
    if (checksums.size !== 1)
      throw new Error(`current ${scenario.operation}:${scenario.name} is not deterministic`);
  }
  const summaries = build_summaries(artifact.samples);
  if (JSON.stringify(artifact.summaries) !== JSON.stringify(summaries)) {
    throw new Error("XLSX summaries do not match raw samples");
  }
  const comparisons = compared ? build_comparisons(summaries) : [];
  if (JSON.stringify(artifact.comparisons) !== JSON.stringify(comparisons)) {
    throw new Error("XLSX comparisons do not match raw samples");
  }
  for (const comparison of comparisons) {
    if (
      comparison.medianWallRatio > MAX_BASELINE_RATIO ||
      comparison.peakRssRatio > MAX_BASELINE_RATIO
    ) {
      throw new Error(
        `XLSX ${comparison.operation}:${comparison.scenario} regressed: wall ${comparison.medianWallRatio.toFixed(3)}x, RSS ${comparison.peakRssRatio.toFixed(3)}x`,
      );
    }
  }
  return artifact;
}

interface RunOptions {
  readonly mode: XlsxBenchmarkMode;
  readonly rounds: number;
  readonly baselineRoot?: string;
}

export async function runXlsxBenchmark(options: RunOptions): Promise<XlsxBenchmarkArtifact> {
  if (!Number.isInteger(options.rounds) || options.rounds <= 0) {
    throw new RangeError("XLSX benchmark rounds must be a positive integer");
  }
  if (options.mode === "full" && !options.baselineRoot) {
    throw new Error("full XLSX benchmark requires --baseline-root");
  }
  if (sha256(new Uint8Array(await Bun.file(CORPUS_FIXTURE).arrayBuffer())) !== FIXTURE_SHA256) {
    throw new Error("committed XLSX corpus checksum does not match the protocol");
  }
  if (sha256(new Uint8Array(await Bun.file(CORPUS_GENERATOR).arrayBuffer())) !== GENERATOR_SHA256) {
    throw new Error("XLSX corpus generator checksum does not match the protocol");
  }
  if (options.baselineRoot && baseline_commit(options.baselineRoot) !== BASELINE_COMMIT) {
    throw new Error(`XLSX baseline must be detached at ${BASELINE_COMMIT}`);
  }

  const samples: XlsxRawSample[] = [];
  for (let round = 0; round < options.rounds; round++) {
    for (const scenario of PERFORMANCE_SCENARIOS) {
      const engines = options.baselineRoot
        ? counterbalancedOrder<XlsxEngine>(["current", "baseline"], options.rounds, 0x584c5358)[
            round
          ]!
        : (["current"] as const);
      for (const engine of engines) {
        samples.push(
          await run_worker(
            round,
            engine,
            scenario,
            options.mode,
            engine === "current" ? REPOSITORY_ROOT : options.baselineRoot!,
          ),
        );
      }
    }
    for (const scenario of REJECTION_SCENARIOS) {
      samples.push(await run_worker(round, "current", scenario, options.mode, REPOSITORY_ROOT));
    }
  }
  const summaries = build_summaries(samples);
  const comparisons = options.baselineRoot ? build_comparisons(summaries) : [];
  const fixture_bytes = Bun.file(CORPUS_FIXTURE).size;
  return validateXlsxBenchmarkArtifact({
    protocol: PROTOCOL,
    mode: options.mode,
    metadata: {
      ...protocolCaptureMeta(),
      engineVersions: {
        sheetwrite: packageVersion("packages/core/package.json"),
        ...(options.baselineRoot
          ? {
              exceljs: packageVersion(
                createRequire(resolve(options.baselineRoot, "packages/xlsx/package.json")).resolve(
                  "exceljs/package.json",
                ),
              ),
            }
          : {}),
      },
    },
    rounds: options.rounds,
    maxBaselineRatio: MAX_BASELINE_RATIO,
    fixture: {
      path: relative(REPOSITORY_ROOT, CORPUS_FIXTURE),
      bytes: fixture_bytes,
      sha256: FIXTURE_SHA256,
      generatorPath: relative(REPOSITORY_ROOT, CORPUS_GENERATOR),
      generatorSha256: GENERATOR_SHA256,
      producer: "LibreOffice 26.2.4.2 Calc MS Excel 2007 XML",
    },
    toolchain: {
      bun: Bun.version,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model ?? "unknown",
      ...(options.baselineRoot ? { baselineCommit: BASELINE_COMMIT } : {}),
    },
    methodology: {
      timing:
        "Each raw sample is one codec operation in a fresh Bun process; median and linearly interpolated p95 are computed across process-isolated rounds.",
      memory:
        "Peak RSS is Linux /proc/self/status VmHWM (or process.resourceUsage maxRSS fallback) from the same fresh worker process; reported gate value is the largest raw peak.",
      allocation:
        "Allocated bytes is max(0, heapUsed after-before) plus max(0, arrayBuffers after-before) in a second fresh worker per sample that runs the same operation with JavaScriptCore's collector off (BUN_JSC_useGC=0), so it counts every byte the operation allocates and does not depend on when the last collection ran; time, RSS and retained bytes come from the first worker. Retained-after-GC delta uses the same formula in the first worker, between a forced GC before the operation and a second forced GC after clearing completed operation frames; output checksums are retained, but operation results are released.",
    },
    scenarios: [
      ...PERFORMANCE_SCENARIOS.map((scenario) => `${scenario.operation}:${scenario.name}`),
      ...REJECTION_SCENARIOS.map((scenario) => `${scenario.operation}:${scenario.name}`),
    ],
    samples,
    summaries,
    comparisons,
  });
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const mode: XlsxBenchmarkMode = args.includes("--smoke") ? "smoke" : "full";
  const rounds_text = optionValue(args, "--rounds");
  const rounds = rounds_text === undefined ? (mode === "smoke" ? 1 : 5) : Number(rounds_text);
  const artifact = await runXlsxBenchmark({
    mode,
    rounds,
    baselineRoot: optionValue(args, "--baseline-root"),
  });
  const json = `${JSON.stringify(artifact)}\n`;
  const output =
    optionValue(args, "--output") ??
    (mode === "full" ? resolve(BENCH_ROOT, "results/xlsx-results.json") : undefined);
  if (output) await Bun.write(resolve(output), `${JSON.stringify(artifact, null, 2)}\n`);
  process.stdout.write(json);
}
