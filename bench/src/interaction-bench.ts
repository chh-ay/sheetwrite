import { cpus } from "node:os";
import { resolve } from "node:path";
import { type Browser, chromium, type Page } from "@playwright/test";
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
import { protocolCaptureMeta } from "./protocol-meta.js";
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
function workerArtifact(command: readonly string[]): unknown {
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
  const lastLine = child.stdout.toString().trim().split("\n").at(-1);
  if (lastLine === undefined) {
    throw new Error(`interaction worker ${command.join(" ")} produced no artifact`);
  }
  return JSON.parse(lastLine) as unknown;
}

/**
 * One packed inverse-index lookup sample. The worker owns the lookup protocol:
 * one million rows, {@link LOOKUP_BATCHES} batches of {@link LOOKUP_BATCH_SIZE}
 * deterministic lookups, reported in nanoseconds per lookup.
 */
function lookupSample(): { medianNs: number; p95Ns: number; inverseIndexBytes: number } {
  const value = record(
    workerArtifact(["src/view-index-bench.ts", "--worker", "packed"]),
    "view-index worker artifact",
  );
  const inverseIndexBytes = finite(
    value.actualBackingBytes,
    "view-index worker artifact.actualBackingBytes",
    0,
  );
  return {
    medianNs: finite(value.lookupMedianNs, "view-index worker artifact.lookupMedianNs", 0),
    p95Ns: finite(value.lookupP95Ns, "view-index worker artifact.lookupP95Ns", 0),
    inverseIndexBytes,
  };
}

/**
 * One sparse dirty-state sample: the paged `dirty-100` probe in its own
 * process, applying {@link DISTANT_EDITS} distant edits without loading a clean
 * page, and reporting the clean plus sparse dirty allocation it retains.
 */
