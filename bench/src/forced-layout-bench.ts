import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type Browser, chromium } from "@playwright/test";

import { optionValue } from "./cli-options.js";
import {
  FORCED_LAYOUT_ACTIONS,
  FORCED_LAYOUT_ROWS,
  type ForcedLayoutAction,
  stepMarkName,
} from "./forced-layout-actions.js";
import forcedLayoutPage from "./forced-layout-bench.html";
import { median } from "./stats.js";

// Forced style and layout gate in Chromium. Each action runs in a fresh page.
// Seven actions are user input followed by the frames that paint it: a scroll
// step that moves the painted window, an arrow key, opening the cell editor,
// an edit commit (open, type, Enter), a scroll step while the editor is open,
// and two that type one character per step, into the open cell editor or into
// a formula bar beside the grid. Three more repeat the render benchmark's timed
// loop, where `grid.refresh()` paints and the steps run back to back with no
// frame between them: scroll, arrow key and edit commit. Two User Timing marks
// bracket each step. A style recalculation (`UpdateLayoutTree`) or a `Layout`
// that runs inside script is forced: script asked for a style or a geometry
// while the DOM had unapplied writes. The browser's own frame update runs
// outside script and is reported, not gated.
//
//   bun bench/src/forced-layout-bench.ts [--runs 3] [--warmups 10] [--steps 40] [--output file.json]

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PAGE_TIMEOUT_MS = 300_000;
const TRACE_MICROSECONDS_PER_MS = 1_000;
const TRACE_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "blink.user_timing",
].join(",");
/** Trace events that run script; style or layout nested inside one is forced. */
const SCRIPT_EVENTS: Readonly<Record<string, true>> = {
  EventDispatch: true,
  EvaluateScript: true,
  FireAnimationFrame: true,
  FunctionCall: true,
  RunMicrotasks: true,
  TimerFire: true,
  "v8.callFunction": true,
};
const STYLE_EVENT = "UpdateLayoutTree";
const LAYOUT_EVENT = "Layout";

/**
 * Most elements a forced style recalculation may restyle plus layout objects a
 * forced layout may lay out, in one step of each action. Counting nodes, not
 * time, keeps the gate independent of the machine. The screen-reader mirror of
 * the painted window is about 330 nodes; laying it out inside an input step
 * fails that row. The editor rows hold what opening, measuring, focusing and
 * closing the textarea itself needs. The typing rows type one character per
 * step, into the open cell editor or into a formula bar beside the grid; they
 * hold what sizing the typed field needs. The `-refresh` rows keep the mirror: a
 * synchronous `grid.refresh()` writes it in the same task, as assistive
 * technology expects, so the next step's scroll read lays it out.
 */
const FORCED_LAYOUT_CEILINGS: Readonly<Record<ForcedLayoutAction, number>> = {
  scroll: 0,
  "arrow-down": 0,
  "edit-open": 10,
  "edit-commit": 25,
  "editor-scroll": 0,
  "edit-type": 11,
  "bar-type": 1,
  "scroll-refresh": 341,
  "arrow-down-refresh": 341,
  "edit-commit-refresh": 32,
};

interface TraceEvent {
  readonly name: string;
  readonly ph: string;
  readonly ts: number;
  readonly dur: number;
  readonly pid: number;
  readonly tid: number;
  /** Elements a style recalculation restyled, or objects a layout laid out. */
  readonly nodes: number;
}

/** What one measured step ran on the page's main thread. */
interface StepObservation {
  readonly forcedStyles: number;
  readonly forcedLayouts: number;
  /** Elements and layout objects that the forced recalculations touched. */
  readonly forcedNodes: number;
  readonly forcedMs: number;
  /** Style and layout of the browser's own frame update. */
  readonly frameMs: number;
  /** Top-level script, forced work included. */
  readonly scriptMs: number;
}

interface ActionSummary {
  readonly action: ForcedLayoutAction;
  readonly steps: number;
  readonly medianForcedStyles: number;
  readonly medianForcedLayouts: number;
  readonly medianForcedNodes: number;
  readonly maxForcedNodes: number;
  readonly medianForcedMs: number;
  readonly medianFrameMs: number;
  readonly medianScriptMs: number;
  readonly ceiling: number;
}

interface RunOptions {
  readonly warmups: number;
  readonly steps: number;
}

