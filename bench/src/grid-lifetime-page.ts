import {
  type ColumnarData,
  createGrid,
  type Grid,
  initSheetwrite,
  type Workbook,
} from "@sheetwrite/core";

import "@sheetwrite/core/styles.css";

// The page of grid-lifetime-browser-bench.ts. The driver reads the status
// attribute and clicks the button, so the page needs no global hook.
const ROW_COUNT = 2_000;
const DEFAULT_CYCLES = 100;
const DEFAULT_WARMUP_CYCLES = 50;

const status = required_element("#bench-status", HTMLOutputElement);
const run_button = required_element("#bench-run", HTMLButtonElement);
const host = required_element("#grid-host", HTMLDivElement);
const params = new URLSearchParams(location.search);
const cycles = Number(params.get("cycles") ?? DEFAULT_CYCLES);
const warmup_cycles = Number(params.get("warmup") ?? DEFAULT_WARMUP_CYCLES);
// The status keeps one text node, so a status change adds no DOM node that the
// driver's node count could mistake for a grid's.
const status_text = document.createTextNode(status.textContent ?? "");
status.replaceChildren(status_text);

function required_element<T extends Element>(selector: string, type: new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`The benchmark page has no ${selector}.`);

  return element;
}

function set_status(next: string): void {
  status.dataset.status = next;
  status_text.data = next;
}

function workbook(): Workbook {
  return {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        rowCount: ROW_COUNT,
        columns: [
          { key: "name", header: "Name", width: 160, type: "text" },
          { key: "city", header: "City", width: 140, type: "text" },
          { key: "amount", header: "Amount", width: 120, type: "number", numberFormat: "#,##0.00" },
          { key: "share", header: "Share", width: 100, type: "number", numberFormat: "0.0%" },
        ],
      },
    ],
  };
}

function columnar_rows(): ColumnarData {
  return {
    rowCount: ROW_COUNT,
    columns: {
      name: Array.from({ length: ROW_COUNT }, (_, row) => `Customer ${row}`),
      city: Array.from({ length: ROW_COUNT }, (_, row) => `City ${row % 97}`),
      amount: Float64Array.from({ length: ROW_COUNT }, (_, row) => row * 10.5),
      share: Float64Array.from({ length: ROW_COUNT }, (_, row) => (row % 100) / 100),
    },
  };
}

function next_frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// Weak references to the objects that each grid owns: the grid, its store and
// action surface, and each top-level element that it added to the host or to
// the body. A detached element keeps its whole subtree, and the subtree keeps
// its root, so the top-level elements stand for all grid DOM. The driver asks
// for the live count after a full collection; destroyed grids must leave 0.
const warmup_refs: WeakRef<object>[] = [];
const measured_refs: WeakRef<object>[] = [];
let phase_refs = warmup_refs;

function track_grid(grid: Grid, body_before: ReadonlySet<Element>): void {
  phase_refs.push(new WeakRef(grid), new WeakRef(grid.store), new WeakRef(grid.actions));
  for (const element of host.children) phase_refs.push(new WeakRef(element));
  for (const element of document.body.children) {
    if (!body_before.has(element)) phase_refs.push(new WeakRef(element));
  }
}

function live_count(refs: readonly WeakRef<object>[]): number {
  let live = 0;
  for (const ref of refs) if (ref.deref() !== undefined) live += 1;

  return live;
}

/** Create one grid with the default chrome, let it paint, then destroy it. */
async function lifetime_cycle(): Promise<void> {
  const body_before = new Set(document.body.children);
  const grid = createGrid(host, { workbook: workbook(), data: columnar_rows() });
  await next_frame();
  await next_frame();
  track_grid(grid, body_before);
  grid.destroy();
}

async function start(): Promise<void> {
  if (!Number.isSafeInteger(cycles) || cycles < 1) throw new Error(`Invalid cycles: ${cycles}`);
  if (!Number.isSafeInteger(warmup_cycles) || warmup_cycles < 1) {
    throw new Error(`Invalid warm-up cycles: ${warmup_cycles}`);
  }

  await initSheetwrite();
  // The first click runs the warm-up and the second click runs the measured
  // loop. Both measurements thus follow the same kind of user click: Chromium
  // keeps a few DOM nodes alive for the paint after a click, and they must be
  // in the baseline too. A third click, after the driver's last collection,
  // writes the live counts of the weak references to the status element.
  //
  // The warm-up grids load the engine and the page-wide state that every grid
  // shares. They also let V8 compile the grid code: compiled code, feedback
  // vectors and inline caches are heap objects that V8 owns, and they grow for
  // the first few dozen grids before they level off. The baseline holds all of
  // them, so the measured loop shows only what the grids themselves keep.
  let phase: "warm-up" | "measure" | "count" = "warm-up";
  run_button.addEventListener("click", () => {
    run_button.disabled = true;
    if (phase === "warm-up") {
      phase = "measure";
      set_status("warming-up");
      void run_cycles(warmup_cycles, "ready");
    } else if (phase === "measure") {
      phase = "count";
      phase_refs = measured_refs;
      set_status("running");
      void run_cycles(cycles, "done");
    } else {
      status.dataset.trackedObjects = String(warmup_refs.length + measured_refs.length);
      status.dataset.liveObjects = String(live_count(warmup_refs) + live_count(measured_refs));
      set_status("counted");
    }
  });
  run_button.disabled = false;
  set_status("idle");
}

async function run_cycles(count: number, done: string): Promise<void> {
  try {
    for (let cycle = 0; cycle < count; cycle++) await lifetime_cycle();
    run_button.disabled = false;
    set_status(done);
  } catch (error) {
    console.error("A grid lifetime cycle failed.", error);
    set_status("error");
  }
}

start().catch((error: unknown) => {
  console.error("The grid lifetime benchmark page could not start.", error);
  set_status("error");
});
