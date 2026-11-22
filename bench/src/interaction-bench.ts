import { cpus } from "node:os";
import { resolve } from "node:path";

import { type Browser, chromium, type Page } from "@playwright/test";

import { optionValue } from "./cli-options.js";
import {
  INTERACTION_CEILING_KEYS,
  INTERACTION_CEILINGS,
  INTERACTION_LOOKUPS_PER_RUN,
  INTERACTION_MATRIX_ID,
  INTERACTION_METRIC_LABELS,
  INTERACTION_PROTOCOL_VERSION,
  INTERACTION_ROWS,
  INTERACTION_SAMPLE_COUNTS,
  INTERACTION_SAMPLE_KEYS,
  type InteractionMetric,
  type InteractionPerformanceArtifact,
  type InteractionPreviousCapture,
  type InteractionSamples,
  type InteractionValues,
  validateInteractionArtifact,
} from "./interaction-gate.js";
import { packageVersion, protocolCaptureMeta } from "./protocol-meta.js";
import { summarize } from "./stats.js";

/** Fields of the showcase page this capture drives; installed by the route. */
interface InteractionGridProbe {
  readonly store: {
    readonly getPagedStats?: (sheet: string) => { readonly loadedCells: number } | null | undefined;
  };
}

declare global {
  interface Window {
    __sheetwriteScaleGrid?: InteractionGridProbe;
  }
}

const BENCH_ROOT = resolve(import.meta.dir, "..");
const DOCS_ROOT = resolve(BENCH_ROOT, "../docs");
const DEFAULT_OUTPUT = "results/interaction-results.json";
const ROUTE_PATH = "/showcases/performance/";
const DOCS_PORT = 5197;
const SERVER_READY_TIMEOUT_MS = 120_000;
const SERVER_RETRY_MS = 250;
const USABLE_TIMEOUT_MS = 60_000;
/** RAIL long-task threshold: a task at or above this block a frame. */
const LONG_TASK_MS = 50;
const TRACE_MICROSECONDS_PER_MS = 1_000;
const TRACE_CATEGORIES =
  "devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-v8.cpu_profiler";
/** Lookup batches the packed view-index worker runs per sample. */
const LOOKUP_BATCHES = 128;
const LOOKUP_BATCH_SIZE = 4_096;
/** Distant edits the paged `dirty-100` probe applies per sample. */
const DISTANT_EDITS = 100;
/** Sheetwrite package frames decide ownership; the application shell is other work. */
const OWNED_PACKAGE_PATHS = /\/packages\//;

/** The V8 CPU profile payload a trace `ProfileChunk` event carries. */
export interface TraceProfile {
  /** Trace-clock start of this profile, set by the opening `Profile` event. */
  readonly startTime: number | undefined;
  readonly nodes: readonly { readonly id: number; readonly url: string | undefined }[];
  readonly samples: readonly number[];
  readonly timeDeltas: readonly number[];
}

/** One DevTools protocol trace event, as far as attribution reads it. */
export interface TraceEvent {
  readonly name: string;
  readonly ph: string;
  readonly ts: number;
  readonly dur: number | undefined;
  readonly pid: number;
  readonly tid: number;
  readonly url: string | undefined;
  readonly profile: TraceProfile | undefined;
}

interface ColdRouteSample {
  readonly ownedMs: number;
  readonly unattributedMs: number;
  readonly usableMs: number;
}

interface ProfileSample {
  readonly ts: number;
  readonly pid: number;
  readonly tid: number;
  readonly url: string | undefined;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function finite(value: unknown, path: string, minimum = Number.NEGATIVE_INFINITY): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new TypeError(`${path} must be a finite number >= ${minimum}`);
  }
  return value;
}