function number_argument(args: readonly string[], name: string, fallback: number): number {
  const text = optionValue(args, name);
  if (text === undefined) return fallback;
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${name} needs a positive integer.`);

  return value;
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? Reflect.get(value, key)
    : undefined;
}

/** `Layout` reports its dirty objects; `UpdateLayoutTree` its restyled elements. */
function touched_nodes(name: string, args: unknown): number {
  const count =
    name === LAYOUT_EVENT
      ? field(field(args, "beginData"), "dirtyObjects")
      : name === STYLE_EVENT
        ? field(args, "elementCount")
        : 0;
  return typeof count === "number" ? count : 0;
}

function trace_event_of(value: unknown): TraceEvent | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("name" in value && "ph" in value && "ts" in value && "pid" in value && "tid" in value)) {
    return null;
  }
  const { name, ph, ts, pid, tid } = value;
  const dur = "dur" in value ? value.dur : 0;
  if (
    typeof name !== "string" ||
    typeof ph !== "string" ||
    typeof ts !== "number" ||
    typeof pid !== "number" ||
    typeof tid !== "number" ||
    typeof dur !== "number"
  ) {
    return null;
  }
  return { name, ph, ts, dur, pid, tid, nodes: touched_nodes(name, field(value, "args")) };
}

function contains(outer: TraceEvent, inner: TraceEvent): boolean {
  return outer !== inner && outer.ts <= inner.ts && inner.ts + inner.dur <= outer.ts + outer.dur;
}

function mark_event(events: readonly TraceEvent[], name: string): TraceEvent {
  const mark = events.find((event) => event.name === name);
  if (!mark) throw new Error(`The trace has no ${name} mark.`);

  return mark;
}

/**
 * Style and layout inside the step's marks. Script that brackets a synchronous
 * step starts before its start mark, so script is matched by overlap.
 */
function observe_step(events: readonly TraceEvent[], step: number): StepObservation {
  const start = mark_event(events, stepMarkName(step, "start")).ts;
  const end_mark = mark_event(events, stepMarkName(step, "end"));
  const end = end_mark.ts;
  const thread = events.filter(
    (event) => event.pid === end_mark.pid && event.tid === end_mark.tid && event.ph === "X",
  );
  const scripts = thread.filter(
    (event) => SCRIPT_EVENTS[event.name] === true && event.ts < end && event.ts + event.dur > start,
  );
  const top_level_scripts = scripts.filter(
    (script) => !scripts.some((outer) => contains(outer, script)),
  );
  let forced_styles = 0;
  let forced_layouts = 0;
  let forced_nodes = 0;
  let forced_us = 0;
  let frame_us = 0;
  for (const event of thread) {
    if (event.name !== STYLE_EVENT && event.name !== LAYOUT_EVENT) continue;
    if (event.ts < start || event.ts + event.dur > end) continue;
    if (top_level_scripts.some((script) => contains(script, event))) {
      if (event.name === STYLE_EVENT) forced_styles++;
      else forced_layouts++;
      forced_nodes += event.nodes;
      forced_us += event.dur;
    } else {
      frame_us += event.dur;
    }
  }
  const script_us = top_level_scripts.reduce(
    (total, script) => total + Math.min(end, script.ts + script.dur) - Math.max(start, script.ts),
    0,
  );
  return {
    forcedStyles: forced_styles,
    forcedLayouts: forced_layouts,
    forcedNodes: forced_nodes,
    forcedMs: forced_us / TRACE_MICROSECONDS_PER_MS,
    frameMs: frame_us / TRACE_MICROSECONDS_PER_MS,
    scriptMs: script_us / TRACE_MICROSECONDS_PER_MS,
  };
}

async function measure_action(
  browser: Browser,
  base_url: string,
  action: ForcedLayoutAction,
  options: RunOptions,
): Promise<StepObservation[]> {
  const context = await browser.newContext({ viewport: { width: 1_120, height: 660 } });
  try {
    const page = await context.newPage();
    const page_errors: string[] = [];
    page.on("pageerror", (error) => page_errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") page_errors.push(message.text());
    });
    const url = `${base_url}?action=${action}&warmups=${options.warmups}&steps=${options.steps}`;
    await page.goto(url, { waitUntil: "load" });
    await page
      .locator('#bench-status[data-status="idle"], #bench-status[data-status="error"]')
      .waitFor({ timeout: PAGE_TIMEOUT_MS });

    const session = await context.newCDPSession(page);
    const events: TraceEvent[] = [];
    session.on("Tracing.dataCollected", ({ value }) => {
      for (const entry of value) {
        const event = trace_event_of(entry);
        if (event !== null) events.push(event);
      }
    });
    const tracing_complete = new Promise<void>((resolve_complete) =>
      session.once("Tracing.tracingComplete", () => resolve_complete()),
    );
    await session.send("Tracing.start", {
      categories: TRACE_CATEGORIES,
      transferMode: "ReportEvents",
    });
    await page.locator("#bench-run").click();
    await page
      .locator('#bench-status[data-status="done"], #bench-status[data-status="error"]')
      .waitFor({ timeout: PAGE_TIMEOUT_MS });
    await session.send("Tracing.end");
    await tracing_complete;
    const final_status = await page.locator("#bench-status").getAttribute("data-status");
    if (final_status !== "done" || page_errors.length > 0) {
      throw new Error(`${action} failed in the page: ${page_errors.join("; ") || "error status"}`);
    }

    return Array.from({ length: options.steps }, (_, step) => observe_step(events, step));
  } finally {
    await context.close();
  }
}

function summarize(
  action: ForcedLayoutAction,
  observations: readonly StepObservation[],
): ActionSummary {
  const of = (pick: (observation: StepObservation) => number): number[] => observations.map(pick);
  return {
    action,
    steps: observations.length,
    medianForcedStyles: median(of((observation) => observation.forcedStyles)),
    medianForcedLayouts: median(of((observation) => observation.forcedLayouts)),
    medianForcedNodes: median(of((observation) => observation.forcedNodes)),
    maxForcedNodes: Math.max(...of((observation) => observation.forcedNodes)),
    medianForcedMs: median(of((observation) => observation.forcedMs)),
    medianFrameMs: median(of((observation) => observation.frameMs)),
    medianScriptMs: median(of((observation) => observation.scriptMs)),
    ceiling: FORCED_LAYOUT_CEILINGS[action],
  };
}

function markdown_table(summaries: readonly ActionSummary[], browser_version: string): string {
  const ms = (value: number): string => value.toFixed(3);
  const rows = summaries.map((summary) =>
    [
      summary.action,
      summary.steps,
      summary.medianForcedStyles,
      summary.medianForcedLayouts,
      summary.medianForcedNodes,
      summary.maxForcedNodes,
      Number.isFinite(summary.ceiling) ? summary.ceiling : "none",
      ms(summary.medianForcedMs),
      ms(summary.medianFrameMs),
      ms(summary.medianScriptMs),
    ].join(" | "),
  );

  return [
    `Forced style and layout per step, ${FORCED_LAYOUT_ROWS.toLocaleString("en-US")} rows, Chromium ${browser_version}. Medians over all steps; nodes are the elements restyled plus the layout objects laid out by forced recalculations, and "most" is the largest step:`,
    "",
    "| Action | Steps | Forced styles | Forced layouts | Forced nodes | Most forced nodes | Ceiling | Forced ms | Frame style+layout ms | Script ms |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row} |`),
  ].join("\n");
}

