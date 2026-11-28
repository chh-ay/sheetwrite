import { expect, it } from "bun:test";

import { createGrid, initSheetwrite } from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";

import { chartsAddon } from "../src/index.js";
import { chartWorkbook } from "./fixtures.js";

const MAX_TASKS = 50;

it("draws the charts of a grid created after install once the drawing code loads", async () => {
  await initSheetwrite({ addons: [chartsAddon()] });
  const restore_canvas = installCanvasTestStubs();
  const host = document.body.appendChild(document.createElement("div"));
  const grid = createGrid(host, {
    workbook: chartWorkbook(),
    config: { toolbar: false, find: false, contextMenu: false },
  });

  try {
    // The drawing code loads asynchronously, so check after each task.
    let chart: Element | null = null;
    for (let task = 0; task < MAX_TASKS && !chart; task++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      chart = host.querySelector(".sheetwrite-chart");
    }
    expect(chart?.getAttribute("role")).toBe("img");
    expect(host.querySelector(".sheetwrite-object-fallback")).toBeNull();
  } finally {
    grid.destroy();
    host.remove();
    restore_canvas();
  }
});

it("reports drawing code that fails to load, and loads it again for the next chart", async () => {
  // A module load is process-wide, so the probe runs in a fresh process. A Bun
  // plugin fails the drawing code's first load, as a dropped network request would.
  const source = (path: string) => JSON.stringify(new URL(path, import.meta.url).pathname);
  const script = `
    import { initSheetwrite, SheetwriteStore } from "@sheetwrite/core";
    let loads = 0;
    Bun.plugin({
      name: "flaky-chart-renderer",
      setup(build) {
        build.onLoad({ filter: /\\/charts\\/src\\/chart-renderer\\.ts$/ }, async ({ path }) => {
          loads += 1;
          if (loads === 1) throw new TypeError("chart chunk unavailable");
          return { contents: await Bun.file(path).text(), loader: "ts" };
        });
      },
    });
    const warnings = [];
    console.warn = (...args) => warnings.push(args);
    // The package entry also exports the drawing code, so the probe loads the add-on alone.
    const { chartsAddon } = await import(${source("../src/addon.ts")});
    const { chartWorkbook, SALES } = await import(${source("./fixtures.ts")});
    await initSheetwrite();
    let create_renderer;
    chartsAddon().setup({ charts: (registration) => (create_renderer = registration.renderer) });
    const renderer = create_renderer(new SheetwriteStore(chartWorkbook()));
    const settle = async () => {
      for (let task = 0; task < ${MAX_TASKS}; task++) await new Promise((resolve) => setTimeout(resolve, 0));
    };
    const first = document.createElement("div");
    renderer.mount(first, SALES, { width: 320, height: 200 });
    await settle();
    const reported = warnings.some((args) => args.some((arg) => arg?.message === "chart chunk unavailable"));
    const second = document.createElement("div");
    renderer.mount(second, SALES, { width: 320, height: 200 });
    await settle();
    const drawn = [first, second].map((host) => host.querySelector("svg") !== null);
    process.stdout.write(JSON.stringify({ reported, drawn }));
  `;
  const child = Bun.spawn(
    ["bun", "--preload", new URL("../../../test-setup.ts", import.meta.url).pathname, "-e", script],
    { cwd: new URL("../", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exit_code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  expect(exit_code, stderr).toBe(0);
  // The chart mounted during the failed load stays empty; the next one draws.
  expect(JSON.parse(stdout)).toEqual({ reported: true, drawn: [false, true] });
});
