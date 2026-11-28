import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type CDPSession, chromium } from "@playwright/test";

import { optionValue } from "./cli-options.js";
import lifetimePage from "./grid-lifetime-bench.html";
import { median } from "./stats.js";

// Grid lifetime memory gate in Chromium. Each run starts a fresh browser
// with `--expose-gc`. The page creates and destroys `--warmup` grids, the
// driver records the retained V8 and Blink heaps and the
// DOM counters after a full collection, the page creates and destroys
// `--cycles` more grids, and the driver records them again. The verdict is the
// median heap growth of `--runs` runs, and it must be at most 5%; no run may
// keep a DOM node, an event listener or an object that a destroyed grid owned
// (counted with weak references in the page).
//
// The warm-up matters: V8 compiles the grid code during the first few dozen
// grids, and its compiled code, feedback vectors and inline caches are heap
// objects (about 0.9 MiB here). They level off; grids do not own them.
//
//   bun bench/src/grid-lifetime-browser-bench.ts [--runs 3] [--warmup 50] [--cycles 100] [--output file.json]

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const MAX_GROWTH_PERCENT = 5;
const GC_TURNS = 5;
// Destroy defers a few timer and finalizer callbacks; the same settle time
// runs before both measurements.
const SETTLE_MS = 1_000;
const PAGE_TIMEOUT_MS = 300_000;

interface LifetimeOptions {
  readonly warmup: number;
  readonly cycles: number;
}

/** Retained memory of the page after a full collection. */
interface HeapObservation {
  /** V8 heap: JavaScript objects and V8's compiled code. */
  readonly jsBytes: number;
  /** Blink's garbage-collected heap: DOM nodes, selectors, listeners. */
  readonly embedderBytes: number;
  readonly nodes: number;
  readonly jsEventListeners: number;
}

interface LifetimeRun {
  readonly run: number;
  readonly baseline: HeapObservation;
  readonly after: HeapObservation;
  readonly growthPercent: number;
  /** Weak references to grid-owned objects that the page made in both phases. */
  readonly trackedObjects: number;
  /** Tracked objects still alive after the last full collection. */
  readonly liveObjects: number;
}

function number_argument(args: readonly string[], name: string, fallback: number): number {
  const text = optionValue(args, name);
  if (text === undefined) return fallback;
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${name} needs a positive integer.`);

  return value;
}

function retained_bytes(observation: HeapObservation): number {
  return observation.jsBytes + observation.embedderBytes;
}

async function observe_retained_heap(session: CDPSession): Promise<HeapObservation> {
  await Bun.sleep(SETTLE_MS);
  // V8's full collection also traces Blink's heap (unified heap), so detached
  // grid DOM that nothing holds is freed before the counters are read.
  for (let turn = 0; turn < GC_TURNS; turn++) {
    await session.send("HeapProfiler.collectGarbage");
  }
  const usage = await session.send("Runtime.getHeapUsage");
  const counters = await session.send("Memory.getDOMCounters");

  return {
    jsBytes: usage.usedSize,
    embedderBytes: usage.embedderHeapUsedSize,
    nodes: counters.nodes,
    jsEventListeners: counters.jsEventListeners,
  };
}

async function measure_run(
  base_url: string,
  run: number,
  options: LifetimeOptions,
): Promise<LifetimeRun> {
  const browser = await chromium.launch({ headless: true, args: ["--js-flags=--expose-gc"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1_200, height: 800 } });
    const page_errors: string[] = [];
    page.on("pageerror", (error) => page_errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") page_errors.push(message.text());
    });

    await page.goto(`${base_url}?warmup=${options.warmup}&cycles=${options.cycles}`, {
      waitUntil: "load",
    });
    const run_phase = async (done: string): Promise<void> => {
      // A real click (CDP input). `dispatchEvent` would run Playwright's
      // injected script in the page's own world and add its objects to the heap.
      await page.locator("#bench-run").click();
      await page
        .locator(`#bench-status[data-status="${done}"], #bench-status[data-status="error"]`)
        .waitFor({ timeout: PAGE_TIMEOUT_MS });
      const status = await page.locator("#bench-status").getAttribute("data-status");
      if (status !== done || page_errors.length > 0) {
        throw new Error(
          `Run ${run} failed in the page: ${page_errors.join("; ") || "error status"}`,
        );
      }
    };
    await page.locator('#bench-status[data-status="idle"]').waitFor({ timeout: PAGE_TIMEOUT_MS });
    const session = await page.context().newCDPSession(page);

    await run_phase("ready");
    const baseline = await observe_retained_heap(session);
    await run_phase("done");
    const after = await observe_retained_heap(session);
    await run_phase("counted");
    const status_element = page.locator("#bench-status");
    const tracked_objects = Number(await status_element.getAttribute("data-tracked-objects"));
    const live_objects = Number(await status_element.getAttribute("data-live-objects"));

    return {
      run,
      baseline,
      after,
      growthPercent:
        ((retained_bytes(after) - retained_bytes(baseline)) / retained_bytes(baseline)) * 100,
      trackedObjects: tracked_objects,
      liveObjects: live_objects,
    };
  } finally {
    await browser.close();
  }
}