/** Run one isolated worker process and read the artifact it prints last. */
function worker_artifact(command: readonly string[]): unknown {
  const child = Bun.spawnSync([process.execPath, "run", ...command], {
    cwd: BENCH_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (child.exitCode !== 0) {
    throw new Error(
      `interaction worker ${command.join(" ")} exited ${child.exitCode}: ${child.stderr.toString().trim()}`,
    );
  }
  const last_line = child.stdout.toString().trim().split("\n").at(-1);
  if (last_line === undefined) {
    throw new Error(`interaction worker ${command.join(" ")} produced no artifact`);
  }
  return JSON.parse(last_line) as unknown;
}

/**
 * One packed inverse-index lookup sample. The worker owns the lookup protocol:
 * one million rows, {@link LOOKUP_BATCHES} batches of {@link LOOKUP_BATCH_SIZE}
 * deterministic lookups, reported in nanoseconds per lookup.
 */
function lookup_sample(): { medianNs: number; p95Ns: number; inverseIndexBytes: number } {
  const value = record(
    worker_artifact(["src/view-index-bench.ts", "--worker", "packed"]),
    "view-index worker artifact",
  );
  const inverse_index_bytes = finite(
    value.actualBackingBytes,
    "view-index worker artifact.actualBackingBytes",
    0,
  );
  return {
    medianNs: finite(value.lookupMedianNs, "view-index worker artifact.lookupMedianNs", 0),
    p95Ns: finite(value.lookupP95Ns, "view-index worker artifact.lookupP95Ns", 0),
    inverseIndexBytes: inverse_index_bytes,
  };
}

/**
 * One sparse dirty-state sample: the paged `dirty-100` probe in its own
 * process, applying {@link DISTANT_EDITS} distant edits without loading a clean
 * page, and reporting the clean plus sparse dirty allocation it retains.
 */
function dirty_sample(): number {
  const value = record(
    worker_artifact([
      "src/paged-bench.ts",
      "--probe",
      "dirty-100",
      "--rows",
      String(INTERACTION_ROWS),
    ]),
    "paged dirty-100 probe",
  );
  if (value.scenario !== "dirty-100") {
    throw new TypeError("paged dirty-100 probe reported another scenario");
  }
  if (value.dirtyCells !== DISTANT_EDITS) {
    throw new TypeError(`paged dirty-100 probe retained ${String(value.dirtyCells)} dirty cells`);
  }
  return finite(value.retainedBytes, "paged dirty-100 probe.retainedBytes", 0);
}

function trace_event_of(value: unknown): TraceEvent | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("name" in value && "ph" in value && "ts" in value && "pid" in value && "tid" in value)) {
    return null;
  }
  const { name, ph, ts, pid, tid } = value;
  if (
    typeof name !== "string" ||
    typeof ph !== "string" ||
    typeof ts !== "number" ||
    typeof pid !== "number" ||
    typeof tid !== "number"
  ) {
    return null;
  }
  const dur = "dur" in value && typeof value.dur === "number" ? value.dur : undefined;
  const data = trace_event_data(value);
  return { name, ph, ts, dur, pid, tid, url: url_of(data), profile: profile_of(data) };
}

function trace_event_data(value: object): Record<string, unknown> | undefined {
  if (!("args" in value) || typeof value.args !== "object" || value.args === null) return undefined;
  if (!("data" in value.args)) return undefined;
  const data = value.args.data;
  return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : undefined;
}

function url_of(data: Record<string, unknown> | undefined): string | undefined {
  if (data === undefined || !("url" in data)) return undefined;
  return typeof data.url === "string" ? data.url : undefined;
}

function profile_of(data: Record<string, unknown> | undefined): TraceProfile | undefined {
  if (data === undefined) return undefined;
  const start_time = typeof data.startTime === "number" ? data.startTime : undefined;
  const raw = data.cpuProfile;
  if (typeof raw !== "object" || raw === null) return undefined;
  return {
    startTime: start_time,
    nodes: profile_nodes_of(raw),
    samples: numbers_of("samples" in raw ? raw.samples : undefined),
    timeDeltas: numbers_of(
      "timeDeltas" in raw && Array.isArray(raw.timeDeltas) ? raw.timeDeltas : data.timeDeltas,
    ),
  };
}

function profile_nodes_of(profile: object): TraceProfile["nodes"] {
  if (!("nodes" in profile) || !Array.isArray(profile.nodes)) return [];
  const nodes: Array<{ id: number; url: string | undefined }> = [];
  for (const node of profile.nodes) {
    if (typeof node !== "object" || node === null || !("id" in node)) continue;
    if (typeof node.id !== "number") continue;
    const frame = "callFrame" in node && typeof node.callFrame === "object" ? node.callFrame : null;
    const url =
      frame !== null && "url" in frame && typeof frame.url === "string" ? frame.url : undefined;
    nodes.push({ id: node.id, url });
  }
  return nodes;
}

function numbers_of(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === "number");
}