function dirtySample(): number {
  const value = record(
    workerArtifact([
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

function traceEventOf(value: unknown): TraceEvent | null {
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
  const data = traceEventData(value);
  return { name, ph, ts, dur, pid, tid, url: urlOf(data), profile: profileOf(data) };
}

function traceEventData(value: object): Record<string, unknown> | undefined {
  if (!("args" in value) || typeof value.args !== "object" || value.args === null) return undefined;
  if (!("data" in value.args)) return undefined;
  const data = value.args.data;
  return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : undefined;
}

function urlOf(data: Record<string, unknown> | undefined): string | undefined {
  if (data === undefined || !("url" in data)) return undefined;
  return typeof data.url === "string" ? data.url : undefined;
}

function profileOf(data: Record<string, unknown> | undefined): TraceProfile | undefined {
  if (data === undefined) return undefined;
  const startTime = typeof data.startTime === "number" ? data.startTime : undefined;
  const raw = data.cpuProfile;
  if (typeof raw !== "object" || raw === null) return undefined;
  return {
    startTime,
    nodes: profileNodesOf(raw),
    samples: numbersOf("samples" in raw ? raw.samples : undefined),
    timeDeltas: numbersOf(
      "timeDeltas" in raw && Array.isArray(raw.timeDeltas) ? raw.timeDeltas : data.timeDeltas,
    ),
  };
}

function profileNodesOf(profile: object): TraceProfile["nodes"] {
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

function numbersOf(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === "number");
}

/** One CPU profile sample per rendered frame, on the trace clock. */
function profileSamplesOf(events: readonly TraceEvent[]): ProfileSample[] {
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
    for (const [index, nodeId] of profile.samples.entries()) {
      at += profile.timeDeltas[index] ?? 0;
      samples.push({ ts: at, pid: event.pid, tid: event.tid, url: urls.get(nodeId) });
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
  const samples = profileSamplesOf(events);
  const longTasks = events.filter(
    (event) =>
      event.name === "RunTask" &&
      event.ph === "X" &&
      (event.dur ?? 0) >= LONG_TASK_MS * TRACE_MICROSECONDS_PER_MS,
  );
  let ownedMs = 0;
  let unattributedMs = 0;
  for (const task of longTasks) {
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
    const durationMs = duration / TRACE_MICROSECONDS_PER_MS;
    if (profiled > 0 && owned * 2 >= profiled) ownedMs = Math.max(ownedMs, durationMs);
    else unattributedMs = Math.max(unattributedMs, durationMs);
  }
  return { ownedMs, unattributedMs };
}

function traceEventsOf(events: TraceEvent[], value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    const event = traceEventOf(entry);
    if (event !== null) events.push(event);
  }
}

async function coldRouteSample(browser: Browser, route: string): Promise<ColdRouteSample> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    const events: TraceEvent[] = [];
    session.on("Tracing.dataCollected", ({ value }) => traceEventsOf(events, value));
    const tracingComplete = new Promise<void>((resolveComplete) =>
      session.once("Tracing.tracingComplete", () => resolveComplete()),
    );
    await session.send("Tracing.start", {
      categories: TRACE_CATEGORIES,
      transferMode: "ReportEvents",
    });
    const usableMs = await loadUsableRoute(page, route);
    await session.send("Tracing.end");
    await tracingComplete;
    return { ...coldTaskDurations(events), usableMs };
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
async function warmRoute(browser: Browser, route: string): Promise<void> {
  const context = await browser.newContext();
  try {
    await loadUsableRoute(await context.newPage(), route);
  } finally {
    await context.close();
  }
}

/** Navigate, prove the route renders, and wait until its first page is resident. */
async function loadUsableRoute(page: Page, route: string): Promise<number> {
  const response = await page.goto(route);
  if (response === null || !response.ok()) {
    throw new Error(
      `cold route answered ${response?.status() ?? "no response"}; the showcase route must render before it can be measured`,
    );
  }
  // The first rectangular page of the feed must be resident in the public
  // paged store: the same readiness signal the showcase browser test uses.
  await page.waitForFunction(
    () => (window.__sheetwriteScaleGrid?.store.getPagedStats?.("scale")?.loadedCells ?? 0) > 0,
    undefined,
    { timeout: USABLE_TIMEOUT_MS },
  );
  return page.evaluate(() => performance.now());
}

async function waitForRoute(route: string): Promise<void> {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  let refusal: string | undefined;
  while (Date.now() < deadline) {
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

/** The capture already at this path, when it is a capture of this schema. */
async function readPreviousCapture(path: string): Promise<InteractionPreviousCapture | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  try {
    return previousCaptureOf(await file.json());
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
function previousCaptureOf(value: unknown): InteractionPreviousCapture {
  const input = record(value, "previous capture");
  if (
    input.protocolVersion !== INTERACTION_PROTOCOL_VERSION ||
    input.matrixId !== INTERACTION_MATRIX_ID
  ) {
    throw new TypeError(`expected ${INTERACTION_MATRIX_ID}`);
  }
  const mode = input.mode;
  if (mode !== "full" && mode !== "smoke") throw new TypeError("previous capture mode is unknown");
  const inputSamples = record(input.samples, "previous capture.samples");
  const expected = INTERACTION_SAMPLE_COUNTS[mode];
  const samples = {} as Record<InteractionMetric, readonly number[]>;
  for (const key of INTERACTION_SAMPLE_KEYS) {
    const raw = inputSamples[key];
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
    values: summarizeSamples(samples),
  };
}

function summarizeSamples(samples: InteractionSamples): InteractionValues {
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

function methodNotes(): InteractionPerformanceArtifact["method"] {
  return {
    lookup: `Fresh packed view-index worker process per sample: ${INTERACTION_ROWS.toLocaleString("en-US")} rows of one column, ${LOOKUP_BATCHES} batches of ${LOOKUP_BATCH_SIZE.toLocaleString("en-US")} deterministic lookups (${INTERACTION_LOOKUPS_PER_RUN.toLocaleString("en-US")} lookups), nanoseconds per lookup measured over the batches. inverseIndexBytes is the inverse view-index backing store of that worker.`,
    dirty: `Fresh paged dirty-100 probe process per sample: ${INTERACTION_ROWS.toLocaleString("en-US")} rows, ${DISTANT_EDITS} distant edits, no clean page loaded. dirty100Bytes is allocated plus sparse dirty bytes retained.`,
    coldRoute: `Current Vite development route ${ROUTE_PATH}, rendered once before sampling so the development server's transform cache is warm, then loaded in a fresh browser context per sample with no shared cache, code cache, or service worker state. Server-side rendering answers the route before the first sample, and a sample measures the browser, not the first server transform; this is a development-server measurement, not a production bundle. usableMs is the page clock when the first rectangular page of feed cells became resident in the public paged store, an upper bound that includes the readiness poll.`,
    attribution: `Chrome DevTools protocol tracing (${TRACE_CATEGORIES}) from before navigation until the page is usable, in the renderer process: ${LONG_TASK_MS} ms or longer RunTask events are long tasks, and the V8 CPU profile on the same clock says what ran inside them. A task is owned by Sheetwrite when frames served from packages account for at least half of the CPU profiled inside it, and its complete duration is then recorded as the owned long task. Tasks below that share, tasks running only other code, and tasks the profile does not cover are reported as unattributed, so a partly owned task is never counted as owned work. A zero sample means no owned long task was observed.`,
    previous: `Same-schema comparison only. When the artifact already at this path is a capture of ${INTERACTION_MATRIX_ID}, previous records that capture's identity and its per-metric medians, so a reader can state the change without inventing a baseline. A first capture, or an unreadable predecessor, records null.`,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const mode = args.includes("--smoke") ? "smoke" : "full";
  const outputIndex = args.indexOf("--output");
  const outputArgument = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
  if (outputIndex >= 0 && (outputArgument === undefined || outputArgument.startsWith("--"))) {
    throw new Error("interaction capture needs a path after --output");
  }
  const outputPath = resolve(BENCH_ROOT, outputArgument ?? DEFAULT_OUTPUT);
  const route = `http://127.0.0.1:${DOCS_PORT}${ROUTE_PATH}`;
  const samples = INTERACTION_SAMPLE_COUNTS[mode];

  const previous = await readPreviousCapture(outputPath);
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
    { cwd: DOCS_ROOT, stdout: "ignore", stderr: "inherit" },
  );
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
    await waitForRoute(route);
    await warmRoute(browser, route);
    for (let sample = 0; sample < samples; sample++) {
      const lookup = lookupSample();
      collected.lookupMedianNs.push(lookup.medianNs);
      collected.lookupP95Ns.push(lookup.p95Ns);
      collected.inverseIndexBytes.push(lookup.inverseIndexBytes);
      collected.dirty100Bytes.push(dirtySample());
      const cold = await coldRouteSample(browser, route);
      collected.ownedColdLongTaskMs.push(cold.ownedMs);
      collected.unattributedColdLongTaskMs.push(cold.unattributedMs);
      collected.usableMs.push(cold.usableMs);
      process.stderr.write(
        `sample ${sample + 1}/${samples}: lookup ${lookup.medianNs.toFixed(1)} ns, inverse ${lookup.inverseIndexBytes} B, dirty100 ${collected.dirty100Bytes[sample]} B, owned cold long task ${cold.ownedMs} ms, usable ${cold.usableMs.toFixed(1)} ms\n`,
      );
    }
  } finally {
    await browser.close();
    server.kill();
    await server.exited;
  }

  const values = summarizeSamples(collected);
  const artifact: InteractionPerformanceArtifact = {
    protocolVersion: INTERACTION_PROTOCOL_VERSION,
    matrixId: INTERACTION_MATRIX_ID,
    mode,
    metadata: protocolCaptureMeta(),
    runner: {
      runtime: `Bun ${Bun.version} on ${process.platform} ${process.arch}`,
      browser: browser.version(),
      cpu: cpus()[0]?.model ?? "unknown",
    },
    method: methodNotes(),
    rows: INTERACTION_ROWS,
    lookupsPerRun: INTERACTION_LOOKUPS_PER_RUN,
    samples: collected,
    values,
    previous,
    ceilings: INTERACTION_CEILINGS,
  };
  validateInteractionArtifact(artifact);
  await Bun.write(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  process.stderr.write(
    [
      "",
      `interaction ${mode} capture written to ${outputPath} over ${samples} samples; every release ceiling passed`,
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
