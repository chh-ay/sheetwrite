import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { type Browser, chromium } from "@playwright/test";

import pageHtml from "./analytics-bench.html";
import { machineLabel } from "./machine-label.js";
import { protocolCaptureMeta } from "./protocol-meta.js";
import { summarize, type Stat } from "./stats.js";

// Charts, PivotCharts, pivots, measures and dashboards in Chromium (#625).
// Each run starts a fresh browser and page; the page builds one scenario's
// workbook in a grid with the full engine and the charts add-on, runs the
// warm-ups, then times each sample (see analytics-page.ts).
//
//   bun bench/src/analytics-bench.ts [--scenario name]... [--runs 3]
//     [--samples 30] [--warmups 10] [--param key=value]...
//     [--profile dir] [--output file.json]
//
// --profile writes one V8 CPU profile per run, of the timed samples and
// warm-ups only, sampled every 100 µs.
// --readable serves the page unminified, so profile frames keep their
// function names; time minified bundles only.

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PAGE_TIMEOUT_MS = 600_000;
const PROFILE_INTERVAL_US = 100;

export const ANALYTICS_SCENARIOS = [
  "chart-edit-line",
  "chart-edit-column",
  "chart-filter-line",
  "scroll-charts",
  "dashboard-showcase-first",
  "dashboard-model-first",
  "dashboard-model-edit",
  "dashboard-model-slicer",
] as const;

interface PageResult {
  readonly samples: number[];
  readonly frames: number[];
  readonly extra?: Record<string, number>;
}

/** One scenario in one fresh browser. */
interface ScenarioRun {
  readonly scenario: string;
  readonly run: number;
  readonly ms: Stat;
  /** Median frames a sample took after its action. */
  readonly frames: number;
  readonly extra: Record<string, number>;
}

interface RunOptions {
  readonly baseUrl: string;
  readonly scenario: string;
  readonly run: number;
  readonly query: URLSearchParams;
  readonly profileDir: string | undefined;
}

/** Status changes the page reports through its `analyticsReport` binding. */
class PageReports {
  private readonly waiting = new Map<string, (json: string) => void>();
  private readonly received = new Map<string, string>();

  receive(state: string, json: string): void {
    // An error ends every wait: the page reports nothing after it.
    const key = state === "error" ? "error" : state;
    this.received.set(key, json);
    for (const [awaited, resolve] of this.waiting) {
      if (awaited === state || key === "error") resolve(json);
    }
  }

  /** The JSON of `state`, once the page reports it; rejects on an error report. */
  async next(state: string, errors: readonly string[]): Promise<string> {
    const known = this.received.get(state);
    if (known !== undefined) return known;
    const { promise, resolve } = Promise.withResolvers<string>();
    this.waiting.set(state, resolve);
    const timer = setTimeout(() => resolve(""), PAGE_TIMEOUT_MS);
    const json = await promise;
    clearTimeout(timer);
    this.waiting.delete(state);
    if (!this.received.has(state) || this.received.has("error") || errors.length > 0) {
      throw new Error(`The page did not report ${state}: ${errors.join("; ") || "error status"}`);
    }
    return json;
  }
}

async function measure_run(browser: Browser, options: RunOptions): Promise<ScenarioRun> {
  const page = await browser.newPage({ viewport: { width: 1_280, height: 800 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const reports = new PageReports();
  await page.exposeFunction("analyticsReport", (state: string, json: string) =>
    reports.receive(state, json),
  );
  const query = new URLSearchParams(options.query);
  query.set("scenario", options.scenario);
  await page.goto(`${options.baseUrl}?${query}`, { waitUntil: "load" });
  await reports.next("idle", errors);

  const session = options.profileDir ? await page.context().newCDPSession(page) : null;
  if (session) {
    await session.send("Profiler.enable");
    await session.send("Profiler.setSamplingInterval", { interval: PROFILE_INTERVAL_US });
    await session.send("Profiler.start");
  }
  await page.locator("#bench-run").click();
  const result = JSON.parse(await reports.next("done", errors)) as PageResult;
  if (session && options.profileDir) {
    const { profile } = await session.send("Profiler.stop");
    mkdirSync(options.profileDir, { recursive: true });
    writeFileSync(
      join(options.profileDir, `${options.scenario}-${options.run}.cpuprofile`),
      JSON.stringify(profile),
    );
  }
  await page.close();
  const frames = summarize(result.frames).median;
  return {
    scenario: options.scenario,
    run: options.run,
    ms: summarize(result.samples),
    frames,
    extra: result.extra ?? {},
  };
}

function query_params(values: readonly string[]): URLSearchParams {
  const query = new URLSearchParams();
  for (const entry of values) {
    const [key, value] = entry.split("=", 2);
    if (!key || value === undefined) throw new Error(`--param needs key=value: ${entry}`);
    query.set(key, value);
  }
  return query;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((argument) => argument !== "--"),
    options: {
      scenario: { type: "string", multiple: true },
      runs: { type: "string", default: "3" },
      samples: { type: "string", default: "30" },
      warmups: { type: "string", default: "10" },
      param: { type: "string", multiple: true },
      profile: { type: "string" },
      readable: { type: "boolean", default: false },
      output: { type: "string" },
    },
  });
  const scenarios = values.scenario ?? [...ANALYTICS_SCENARIOS];
  for (const scenario of scenarios) {
    if (!(ANALYTICS_SCENARIOS as readonly string[]).includes(scenario)) {
      throw new Error(`Unknown scenario ${scenario}; one of ${ANALYTICS_SCENARIOS.join(", ")}`);
    }
  }
  const runs = Number(values.runs);
  const query = query_params(values.param ?? []);
  query.set("samples", values.samples);
  query.set("warmups", values.warmups);

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    development: values.readable ? { hmr: false, console: false } : false,
    routes: {
      "/": pageHtml,
      "/favicon.ico": new Response(null, { status: 204 }),
      "/formulas.wasm": new Response(
        Bun.file(resolve(REPOSITORY_ROOT, "packages/formulas/pkg/sheetwrite_wasm_bg.wasm")),
        { headers: { "content-type": "application/wasm" } },
      ),
    },
  });
  const results: ScenarioRun[] = [];
  try {
    for (let run = 1; run <= runs; run++) {
      for (const scenario of scenarios) {
        // A fresh browser per scenario and run: no compiled code or heap carries over.
        const browser = await chromium.launch({ headless: true });
        try {
          const result = await measure_run(browser, {
            baseUrl: `http://${server.hostname}:${server.port}/`,
            scenario,
            run,
            query,
            profileDir: values.profile,
          });
          results.push(result);
          process.stderr.write(
            `${scenario} run ${run}: median ${result.ms.median.toFixed(3)} ms, ${result.frames} frame(s) ${JSON.stringify(result.extra)}\n`,
          );
        } finally {
          await browser.close();
        }
      }
    }
  } finally {
    await server.stop(true);
  }

  const artifact = {
    schemaVersion: 1,
    protocol: "sheetwrite-analytics-v1",
    meta: { ...protocolCaptureMeta(), machine: machineLabel(), cpu: cpus()[0]?.model ?? "unknown" },
    query: Object.fromEntries(query),
    runs: results,
  };
  const json = `${JSON.stringify(artifact, null, 2)}\n`;
  if (values.output) {
    mkdirSync(dirname(values.output), { recursive: true });
    writeFileSync(values.output, json);
  }
  process.stdout.write(json);
}

if (import.meta.main) await main();
