import { cpus, release } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type Browser, chromium, type Page } from "@playwright/test";

import { optionValue } from "./cli-options.js";
import { DEFAULT_SEED, datasetChecksum, makeColumnar } from "./dataset.js";
import type { BenchmarkMode } from "./gate-protocol.js";
import { packageVersion, sourceTreeDirty } from "./protocol-meta.js";
import benchmarkPage from "./render-bench.html";
import { validateRenderGateArtifact } from "./render-gate.js";
import {
  type BrowserCombinationResult,
  type BrowserLaunchAttempt,
  DIAGNOSTIC_RENDER_SCENARIOS,
  ENGINE_IDS,
  type EngineId,
  type FailedScenario,
  type FailureStage,
  parseRenderArtifactJson,
  parseScenarioResult,
  RENDER_MAX_LAUNCH_ATTEMPTS,
  RENDER_MINIMUM_SAMPLE_MS,
  RENDER_ORDER_SEED,
  RENDER_PROTOCOL_VERSION,
  RENDER_SCENARIOS,
  RENDER_VIEWPORT,
  type RenderBenchmarkArtifact,
  type RenderRunConfig,
  renderBenchmarkMarkdown,
  type ScenarioId,
  type ScenarioResult,
  scenarioDataValidity,
  scenarioGroup,
  summarizeCompleteness,
  WINDOW_TRANSFER_ORDER_SEED,
  WINDOW_TRANSFER_SCENARIO_IDS,
  type WindowTransferScenarioId,
} from "./render-protocol.js";
import { counterbalancedOrder } from "./stats.js";

const BENCH_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPOSITORY_ROOT = resolve(BENCH_ROOT, "..");
const DEFAULT_JSON_PATH = resolve(BENCH_ROOT, "results/render-results.json");
const DEFAULT_MARKDOWN_PATH = resolve(BENCH_ROOT, "results/render-results.md");
const DIAGNOSTIC_JSON_PATH = resolve(BENCH_ROOT, "results/render-diagnostics.json");
const DIAGNOSTIC_MARKDOWN_PATH = resolve(BENCH_ROOT, "results/render-diagnostics.md");

interface DriverConfiguration {
  readonly smoke: boolean;
  readonly engines: readonly EngineId[];
  readonly rows: readonly number[];
  readonly scenarios: readonly ScenarioId[];
  readonly diagnostic: boolean;
  /** The diagnostic window-transfer pair is among the scenarios. */
  readonly windowTransfer: boolean;
  readonly rounds: number;
  readonly measuredSamples: number;
  readonly warmupSamples: number;
  readonly minimumSampleDurationMs: number;
  readonly timeoutMs: number;
  readonly browserExecutable?: string;
  readonly outputPath?: string;
  readonly markdownPath?: string;
  readonly compactSamples?: boolean;
}

interface CombinationConfiguration {
  readonly runId: string;
  readonly round: number;
  readonly engine: EngineId;
  readonly rows: number;
  readonly scenarios?: readonly ScenarioId[];
  readonly measuredSamples: number;
  readonly warmupSamples: number;
  readonly minimumSampleDurationMs: number;
  readonly timeoutMs: number;
  readonly datasetHash: string;
  readonly browserExecutable?: string;
  readonly windowTransferDiagnostic?: boolean;
}

interface CombinationOutput {
  readonly results: readonly ScenarioResult[];
  readonly browserVersion?: string;
  readonly launchAttempts: readonly BrowserLaunchAttempt[];
}

/** Exit policy keeps comparison failures visible without hiding product regressions. */
export function renderCaptureExitCode(results: readonly ScenarioResult[]): 0 | 1 {
  return results.some((result) => {
    if (result.status !== "failed") return false;

    // This known comparison-engine stack limit must not block release evidence.
    return !(
      result.engine === "handsontable" &&
      result.rows === 1_000_000 &&
      (result.scenarioId === "altering.insert-5-rows-top" ||
        result.scenarioId === "altering.remove-5-rows-top") &&
      result.errorClass === "RangeError" &&
      /^(?:\w+ step failed: )?Maximum call stack size exceeded$/u.test(result.message) &&
      !result.timeout &&
      !result.crash &&
      result.consoleErrors.length === 0 &&
      result.pageErrors.length === 0
    );
  })
    ? 1
    : 0;
}

