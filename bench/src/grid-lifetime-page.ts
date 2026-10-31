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

const status = requiredElement("#bench-status", HTMLOutputElement);
const runButton = requiredElement("#bench-run", HTMLButtonElement);
const host = requiredElement("#grid-host", HTMLDivElement);
const params = new URLSearchParams(location.search);
const cycles = Number(params.get("cycles") ?? DEFAULT_CYCLES);
const warmupCycles = Number(params.get("warmup") ?? DEFAULT_WARMUP_CYCLES);
// The status keeps one text node, so a status change adds no DOM node that the
// driver's node count could mistake for a grid's.
const statusText = document.createTextNode(status.textContent ?? "");
status.replaceChildren(statusText);

function requiredElement<T extends Element>(selector: string, type: new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`The benchmark page has no ${selector}.`);

  return element;
}

function setStatus(next: string): void {
  status.dataset.status = next;
  statusText.data = next;
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

function columnarRows(): ColumnarData {
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

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// Weak references to the objects that each grid owns: the grid, its store and
// action surface, and each top-level element that it added to the host or to
// the body. A detached element keeps its whole subtree, and the subtree keeps
// its root, so the top-level elements stand for all grid DOM. The driver asks
// for the live count after a full collection; destroyed grids must leave 0.
const warmupRefs: WeakRef<object>[] = [];
const measuredRefs: WeakRef<object>[] = [];
let phaseRefs = warmupRefs;

function trackGrid(grid: Grid, bodyBefore: ReadonlySet<Element>): void {
  phaseRefs.push(new WeakRef(grid), new WeakRef(grid.store), new WeakRef(grid.actions));
  for (const element of host.children) phaseRefs.push(new WeakRef(element));
  for (const element of document.body.children) {
    if (!bodyBefore.has(element)) phaseRefs.push(new WeakRef(element));
  }
}

function liveCount(refs: readonly WeakRef<object>[]): number {
  let live = 0;
  for (const ref of refs) if (ref.deref() !== undefined) live += 1;

  return live;
}

/** Create one grid with the default chrome, let it paint, then destroy it. */
async function lifetimeCycle(): Promise<void> {
  const bodyBefore = new Set(document.body.children);
  const grid = createGrid(host, { workbook: workbook(), data: columnarRows() });
  await nextFrame();
  await nextFrame();
  trackGrid(grid, bodyBefore);
  grid.destroy();
}

async function start(): Promise<void> {
  if (!Number.isSafeInteger(cycles) || cycles < 1) throw new Error(`Invalid cycles: ${cycles}`);
  if (!Number.isSafeInteger(warmupCycles) || warmupCycles < 1) {
    throw new Error(`Invalid warm-up cycles: ${warmupCycles}`);
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
  runButton.addEventListener("click", () => {
    runButton.disabled = true;
    if (phase === "warm-up") {
      phase = "measure";
      setStatus("warming-up");
      void runCycles(warmupCycles, "ready");
    } else if (phase === "measure") {
      phase = "count";
      phaseRefs = measuredRefs;
      setStatus("running");
      void runCycles(cycles, "done");
    } else {
      status.dataset.trackedObjects = String(warmupRefs.length + measuredRefs.length);
      status.dataset.liveObjects = String(liveCount(warmupRefs) + liveCount(measuredRefs));
      setStatus("counted");
    }
  });
  runButton.disabled = false;
  setStatus("idle");
}

async function runCycles(count: number, done: string): Promise<void> {
  try {
    for (let cycle = 0; cycle < count; cycle++) await lifetimeCycle();
    runButton.disabled = false;
    setStatus(done);
  } catch (error) {
    console.error("A grid lifetime cycle failed.", error);
    setStatus("error");
  }
}

start().catch((error: unknown) => {
  console.error("The grid lifetime benchmark page could not start.", error);
  setStatus("error");
});