/** One CPU profile sample per rendered frame, on the trace clock. */
function profile_samples_of(events: readonly TraceEvent[]): ProfileSample[] {
  const urls = new Map<number, string | undefined>();
  for (const event of events) {
    for (const node of event.profile?.nodes ?? []) urls.set(node.id, node.url);
  }
  const samples: ProfileSample[] = [];
  const clocks = new Map<string, number>();
  for (const event of events) {
    const profile = event.profile;
    if (profile === undefined || profile.samples.length === 0) continue;
    const thread = `${event.pid}:${event.tid}`;
    let at = profile.startTime ?? clocks.get(thread) ?? event.ts;
    for (const [index, node_id] of profile.samples.entries()) {
      at += profile.timeDeltas[index] ?? 0;
      samples.push({ ts: at, pid: event.pid, tid: event.tid, url: urls.get(node_id) });
    }
    clocks.set(thread, at);
  }
  return samples;
}

/**
 * Attribute the longest cold-route tasks to Sheetwrite or to everyone else.
 *
 * The version 1 capture shipped no producer, so this reconstruction is stated
 * in the artifact's `method.attribution`. A task is owned when it reaches the
 * long-task threshold and Sheetwrite package frames account for at least half
 * of the CPU profiled inside it; the whole task duration is then charged to
 * Sheetwrite. Tasks below that share, tasks that only ran other code, and
 * tasks with no profile coverage are reported as unattributed and are never
 * counted as owned work.
 */
export function coldTaskDurations(events: readonly TraceEvent[]): {
  ownedMs: number;
  unattributedMs: number;
} {
  const samples = profile_samples_of(events);
  const long_tasks = events.filter(
    (event) =>
      event.name === "RunTask" &&
      event.ph === "X" &&
      (event.dur ?? 0) >= LONG_TASK_MS * TRACE_MICROSECONDS_PER_MS,
  );
  let owned_ms = 0;
  let unattributed_ms = 0;
  for (const task of long_tasks) {
    const duration = task.dur ?? 0;
    const end = task.ts + duration;
    const inside = samples.filter(
      (sample) =>
        sample.pid === task.pid &&
        sample.tid === task.tid &&
        sample.ts >= task.ts &&
        sample.ts < end,
    );
    let profiled = 0;
    let owned = 0;
    for (const [index, sample] of inside.entries()) {
      const next = inside[index + 1];
      const step = Math.min(next?.ts ?? end, end) - sample.ts;
      if (step <= 0) continue;
      profiled += step;
      if (OWNED_PACKAGE_PATHS.test(sample.url ?? "")) owned += step;
    }
    const duration_ms = duration / TRACE_MICROSECONDS_PER_MS;
    if (profiled > 0 && owned * 2 >= profiled) owned_ms = Math.max(owned_ms, duration_ms);
    else unattributed_ms = Math.max(unattributed_ms, duration_ms);
  }
  return { ownedMs: owned_ms, unattributedMs: unattributed_ms };
}

function trace_events_of(events: TraceEvent[], value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    const event = trace_event_of(entry);
    if (event !== null) events.push(event);
  }
}

async function cold_route_sample(browser: Browser, route: string): Promise<ColdRouteSample> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    const events: TraceEvent[] = [];
    session.on("Tracing.dataCollected", ({ value }) => trace_events_of(events, value));
    const tracing_complete = new Promise<void>((resolve_complete) =>
      session.once("Tracing.tracingComplete", () => resolve_complete()),
    );
    await session.send("Tracing.start", {
      categories: TRACE_CATEGORIES,
      transferMode: "ReportEvents",
    });
    const usable_ms = await load_usable_route(page, route);
    await session.send("Tracing.end");
    await tracing_complete;
    return { ...coldTaskDurations(events), usableMs: usable_ms };
  } finally {
    await context.close();
  }
}

/**
 * One untraced load before the samples. The development server transforms the
 * route graph on first request; warming it keeps the samples on the browser's
 * own cold work, and every sample still starts from an empty context, cache,
 * and code cache.
 */
async function warm_route(browser: Browser, route: string): Promise<void> {
  const context = await browser.newContext();
  try {
    await load_usable_route(await context.newPage(), route);
  } finally {
    await context.close();
  }
}