interface RuntimeDiagnostics {
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
}

function positive_integer_argument(
  args: readonly string[],
  name: string,
  fallback: number,
): number {
  const raw = optionValue(args, name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return parsed;
}

function non_negative_integer_argument(
  args: readonly string[],
  name: string,
  fallback: number,
): number {
  const raw = optionValue(args, name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return parsed;
}

/** The Markdown view written beside a JSON artifact: `x.json` → `x.md`, any other name gains `.md`. */
function markdown_path_for(json_path: string): string {
  return json_path.endsWith(".json")
    ? `${json_path.slice(0, -".json".length)}.md`
    : `${json_path}.md`;
}

function is_window_transfer_scenario(scenario: ScenarioId): boolean {
  return WINDOW_TRANSFER_SCENARIO_IDS.includes(scenario as WindowTransferScenarioId);
}

/** Driver options from the command line; throws on an invalid combination. */
export function parseConfiguration(args: readonly string[]): DriverConfiguration {
  const smoke = args.includes("--smoke");
  const scenario_set = optionValue(args, "--scenario-set") ?? "gate";
  if (scenario_set !== "gate" && scenario_set !== "diagnostic") {
    throw new TypeError("--scenario-set must be gate or diagnostic");
  }
  const diagnostic = scenario_set === "diagnostic";
  const set_scenarios: readonly ScenarioId[] = diagnostic
    ? DIAGNOSTIC_RENDER_SCENARIOS.map((scenario) => scenario.id)
    : RENDER_SCENARIOS.map((scenario) => scenario.id);
  // `--scenarios a,b` runs only those scenarios of the chosen set, for A/B runs of one row.
  const scenarios_arg = optionValue(args, "--scenarios");
  const scenarios =
    scenarios_arg === undefined
      ? set_scenarios
      : scenarios_arg.split(",").map((id) => {
          const scenario = set_scenarios.find((candidate) => candidate === id);
          if (scenario === undefined) {
            throw new TypeError(`--scenarios: ${id} is not in the ${scenario_set} set`);
          }
          return scenario;
        });
  // The window-transfer pair is measured against itself, so a run takes both rows or neither.
  const window_transfer_count = scenarios.filter(is_window_transfer_scenario).length;
  if (
    window_transfer_count !== 0 &&
    window_transfer_count !== WINDOW_TRANSFER_SCENARIO_IDS.length
  ) {
    throw new TypeError(
      `--scenarios: ${WINDOW_TRANSFER_SCENARIO_IDS.join(" and ")} run together or not at all`,
    );
  }
  const engine_arg = optionValue(args, "--engine");
  const engines: readonly EngineId[] =
    engine_arg === undefined
      ? diagnostic
        ? ["sheetwrite"]
        : ENGINE_IDS
      : [
          ENGINE_IDS.includes(engine_arg as EngineId)
            ? (engine_arg as EngineId)
            : (() => {
                throw new TypeError(`--engine must be one of: ${ENGINE_IDS.join(", ")}`);
              })(),
        ];
  if (diagnostic && engines.some((engine) => engine !== "sheetwrite")) {
    throw new TypeError("the diagnostic scenario set currently supports only sheetwrite");
  }
  const rows_arg = optionValue(args, "--rows");
  const rows = rows_arg
    ? rows_arg.split(",").map((entry) => {
        const parsed = Number(entry);
        if (!Number.isInteger(parsed) || parsed < 30) {
          throw new TypeError("--rows values must be integers >= 30");
        }
        return parsed;
      })
    : [smoke ? 200 : 100_000];
  if (new Set(rows).size !== rows.length) throw new TypeError("--rows values must be unique");

  const compact_samples = args.includes("--compact-samples");
  const output_arg = optionValue(args, "--output");
  const markdown_arg = optionValue(args, "--markdown-output");
  const output_path =
    output_arg ?? (smoke ? undefined : diagnostic ? DIAGNOSTIC_JSON_PATH : DEFAULT_JSON_PATH);
  const markdown_path =
    markdown_arg ??
    (output_path === undefined
      ? undefined
      : output_arg === undefined
        ? diagnostic
          ? DIAGNOSTIC_MARKDOWN_PATH
          : DEFAULT_MARKDOWN_PATH
        : markdown_path_for(output_path));
  return {
    smoke,
    engines,
    rows,
    scenarios,
    diagnostic,
    windowTransfer: diagnostic && window_transfer_count > 0,
    rounds: positive_integer_argument(args, "--rounds", smoke ? 1 : 2),
    measuredSamples: positive_integer_argument(args, "--samples", smoke ? 1 : 3),
    warmupSamples: non_negative_integer_argument(args, "--warmups", 1),
    minimumSampleDurationMs: Math.max(
      RENDER_MINIMUM_SAMPLE_MS,
      positive_integer_argument(args, "--minimum-sample-ms", RENDER_MINIMUM_SAMPLE_MS),
    ),
    timeoutMs: positive_integer_argument(args, "--timeout-ms", smoke ? 120_000 : 300_000),
    browserExecutable: optionValue(args, "--browser-executable"),
    outputPath: output_path,
    markdownPath: markdown_path,
    compactSamples: compact_samples,
  };
}

function normalized_error(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function failure_for_scenario(
  configuration: CombinationConfiguration,
  scenario_id: ScenarioId,
  stage: FailureStage,
  error: unknown,
  diagnostics: RuntimeDiagnostics,
  timeout: boolean,
  crash: boolean,
  partial_samples: FailedScenario["partialSamples"] = [],
): FailedScenario {
  const failure = normalized_error(error);
  const data_validity = scenarioDataValidity(scenario_id);
  return {
    runId: configuration.runId,
    round: configuration.round,
    engine: configuration.engine,
    rows: configuration.rows,
    scenarioId: scenario_id,
    group: scenarioGroup(scenario_id),
    ...(data_validity === undefined ? {} : { dataValidity: data_validity }),
    status: "failed",
    stage,
    errorClass: failure.name || "Error",
    message: failure.message || String(error),
    timeout,
    crash,
    consoleErrors: diagnostics.consoleErrors,
    pageErrors: diagnostics.pageErrors,
    partialSamples: partial_samples,
    validation: [],
    memory: { beforeBytes: null, afterBytes: null, deltaBytes: null },
  };
}

function combination_scenarios(configuration: CombinationConfiguration): readonly ScenarioId[] {
  return configuration.scenarios ?? RENDER_SCENARIOS.map((scenario) => scenario.id);
}

export function createCombinationFailures(
  configuration: CombinationConfiguration,
  stage: FailureStage,
  error: unknown,
  diagnostics: RuntimeDiagnostics = { consoleErrors: [], pageErrors: [] },
  timeout = false,
  crash = false,
): FailedScenario[] {
  return combination_scenarios(configuration).map((scenario_id) =>
    failure_for_scenario(configuration, scenario_id, stage, error, diagnostics, timeout, crash),
  );
}

function page_stage(value: unknown, fallback: FailureStage): FailureStage {
  return typeof value === "string" &&
    ["build", "launch", "mount", "warmup", "measure", "validate", "teardown"].includes(value)
    ? (value as FailureStage)
    : fallback;
}

function identity_matches(
  result: ScenarioResult,
  configuration: CombinationConfiguration,
): boolean {
  return (
    result.runId === configuration.runId &&
    result.round === configuration.round &&
    result.engine === configuration.engine &&
    result.rows === configuration.rows
  );
}

function diagnostics_failure(
  result: ScenarioResult,
  configuration: CombinationConfiguration,
  diagnostics: RuntimeDiagnostics,
): FailedScenario {
  if (result.status === "failed") {
    return {
      ...result,
      consoleErrors: [...result.consoleErrors, ...diagnostics.consoleErrors],
      pageErrors: [...result.pageErrors, ...diagnostics.pageErrors],
    };
  }
  return failure_for_scenario(
    configuration,
    result.scenarioId,
    "validate",
    new Error("browser emitted console or page errors during a successful scenario"),
    diagnostics,
    false,
    false,
    result.rawSamples,
  );
}

function normalize_browser_output(
  value: unknown,
  configuration: CombinationConfiguration,
  diagnostics: RuntimeDiagnostics,
): ScenarioResult[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return createCombinationFailures(
      configuration,
      "validate",
      new Error("missing browser result"),
      diagnostics,
    );
  }
  const input = value as Record<string, unknown>;
  if (
    input.protocolVersion !== RENDER_PROTOCOL_VERSION ||
    input.runId !== configuration.runId ||
    input.round !== configuration.round ||
    input.engine !== configuration.engine ||
    input.rows !== configuration.rows
  ) {
    return createCombinationFailures(
      configuration,
      "validate",
      new Error("stale or mismatched browser result identity"),
      diagnostics,
    );
  }
  if (input.datasetHash !== configuration.datasetHash) {
    return createCombinationFailures(
      configuration,
      "validate",
      new Error(
        `dataset checksum mismatch: expected ${configuration.datasetHash}, observed ${String(input.datasetHash)}`,
      ),
      diagnostics,
    );
  }
  if (!Array.isArray(input.results)) {
    return createCombinationFailures(
      configuration,
      "validate",
      new Error("browser result is missing its scenario array"),
      diagnostics,
    );
  }

  const normalized: ScenarioResult[] = [];
  for (const scenario_id of combination_scenarios(configuration)) {
    const matches = input.results.filter(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        "scenarioId" in entry &&
        entry.scenarioId === scenario_id,
    );
    if (matches.length !== 1) {
      normalized.push(
        failure_for_scenario(
          configuration,
          scenario_id,
          "validate",
          new Error(
            matches.length === 0
              ? "browser omitted the expected scenario"
              : "browser emitted duplicate scenario results",
          ),
          diagnostics,
          false,
          false,
        ),
      );
      continue;
    }
    try {
      const result = parseScenarioResult(
        matches[0],
        configuration.measuredSamples,
        configuration.minimumSampleDurationMs,
      );
      if (!identity_matches(result, configuration)) {
        throw new TypeError("scenario identity does not match its browser process");
      }
      normalized.push(
        diagnostics.consoleErrors.length > 0 || diagnostics.pageErrors.length > 0
          ? diagnostics_failure(result, configuration, diagnostics)
          : result,
      );
    } catch (error) {
      normalized.push(
        failure_for_scenario(
          configuration,
          scenario_id,
          "validate",
          error,
          diagnostics,
          false,
          false,
        ),
      );
    }
  }
  return normalized;
}

async function read_partial_page_state(page: Page): Promise<{
  readonly result?: BrowserCombinationResult;
  readonly error?: string;
  readonly stage?: string;
}> {
  try {
    return await page.evaluate(() => ({
      result: window.__benchResults,
      error: window.__benchError,
      stage: window.__benchStage,
    }));
  } catch {
    return {};
  }
}

async function run_combination(
  base_url: string,
  configuration: CombinationConfiguration,
): Promise<CombinationOutput> {
  const console_errors: string[] = [];
  const page_errors: string[] = [];
  const diagnostics = { consoleErrors: console_errors, pageErrors: page_errors };
  const launch_attempts: BrowserLaunchAttempt[] = [];
  let browser: Browser | undefined;
  let page: Page | undefined;
  let browser_version: string | undefined;
  let crashed = false;
  let stage: FailureStage = "launch";

  try {
    for (let attempt = 1; attempt <= RENDER_MAX_LAUNCH_ATTEMPTS; attempt++) {
      try {
        browser = await chromium.launch({
          headless: true,
          executablePath: configuration.browserExecutable,
          args: ["--enable-precise-memory-info"],
        });
        browser_version = browser.version();
        launch_attempts.push({
          round: configuration.round,
          engine: configuration.engine,
          rows: configuration.rows,
          attempt,
          success: true,
          errorClass: null,
          message: null,
        });
        break;
      } catch (error) {
        const failure = normalized_error(error);
        launch_attempts.push({
          round: configuration.round,
          engine: configuration.engine,
          rows: configuration.rows,
          attempt,
          success: false,
          errorClass: failure.name || "Error",
          message: failure.message,
        });
        if (attempt === RENDER_MAX_LAUNCH_ATTEMPTS) throw error;
        await Bun.sleep(500);
      }
    }
    if (!browser) throw new Error("browser launch attempts completed without a browser");
    page = await browser.newPage({
      viewport: { width: RENDER_VIEWPORT.width + 480, height: RENDER_VIEWPORT.height + 180 },
      deviceScaleFactor: combination_scenarios(configuration).includes(
        "scroll-fractional.same-window",
      )
        ? 1.25
        : 1,
    });
    page.on("console", (message) => {
      if (message.type() === "error") console_errors.push(message.text());
    });
    page.on("pageerror", (error) => page_errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        console_errors.push(`HTTP ${response.status()} ${response.url()}`);
      }
    });
    page.on("crash", () => {
      crashed = true;
    });
    await page.addInitScript(() => {
      delete window.__benchResults;
      delete window.__benchError;
      delete window.__benchStage;
      window.__benchDone = false;
    });

    const url = new URL(base_url);
    url.searchParams.set("auto", "1");
    url.searchParams.set("runId", configuration.runId);
    url.searchParams.set("round", String(configuration.round));
    url.searchParams.set("engine", configuration.engine);
    url.searchParams.set("rows", String(configuration.rows));
    url.searchParams.set("scenarios", combination_scenarios(configuration).join(","));
    url.searchParams.set("samples", String(configuration.measuredSamples));
    url.searchParams.set("warmups", String(configuration.warmupSamples));
    url.searchParams.set("minimumSampleMs", String(configuration.minimumSampleDurationMs));
    if (configuration.windowTransferDiagnostic) {
      url.searchParams.set("diagnostic", "window-transfer");
    }
    await page.goto(url.href, { waitUntil: "load", timeout: configuration.timeoutMs });
    stage = "mount";
    await page.waitForFunction(() => window.__benchDone === true, undefined, {
      timeout: configuration.timeoutMs,
    });
    const state = await read_partial_page_state(page);
    if (state.error && !state.result) throw new Error(state.error);
    return {
      results: normalize_browser_output(state.result, configuration, diagnostics),
      browserVersion: browser_version,
      launchAttempts: launch_attempts,
    };
  } catch (error) {
    const state = page ? await read_partial_page_state(page) : {};
    const normalized = normalized_error(error);
    const timed_out = normalized.name === "TimeoutError" || /timed out/iu.test(normalized.message);
    const observed_stage = page_stage(state.stage, stage);
    if (state.result) {
      const partial = normalize_browser_output(state.result, configuration, diagnostics);
      const by_scenario = new Map(partial.map((result) => [result.scenarioId, result]));
      const completed = combination_scenarios(configuration).map((scenario_id) => {
        const result = by_scenario.get(scenario_id);
        if (result && result.status === "success") return result;
        return failure_for_scenario(
          configuration,
          scenario_id,
          observed_stage,
          state.error ? new Error(state.error) : normalized,
          diagnostics,
          timed_out,
          crashed,
          result?.status === "failed" ? result.partialSamples : [],
        );
      });
      return {
        results: completed,
        browserVersion: browser_version,
        launchAttempts: launch_attempts,
      };
    }
    return {
      results: createCombinationFailures(
        configuration,
        observed_stage,
        state.error ? new Error(state.error) : normalized,
        diagnostics,
        timed_out,
        crashed,
      ),
      browserVersion: browser_version,
      launchAttempts: launch_attempts,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
      await Bun.sleep(250);
      Bun.gc(true);
    }
  }
}