function markdown_table(
  runs: readonly LifetimeRun[],
  options: LifetimeOptions,
  verdict: number,
): string {
  const mib = (bytes: number): string => (bytes / 1024 / 1024).toFixed(2);
  const pair = (before: string | number, after: string | number): string => `${before} → ${after}`;
  const rows = runs.map(
    ({
      run,
      baseline,
      after,
      growthPercent: growth_percent,
      trackedObjects: tracked_objects,
      liveObjects: live_objects,
    }) =>
      [
        run,
        pair(mib(baseline.jsBytes), mib(after.jsBytes)),
        pair(mib(baseline.embedderBytes), mib(after.embedderBytes)),
        pair(mib(retained_bytes(baseline)), mib(retained_bytes(after))),
        `${growth_percent.toFixed(2)}%`,
        pair(baseline.nodes, after.nodes),
        pair(baseline.jsEventListeners, after.jsEventListeners),
        `${live_objects} of ${tracked_objects}`,
      ].join(" | "),
  );

  return [
    `Retained heap after ${options.cycles} grids were created and destroyed, against the heap after ${options.warmup} warm-up grids (Chromium, fresh browser per run, full GC):`,
    "",
    "| Run | V8 heap MiB | Blink heap MiB | Total MiB | Growth | DOM nodes | JS listeners | Live grid objects |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row} |`),
    `| Median | | | | ${verdict.toFixed(2)}% | | | |`,
  ].join("\n");
}

async function run_benchmark(args: readonly string[]): Promise<void> {
  const runs = number_argument(args, "--runs", 3);
  const options: LifetimeOptions = {
    warmup: number_argument(args, "--warmup", 50),
    cycles: number_argument(args, "--cycles", 100),
  };
  const output_path = optionValue(args, "--output");

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    development: false,
    routes: {
      "/": lifetimePage,
      "/favicon.ico": new Response(null, { status: 204 }),
      "/sheetwrite_wasm_bg.wasm": new Response(
        Bun.file(resolve(REPOSITORY_ROOT, "packages/wasm/pkg/sheetwrite_wasm_bg.wasm")),
        { headers: { "content-type": "application/wasm" } },
      ),
    },
  });

  const results: LifetimeRun[] = [];
  try {
    for (let run = 1; run <= runs; run++) {
      process.stderr.write(`grid lifetime benchmark: run ${run}/${runs}\n`);
      results.push(await measure_run(`http://${server.hostname}:${server.port}/`, run, options));
    }
  } finally {
    await server.stop(true);
  }

  const verdict = median(results.map((entry) => entry.growthPercent));
  process.stdout.write(`${markdown_table(results, options, verdict)}\n`);
  if (output_path) {
    const artifact = {
      ...options,
      maxGrowthPercent: MAX_GROWTH_PERCENT,
      medianGrowthPercent: verdict,
      runs: results,
    };
    await writeFile(output_path, `${JSON.stringify(artifact, null, 2)}\n`);
  }
  if (verdict > MAX_GROWTH_PERCENT) {
    throw new Error(
      `Median retained heap growth ${verdict.toFixed(2)}% is above ${MAX_GROWTH_PERCENT}%.`,
    );
  }
  const retaining_run = results.find(
    ({ baseline, after, liveObjects: live_objects }) =>
      live_objects > 0 ||
      after.nodes > baseline.nodes ||
      after.jsEventListeners > baseline.jsEventListeners,
  );
  if (retaining_run) {
    throw new Error(
      `Run ${retaining_run.run} kept grid objects, DOM nodes or event listeners of destroyed grids.`,
    );
  }
}

if (import.meta.main) {
  await run_benchmark(process.argv.slice(2).filter((argument) => argument !== "--"));
}