/** Navigate, prove the route renders, and wait until its first page is resident. */
async function load_usable_route(page: Page, route: string): Promise<number> {
  // The route can answer 200 while its grid island fails to load, for example
  // on a tree without the committed bench/results evidence the showcase
  // imports. A page error ends the wait at once, naming the failed requests.
  const failed_requests: string[] = [];
  page.on("requestfailed", (request) => failed_requests.push(`failed ${request.url()}`));
  page.on("response", (response) => {
    if (!response.ok()) failed_requests.push(`${response.status()} ${response.url()}`);
  });
  const first_page_error = Promise.withResolvers<Error>();
  page.once("pageerror", first_page_error.resolve);
  const response = await page.goto(route);
  if (response === null || !response.ok()) {
    throw new Error(
      `cold route answered ${response?.status() ?? "no response"}; the showcase route must render before it can be measured`,
    );
  }
  // The first rectangular page of the feed must be resident in the public
  // paged store: the same readiness signal the showcase browser test uses.
  // The wait settles to a value so a page error can end it without leaving a
  // rejection behind when the caller closes the page.
  const ready = page
    .waitForFunction(
      () => (window.__sheetwriteScaleGrid?.store.getPagedStats?.("scale")?.loadedCells ?? 0) > 0,
      undefined,
      { timeout: USABLE_TIMEOUT_MS },
    )
    .then(
      () => ({ usable: true as const }),
      (error: unknown) => ({ usable: false as const, error }),
    );
  const outcome = await Promise.race([
    ready,
    first_page_error.promise.then((error) => ({ usable: false as const, error })),
  ]);
  if (!outcome.usable) {
    const message = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
    const requests = failed_requests.length === 0 ? "none" : failed_requests.join(", ");
    throw new Error(
      `the showcase grid did not become usable on ${route}: ${message}; failed requests: ${requests}`,
      { cause: outcome.error },
    );
  }
  return page.evaluate(() => performance.now());
}

/** Poll the route until the docs server this capture started serves it. */
async function wait_for_route(route: string, server: Bun.Subprocess): Promise<void> {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  let refusal: string | undefined;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `the docs dev server exited with code ${server.exitCode} before it served ${route}`,
      );
    }
    try {
      const response = await fetch(route);
      if (response.ok) return;
      throw new Error(
        `cold route answered ${response.status} before the first sample; the showcase route does not render on this tree`,
      );
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      // Connection refused while Vite starts; the deadline reports a real failure.
      refusal = error.message;
    }
    await Bun.sleep(SERVER_RETRY_MS);
  }
  throw new Error(`interaction docs server did not become ready on ${route}: ${refusal ?? ""}`);
}

/**
 * The docs server uses a fixed port with --strictPort, so a server another tree
 * left on that port would answer every request while this tree's server exits.
 */
async function assert_docs_port_free(route: string): Promise<void> {
  try {
    await fetch(route);
  } catch (error) {
    if (error instanceof TypeError) return;
    throw error;
  }
  throw new Error(
    `port ${DOCS_PORT} already answers ${route}; stop that server so the capture measures this tree`,
  );
}

/** The capture already at this path, when it is a capture of this schema. */
async function read_previous_capture(path: string): Promise<InteractionPreviousCapture | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  try {
    return previous_capture_of(await file.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `interaction capture: the artifact at ${path} is not a comparable capture (${message}); recording no previous values\n`,
    );
    return null;
  }
}

/**
 * Read the medians of a capture of this schema. The predecessor is not gated
 * again here: a capture that breached a ceiling is still the honest reference
 * for how the current numbers moved, and only its raw samples are read.
 */
function previous_capture_of(value: unknown): InteractionPreviousCapture {
  const input = record(value, "previous capture");
  if (
    input.protocolVersion !== INTERACTION_PROTOCOL_VERSION ||
    input.matrixId !== INTERACTION_MATRIX_ID
  ) {
    throw new TypeError(`expected ${INTERACTION_MATRIX_ID}`);
  }
  const mode = input.mode;
  if (mode !== "full" && mode !== "smoke") throw new TypeError("previous capture mode is unknown");
  const input_samples = record(input.samples, "previous capture.samples");
  const expected = INTERACTION_SAMPLE_COUNTS[mode];
  const samples = {} as Record<InteractionMetric, readonly number[]>;
  for (const key of INTERACTION_SAMPLE_KEYS) {
    const raw = input_samples[key];
    if (!Array.isArray(raw) || raw.length !== expected) {
      throw new TypeError(`previous capture.samples.${key} needs ${expected} raw samples`);
    }
    samples[key] = raw.map((sample, index) =>
      finite(sample, `previous capture.samples.${key}[${index}]`, 0),
    );
  }
  const commit = input.metadata;
  if (typeof commit !== "object" || commit === null || !("commit" in commit)) {
    throw new TypeError("previous capture.metadata.commit is missing");
  }
  if (typeof commit.commit !== "string" || commit.commit.length === 0) {
    throw new TypeError("previous capture.metadata.commit must be a non-empty string");
  }
  const timestamp = "timestamp" in commit ? commit.timestamp : undefined;
  if (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp))) {
    throw new TypeError("previous capture.metadata.timestamp must be an ISO timestamp");
  }
  return {
    matrixId: INTERACTION_MATRIX_ID,
    mode,
    commit: commit.commit,
    timestamp,
    values: summarize_samples(samples),
  };
}