async function run_benchmark(args: readonly string[]): Promise<void> {
  const runs = number_argument(args, "--runs", 3);
  const options: RunOptions = {
    warmups: number_argument(args, "--warmups", 10),
    steps: number_argument(args, "--steps", 40),
  };
  const output_path = optionValue(args, "--output");

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    development: false,
    routes: {
      "/": forcedLayoutPage,
      "/favicon.ico": new Response(null, { status: 204 }),
      "/sheetwrite_wasm_bg.wasm": new Response(
        Bun.file(resolve(REPOSITORY_ROOT, "packages/wasm/pkg/sheetwrite_wasm_bg.wasm")),
        { headers: { "content-type": "application/wasm" } },
      ),
    },
  });
  const browser = await chromium.launch({ headless: true });
  const browser_version = browser.version();
  const observations: Record<ForcedLayoutAction, StepObservation[]> = {
    scroll: [],
    "arrow-down": [],
    "edit-open": [],
    "edit-commit": [],
    "editor-scroll": [],
    "edit-type": [],
    "bar-type": [],
    "scroll-refresh": [],
    "arrow-down-refresh": [],
    "edit-commit-refresh": [],
  };
  try {
    const base_url = `http://${server.hostname}:${server.port}/`;
    for (let run = 1; run <= runs; run++) {
      for (const action of FORCED_LAYOUT_ACTIONS) {
        process.stderr.write(`forced layout benchmark: run ${run}/${runs}, ${action}\n`);
        observations[action].push(...(await measure_action(browser, base_url, action, options)));
      }
    }
  } finally {
    await browser.close();
    await server.stop(true);
  }

  const summaries = FORCED_LAYOUT_ACTIONS.map((action) => summarize(action, observations[action]));
  process.stdout.write(`${markdown_table(summaries, browser_version)}\n`);
  if (output_path) {
    const artifact = {
      rows: FORCED_LAYOUT_ROWS,
      runs,
      ...options,
      browser: browser_version,
      summaries,
      steps: observations,
    };
    await writeFile(output_path, `${JSON.stringify(artifact, null, 2)}\n`);
  }
  const over = summaries.filter((summary) => summary.maxForcedNodes > summary.ceiling);
  if (over.length > 0) {
    throw new Error(
      `Forced style or layout above the ceiling: ${over
        .map(
          (summary) =>
            `${summary.action} touched ${summary.maxForcedNodes} nodes (ceiling ${summary.ceiling})`,
        )
        .join(", ")}.`,
    );
  }
}

if (import.meta.main) {
  await run_benchmark(process.argv.slice(2).filter((argument) => argument !== "--"));
}