function git_output(args: readonly string[]): string {
  const process_result = Bun.spawnSync(["git", ...args], {
    cwd: REPOSITORY_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (process_result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${process_result.stderr.toString().trim()}`);
  }
  return process_result.stdout.toString().trim();
}

function stable_json(value: RenderBenchmarkArtifact): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function validate_existing_artifact(
  path: string,
  gate_mode: BenchmarkMode | undefined,
): Promise<void> {
  const json = await Bun.file(path).text();
  const value: unknown = JSON.parse(json);
  const artifact = gate_mode
    ? validateRenderGateArtifact(value, gate_mode)
    : parseRenderArtifactJson(json);
  const markdown_path = markdown_path_for(path);
  const expected_markdown = renderBenchmarkMarkdown(artifact);
  const observed_markdown = await Bun.file(markdown_path).text();
  if (observed_markdown !== expected_markdown) {
    throw new Error(`${markdown_path} is not the byte-stable view of ${path}`);
  }
  console.log(
    `validated ${artifact.completeness.expectedKeys.length} render cells (${artifact.completeness.failedKeys.length} structured failures)`,
  );
}

async function run_driver(args: readonly string[]): Promise<void> {
  const validate_path = optionValue(args, "--validate");
  if (validate_path) {
    const mode_argument = optionValue(args, "--gate-mode");
    const gate_mode =
      mode_argument === undefined
        ? undefined
        : mode_argument === "full" || mode_argument === "smoke"
          ? mode_argument
          : (() => {
              throw new TypeError("--gate-mode must be full or smoke");
            })();
    await validate_existing_artifact(resolve(process.cwd(), validate_path), gate_mode);
    return;
  }

  const configuration = parseConfiguration(args);
  const run_id = crypto.randomUUID();
  const engine_order = counterbalancedOrder(
    configuration.engines,
    configuration.rounds,
    RENDER_ORDER_SEED,
  );
  const window_transfer_scenario_order = configuration.windowTransfer
    ? counterbalancedOrder(
        WINDOW_TRANSFER_SCENARIO_IDS,
        configuration.rounds,
        WINDOW_TRANSFER_ORDER_SEED,
      )
    : undefined;
  const dataset_hashes: Record<string, string> = {};
  for (const rows of configuration.rows) {
    dataset_hashes[String(rows)] = datasetChecksum(makeColumnar(rows, DEFAULT_SEED));
  }
  Bun.gc(true);

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    development: false,
    routes: {
      "/": benchmarkPage,
      "/favicon.ico": new Response(null, { status: 204 }),
      "/sheetwrite_wasm_bg.wasm": new Response(
        Bun.file(resolve(REPOSITORY_ROOT, "packages/wasm/pkg/sheetwrite_wasm_bg.wasm")),
        { headers: { "content-type": "application/wasm" } },
      ),
    },
  });

  const results: ScenarioResult[] = [];
  const launch_attempts: BrowserLaunchAttempt[] = [];
  let browser_version = "unavailable";
  try {
    for (let round_index = 0; round_index < engine_order.length; round_index++) {
      const round = round_index + 1;
      const scenarios =
        window_transfer_scenario_order === undefined
          ? configuration.scenarios
          : [
              ...configuration.scenarios.filter(
                (scenario) => !is_window_transfer_scenario(scenario),
              ),
              ...window_transfer_scenario_order[round_index]!,
            ];
      for (const engine of engine_order[round_index]!) {
        for (const rows of configuration.rows) {
          process.stderr.write(
            `render benchmark: round ${round}/${configuration.rounds}, ${engine}, ${rows.toLocaleString("en-US")} rows\n`,
          );
          const output = await run_combination(`http://${server.hostname}:${server.port}/`, {
            runId: run_id,
            round,
            engine,
            rows,
            scenarios,
            measuredSamples: configuration.measuredSamples,
            warmupSamples: configuration.warmupSamples,
            minimumSampleDurationMs: configuration.minimumSampleDurationMs,
            timeoutMs: configuration.timeoutMs,
            datasetHash: dataset_hashes[String(rows)]!,
            browserExecutable: configuration.browserExecutable,
            windowTransferDiagnostic: configuration.windowTransfer,
          });
          results.push(...output.results);
          launch_attempts.push(...output.launchAttempts);
          if (output.browserVersion) browser_version = output.browserVersion;
        }
      }
    }
  } finally {
    server.stop(true);
  }

  const config: RenderRunConfig = {
    engines: configuration.engines,
    rows: configuration.rows,
    scenarios: configuration.scenarios,
  };
  const timestamp = new Date().toISOString();
  const artifact: RenderBenchmarkArtifact = {
    protocolVersion: RENDER_PROTOCOL_VERSION,
    runId: run_id,
    metadata: {
      commit: git_output(["rev-parse", "HEAD"]),
      dirty: sourceTreeDirty(false),
      timestamp,
      bunVersion: Bun.version,
      nodeVersion: process.versions.node,
      browserVersion: browser_version,
      os: `${process.platform} ${release()}`,
      arch: process.arch,
      cpu: cpus()[0]?.model ?? "unknown",
      engineVersions: {
        sheetwrite: packageVersion("packages/core/package.json"),
        handsontable: packageVersion("bench/node_modules/handsontable/package.json"),
      },
      datasetSeed: DEFAULT_SEED,
      datasetHashes: dataset_hashes,
      viewport: RENDER_VIEWPORT,
      measuredSamples: configuration.measuredSamples,
      warmupSamples: configuration.warmupSamples,
      minimumSampleDurationMs: configuration.minimumSampleDurationMs,
      rounds: configuration.rounds,
      orderSeed: RENDER_ORDER_SEED,
      engineOrder: engine_order,
      launchAttempts: launch_attempts,
      ...(window_transfer_scenario_order === undefined
        ? {}
        : { windowTransferScenarioOrder: window_transfer_scenario_order }),
    },
    config,
    results,
    completeness: summarizeCompleteness(config, configuration.rounds, results),
    reproductionCommands: configuration.diagnostic
      ? ["bun run --filter '@sheetwrite/bench' bench:render:diagnostic"]
      : [
          "bun run --filter '@sheetwrite/bench' bench:render",
          "bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine sheetwrite",
          "bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine handsontable",
        ],
  };
  const json = stable_json(artifact);
  const parsed = parseRenderArtifactJson(json, { expectedRunId: run_id });
  const markdown = renderBenchmarkMarkdown(parsed);
  // Aggregate-only artifacts (docs evidence) drop per-sample arrays AFTER the
  // protocol self-parse above validated them; gate/baseline artifacts keep
  // raw rounds for spread verification.
  const output_json = configuration.compactSamples
    ? stable_json({
        ...artifact,
        results: artifact.results.map((result) => ({ ...result, rawSamples: [] })),
      })
    : json;

  if (configuration.outputPath) {
    await Bun.write(configuration.outputPath, output_json);
    if (!configuration.markdownPath) throw new Error("JSON output requires a Markdown output path");
    await Bun.write(configuration.markdownPath, markdown);
    process.stderr.write(
      `wrote ${configuration.outputPath} and ${configuration.markdownPath} (${parsed.completeness.failedKeys.length} failed cells)\n`,
    );
  } else {
    process.stdout.write(json);
  }

  process.exitCode = renderCaptureExitCode(parsed.results);
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  await run_driver(args);
}