function summarize_samples(samples: InteractionSamples): InteractionValues {
  return {
    lookupMedianNs: summarize(samples.lookupMedianNs),
    lookupP95Ns: summarize(samples.lookupP95Ns),
    inverseIndexBytes: summarize(samples.inverseIndexBytes),
    dirty100Bytes: summarize(samples.dirty100Bytes),
    ownedColdLongTaskMs: summarize(samples.ownedColdLongTaskMs),
    unattributedColdLongTaskMs: summarize(samples.unattributedColdLongTaskMs),
    usableMs: summarize(samples.usableMs),
  };
}

function method_notes(): InteractionPerformanceArtifact["method"] {
  return {
    lookup: `Fresh packed view-index worker process per sample: ${INTERACTION_ROWS.toLocaleString("en-US")} rows of one column, ${LOOKUP_BATCHES} batches of ${LOOKUP_BATCH_SIZE.toLocaleString("en-US")} deterministic lookups (${INTERACTION_LOOKUPS_PER_RUN.toLocaleString("en-US")} lookups), nanoseconds per lookup measured over the batches. inverseIndexBytes is the inverse view-index backing store of that worker.`,
    dirty: `Fresh paged dirty-100 probe process per sample: ${INTERACTION_ROWS.toLocaleString("en-US")} rows, ${DISTANT_EDITS} distant edits, no clean page loaded. dirty100Bytes is allocated plus sparse dirty bytes retained.`,
    coldRoute: `Current Vite development route ${ROUTE_PATH}, rendered once before sampling so the development server's transform cache is warm, then loaded in a fresh browser context per sample with no shared cache, code cache, or service worker state. Server-side rendering answers the route before the first sample, and a sample measures the browser, not the first server transform; this is a development-server measurement, not a production bundle. usableMs is the page clock when the first rectangular page of feed cells became resident in the public paged store, an upper bound that includes the readiness poll.`,
    attribution: `Chrome DevTools protocol tracing (${TRACE_CATEGORIES}) from before navigation until the page is usable, in the renderer process: ${LONG_TASK_MS} ms or longer RunTask events are long tasks, and the V8 CPU profile on the same clock says what ran inside them. A task is owned by Sheetwrite when frames served from packages account for at least half of the CPU profiled inside it, and its complete duration is then recorded as the owned long task. Tasks below that share, tasks running only other code, and tasks the profile does not cover are reported as unattributed, so a partly owned task is never counted as owned work. A zero sample means no owned long task was observed.`,
    previous: `Same-schema comparison only. When the artifact already at this path is a capture of ${INTERACTION_MATRIX_ID}, previous records that capture's identity and its per-metric medians, so a reader can state the change without inventing a baseline. A first capture, or an unreadable predecessor, records null.`,
  };
}

/** Docs server error lines kept for a failure message. */
const SERVER_ERROR_LINES = 20;
const SERVER_ERROR_LINE = /error|fail/i;

/**
 * Forward the docs server's stderr and keep its recent error lines. A route
 * whose imports fail (for example a missing bench/results file) still answers,
 * and only the server log names the file it could not load.
 */
