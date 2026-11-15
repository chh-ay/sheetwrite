// Grid lifetime probe, run by grid-lifetime.test.ts in a fresh bun process.
// A WeakRef is cleared only after a garbage collection that runs on a stack
// without the referent, and sibling suites in the shared `bun test` process
// keep their own objects alive, so the probe runs alone. It prints the names
// of the objects that a forced collection did not free, as JSON.
import { actionFeedbackFor } from "../src/action-feedback.js";
import { prepareMergeIndex } from "../src/canvas-paint.js";
import { createGrid, initSheetwrite } from "../src/index.js";
import { storeEngine } from "../src/store/engine-registry.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid, Workbook } from "../src/types.js";
import { collectUntilFreed } from "./collect-garbage.js";

const GRIDS = 5;

interface TrackedObject {
  readonly name: string;
  readonly ref: WeakRef<object>;
}

function workbook(): Workbook {
  return {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        rowCount: 200,
        merges: [{ r0: 1, c0: 0, r1: 2, c1: 1 }],
        columns: [
          { key: "name", header: "Name", width: 160, type: "text" },
          { key: "amount", header: "Amount", width: 120, type: "number", numberFormat: "0.00" },
        ],
      },
    ],
  };
}

function tracked(name: string, value: object | null | undefined): TrackedObject[] {
  if (value === null || value === undefined) throw new Error(`${name} was not created`);
  return [{ name, ref: new WeakRef(value) }];
}

/** Use the grid's features that fill owner-scoped caches, then destroy it. */
function useAndDestroy(index: number): TrackedObject[] {
  const host = document.createElement("div");
  document.body.append(host);
  const grid: Grid = createGrid(host, {
    workbook: workbook(),
    data: {
      rowCount: 200,
      columns: {
        name: Array.from({ length: 200 }, (_, row) => `Name ${index}-${row}`),
        amount: Array.from({ length: 200 }, (_, row) => row * 1.5),
      },
    },
  });
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 3, col: 0 } });
  grid.highlightCells([{ sheet: "s1", start: { row: 0, col: 0 }, end: { row: 4, col: 1 } }]);
  grid.applyTransaction({
    patches: [
      {
        op: "set",
        addr: { sheet: "s1", row: 0, col: 0 },
        value: { kind: "literal", value: "edited" },
      },
    ],
  });
  grid.search("Name");
  grid.trimMemory();
  grid.refresh();

  const merges = grid.store.getWorkbook().sheets[0]?.merges;
  const objects = [
    ...tracked("grid", grid),
    ...tracked("host", host),
    ...tracked("store", grid.store),
    ...tracked("store engine", storeEngine(grid.store)),
    ...tracked("action feedback channel", actionFeedbackFor(grid)),
    ...tracked("merge index", merges ? prepareMergeIndex(merges) : undefined),
    ...tracked("renderer", Reflect.get(grid, "renderer")),
    ...tracked("read windows", Reflect.get(grid, "readWindows")),
  ];
  grid.destroy();
  host.remove();
  return objects;
}

/** Keep the grid alive while proving the replaced document no longer has owners. */
async function useAndImport(): Promise<{ grid: Grid; objects: TrackedObject[] }> {
  const host = document.createElement("div");
  document.body.append(host);
  const grid = createGrid(host, {
    workbook: workbook(),
    data: {
      rowCount: 200,
      columns: { name: Array.from({ length: 200 }, (_, row) => `Old ${row}`) },
    },
  });
  grid.search("Old");
  grid.refresh();
  const oldWorkbook = grid.store.getWorkbook();
  const merges = oldWorkbook.sheets[0]?.merges;
  const objects = [
    ...tracked("replaced workbook", oldWorkbook),
    ...tracked("replaced engine", storeEngine(grid.store)),
    ...tracked("replaced merge index", merges ? prepareMergeIndex(merges) : undefined),
  ];
  await grid.importWorkbook({
    schemaVersion: 1,
    workbook: { activeSheet: "new" },
    sheets: [
      {
        id: "new",
        name: "New",
        order: 0,
        rowCount: 1,
        columns: [{ key: "n", header: "N", type: "number", width: 100 }],
        cells: [],
      },
    ],
  });
  return { grid, objects };
}

function retainedObjects(objects: readonly TrackedObject[]): TrackedObject[] {
  return objects.filter((object) => object.ref.deref() !== undefined);
}

const restoreStubs = installCanvasTestStubs();
await initSheetwrite();
let objects: TrackedObject[] = [];
for (let index = 0; index < GRIDS; index++) objects = objects.concat(useAndDestroy(index));
const imported = await useAndImport();
objects = objects.concat(imported.objects);
await collectUntilFreed(objects.map((object) => object.ref));
restoreStubs();

const retained = retainedObjects(objects);
imported.grid.destroy();
document.body.replaceChildren();
process.stdout.write(
  `${JSON.stringify({ tracked: objects.length, retained: retained.map((object) => object.name) })}\n`,
);
