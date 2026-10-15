import { createElement, createRef } from "react";
import { flushSync as flushReact } from "react-dom";
import { createRoot } from "react-dom/client";
import { createApp, defineComponent, h, nextTick, shallowRef } from "vue";

// Bun's public entry selects the server runtime even with the compiler preload.
import {
  flushSync as flushSvelte,
  mount,
  unmount,
} from "../../node_modules/svelte/src/index-client.js";
import {
  createGrid,
  type Grid,
  initSheetwrite,
  type Workbook,
} from "../../packages/core/src/index.js";
import { installCanvasTestStubs } from "../../packages/core/src/testing.js";
import { SheetwriteGrid as ReactGrid } from "../../packages/react/src/index.js";
import SvelteHarness from "../../packages/svelte/test/LifecycleHarness.svelte";
import { SheetwriteGrid as VueGrid } from "../../packages/vue/src/index.js";

// Run with the repository DOM and Svelte preloads. Timing excludes initialization
// and uses real framework commits, real Grids, and discarded warmup samples.
const ITERATIONS = Number(process.env.ADAPTER_BENCH_ITERATIONS ?? 150);
const SAMPLES = 7;
const WARMUP_ITERATIONS = 30;
const workbook: Workbook = {
  activeSheet: "bench",
  sheets: [
    {
      id: "bench",
      name: "Bench",
      rowCount: 20,
      columns: [{ key: "value", header: "Value", width: 100, type: "text" }],
    },
  ],
};
const replacement: Workbook = { ...workbook, sheets: [...workbook.sheets] };
const host = document.createElement("div");
document.body.append(host);
const restoreCanvas = installCanvasTestStubs();
await initSheetwrite();
const controlHost = document.createElement("div");
document.body.append(controlHost);
const controlGrid = createGrid(controlHost, { workbook });
const SELECTIONS_PER_CYCLE = 5_000;

interface SvelteBenchmarkHarness {
  update(props: { workbook: Workbook; fallbackLabel: string }): void;
}

async function reactCycle(reset: boolean): Promise<void> {
  const root = createRoot(host);
  const ref = createRef<Grid>();
  flushReact(() => root.render(createElement(ReactGrid, { workbook, ref })));
  if (reset)
    flushReact(() => root.render(createElement(ReactGrid, { workbook: replacement, ref })));
  flushReact(() => root.unmount());
}

async function vueCycle(reset: boolean): Promise<void> {
  const input = shallowRef(workbook);
  const app = createApp(
    defineComponent({ setup: () => () => h(VueGrid, { workbook: input.value }) }),
  );
  app.mount(host);
  await nextTick();
  if (reset) {
    input.value = replacement;
    await nextTick();
    await nextTick();
  }
  app.unmount();
}

async function svelteCycle(reset: boolean): Promise<void> {
  const component = mount(SvelteHarness, {
    target: host,
    props: { initialProps: { workbook, fallbackLabel: "" } },
  }) as SvelteBenchmarkHarness;
  flushSvelte();
  if (reset) {
    component.update({ workbook: replacement, fallbackLabel: "" });
    flushSvelte();
  }
  await unmount(component);
  flushSvelte();
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = sorted[Math.floor(sorted.length / 2)];
  if (middle === undefined) throw new Error("Benchmark requires samples");
  return middle;
}

const workloads: Record<string, () => void | Promise<void>> = {
  "core-mount-control": () => {
    const grid = createGrid(host, { workbook });
    grid.destroy();
  },
  "core-selection-control": () => {
    for (let selection = 0; selection < SELECTIONS_PER_CYCLE; selection += 1) {
      controlGrid.setSelection({
        kind: "cell",
        addr: { sheet: "bench", row: selection % 20, col: 0 },
      });
    }
  },
  "react-mount": () => reactCycle(false),
  "react-reset": () => reactCycle(true),
  "vue-mount": () => vueCycle(false),
  "vue-reset": () => vueCycle(true),
  "svelte-mount": () => svelteCycle(false),
  "svelte-reset": () => svelteCycle(true),
};
const results: Record<string, { medianUs: number; samplesUs: number[] }> = {};
try {
  for (const [name, cycle] of Object.entries(workloads)) {
    // Each workload gets a fresh DOM/runtime; queued rendering from earlier
    // adapter samples must not contaminate unrelated controls.
    if (!process.env.ADAPTER_BENCH_WORKLOAD) {
      const child = Bun.spawn(
        [
          process.execPath,
          "--preload",
          new URL("../../test-setup.ts", import.meta.url).pathname,
          "--preload",
          new URL("../../test-setup-svelte.ts", import.meta.url).pathname,
          import.meta.path,
        ],
        { env: { ...Bun.env, ADAPTER_BENCH_WORKLOAD: name }, stdout: "pipe", stderr: "inherit" },
      );
      const text = await new Response(child.stdout).text();
      if ((await child.exited) !== 0) throw new Error(`Adapter benchmark failed: ${name}`);
      results[name] = JSON.parse(text).results[name];
      continue;
    }
    if (process.env.ADAPTER_BENCH_WORKLOAD && process.env.ADAPTER_BENCH_WORKLOAD !== name) continue;
    for (let iteration = 0; iteration < WARMUP_ITERATIONS; iteration += 1) await cycle();
    const samplesUs: number[] = [];
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const start = performance.now();
      for (let iteration = 0; iteration < ITERATIONS; iteration += 1) await cycle();
      samplesUs.push(((performance.now() - start) * 1_000) / ITERATIONS);
    }
    results[name] = { medianUs: median(samplesUs), samplesUs };
  }
  process.stdout.write(
    `${JSON.stringify({ iterations: ITERATIONS, samples: SAMPLES, results })}\n`,
  );
} finally {
  controlGrid.destroy();
  controlHost.remove();
  restoreCanvas();
  host.remove();
}