function forward_server_errors(stream: ReadableStream<Uint8Array>): {
  readonly recentErrors: () => string;
  readonly drained: Promise<void>;
} {
  const error_lines: string[] = [];
  const decoder = new TextDecoder();
  const drained = (async () => {
    for await (const chunk of stream) {
      process.stderr.write(chunk);
      for (const line of decoder.decode(chunk, { stream: true }).split("\n")) {
        if (SERVER_ERROR_LINE.test(line)) error_lines.push(line.trim());
      }
      error_lines.splice(0, Math.max(0, error_lines.length - SERVER_ERROR_LINES));
    }
  })();
  return { recentErrors: () => error_lines.join("\n"), drained };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const mode = args.includes("--smoke") ? "smoke" : "full";
  const output_path = resolve(BENCH_ROOT, optionValue(args, "--output") ?? DEFAULT_OUTPUT);
  const route = `http://127.0.0.1:${DOCS_PORT}${ROUTE_PATH}`;
  const samples = INTERACTION_SAMPLE_COUNTS[mode];

  const previous = await read_previous_capture(output_path);
  await assert_docs_port_free(route);
  const server = Bun.spawn(
    [
      process.execPath,
      "run",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(DOCS_PORT),
      "--strictPort",
    ],
    // A process group of its own: `bun run dev` does not pass SIGTERM on to
    // Vite, which would otherwise keep the port and the stderr pipe open.
    { cwd: DOCS_ROOT, stdout: "ignore", stderr: "pipe", detached: true },
  );
  const server_errors = forward_server_errors(server.stderr);
  const browser = await chromium.launch();
  const collected: Record<InteractionMetric, number[]> = {
    lookupMedianNs: [],
    lookupP95Ns: [],
    inverseIndexBytes: [],
    dirty100Bytes: [],
    ownedColdLongTaskMs: [],
    unattributedColdLongTaskMs: [],
    usableMs: [],
  };
  try {
    await wait_for_route(route, server);
    await warm_route(browser, route);
    for (let sample = 0; sample < samples; sample++) {
      const lookup = lookup_sample();
      collected.lookupMedianNs.push(lookup.medianNs);
      collected.lookupP95Ns.push(lookup.p95Ns);
      collected.inverseIndexBytes.push(lookup.inverseIndexBytes);
      collected.dirty100Bytes.push(dirty_sample());
      const cold = await cold_route_sample(browser, route);
      collected.ownedColdLongTaskMs.push(cold.ownedMs);
      collected.unattributedColdLongTaskMs.push(cold.unattributedMs);
      collected.usableMs.push(cold.usableMs);
      process.stderr.write(
        `sample ${sample + 1}/${samples}: lookup ${lookup.medianNs.toFixed(1)} ns, inverse ${lookup.inverseIndexBytes} B, dirty100 ${collected.dirty100Bytes[sample]} B, owned cold long task ${cold.ownedMs} ms, usable ${cold.usableMs.toFixed(1)} ms\n`,
      );
    }
  } catch (error) {
    const recent_errors = server_errors.recentErrors();
    if (recent_errors === "") throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\nthe docs server reported:\n${recent_errors}`, { cause: error });
  } finally {
    await browser.close();
    if (server.exitCode === null) process.kill(-server.pid, "SIGTERM");
    await server.exited;
    await server_errors.drained;
  }

  const values = summarize_samples(collected);
  const artifact: InteractionPerformanceArtifact = {
    protocolVersion: INTERACTION_PROTOCOL_VERSION,
    matrixId: INTERACTION_MATRIX_ID,
    mode,
    metadata: {
      ...protocolCaptureMeta(),
      engineVersions: { sheetwrite: packageVersion("packages/core/package.json") },
    },
    runner: {
      runtime: `Bun ${Bun.version} on ${process.platform} ${process.arch}`,
      browser: `Chromium ${browser.version()}`,
      cpu: cpus()[0]?.model ?? "unknown",
    },
    method: method_notes(),
    rows: INTERACTION_ROWS,
    lookupsPerRun: INTERACTION_LOOKUPS_PER_RUN,
    samples: collected,
    values,
    previous,
    ceilings: INTERACTION_CEILINGS,
  };
  validateInteractionArtifact(artifact);
  await Bun.write(output_path, `${JSON.stringify(artifact, null, 2)}\n`);
  process.stderr.write(
    [
      "",
      `interaction ${mode} capture written to ${output_path} over ${samples} samples; every release ceiling passed`,
      ...INTERACTION_SAMPLE_KEYS.map((key) => {
        const ceiling = INTERACTION_CEILING_KEYS.find((candidate) => candidate === key);
        const limit =
          ceiling === undefined ? "" : ` (release ceiling ${INTERACTION_CEILINGS[ceiling]})`;
        return `  ${INTERACTION_METRIC_LABELS[key]}: median ${values[key].median}${limit}`;
      }),
      previous === null
        ? "  previous capture: none comparable at this path"
        : `  previous capture: ${previous.matrixId} ${previous.mode} at ${previous.commit.slice(0, 12)} (${previous.timestamp})`,
      "",
    ].join("\n"),
  );
  process.stdout.write(`${JSON.stringify(artifact)}\n`);
}

if (import.meta.main) await main();
