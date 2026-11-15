// Engine selection is process-wide, and host functions need the full engine,
// so `full-engine.test.ts` runs this file in a process of its own; it gives every grid
// of that process a host function.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import * as formulas from "@sheetwrite/formulas";

import {
  analyzeFormula,
  type FormulaArgument,
  type FormulaFunction,
  type FormulaFunctionDefinition,
  type FormulaFunctionMetadata,
  functionsAddon,
  listFunctions,
} from "../src/functions.js";
import {
  createGrid,
  type Grid,
  initSheetwrite,
  isSheetwriteError,
  releaseEngineMemory,
  SheetwriteStore,
  type Store,
} from "../src/index.js";
import { storeEngine } from "../src/store/engine-registry.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { makeWorkbook } from "./fixtures.js";

const address = (row: number, col: number) => ({ sheet: "s1", row, col });

const TAX_RATE: FormulaFunctionMetadata = {
  name: "TaxRate",
  description: "Sales tax rate of a region.",
  arguments: [{ name: "region", types: ["text"] }],
  returnKind: "number",
  examples: ['=TAXRATE("EU")'],
};

const EU_RATE = 0.2;
const OTHER_RATE = 0.07;

function taxRate(region: FormulaArgument): number {
  return region === "EU" ? EU_RATE : OTHER_RATE;
}

function metadata(name: string): FormulaFunctionMetadata {
  return { name, description: "", arguments: [], returnKind: "any" };
}

function define(meta: FormulaFunctionMetadata, implementation: FormulaFunction) {
  return { metadata: meta, implementation } satisfies FormulaFunctionDefinition;
}

/** Every grid of the page gets this function from `initSheetwrite`. */
const PAGE_FUNCTION = define(metadata("PAGEID"), () => 7);

function setFormula(store: Store, row: number, col: number, src: string): void {
  store.applyTransaction({
    patches: [{ op: "set", addr: address(row, col), value: { kind: "formula", src } }],
  });
}

let restoreCanvas: () => void;
const grids: Grid[] = [];

/** A grid created with grid-specific `functions`. */
function gridWith(functions: readonly FormulaFunctionDefinition[], rows = 4): Grid {
  const host = document.createElement("div");
  document.body.append(host);
  const grid = createGrid(host, {
    workbook: makeWorkbook(rows),
    config: { toolbar: false, find: false, contextMenu: false },
    addons: { functions },
  });
  grids.push(grid);
  return grid;
}

beforeAll(async () => {
  await initSheetwrite({ engine: formulas, addons: [functionsAddon([PAGE_FUNCTION])] });
});

beforeEach(() => {
  restoreCanvas = installCanvasTestStubs();
});

afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
  document.body.replaceChildren();
  restoreCanvas();
});

describe("host formula functions", () => {
  it("apply init functions to every grid and grid-specific functions to their grid only", () => {
    const taxed = gridWith([define(TAX_RATE, taxRate)]).store;
    const plain = gridWith([]).store;

    for (const store of [taxed, plain]) {
      setFormula(store, 0, 0, "=PAGEID()");
      setFormula(store, 0, 1, '=TAXRATE("EU")');
    }

    expect(taxed.getCell(address(0, 0)).resolved).toBe(7);
    expect(plain.getCell(address(0, 0)).resolved).toBe(7);
    expect(taxed.getCell(address(0, 1)).resolved).toBe(EU_RATE);
    expect(plain.getCell(address(0, 1)).resolved).toBe("#NAME?");
  });

  it("let a grid-specific function replace an init function of the same name in that grid", () => {
    const replaced = gridWith([define(metadata("PAGEID"), () => 8)]).store;
    const other = gridWith([]).store;

    setFormula(replaced, 0, 0, "=PAGEID()");
    setFormula(other, 0, 0, "=PAGEID()");

    expect(replaced.getCell(address(0, 0)).resolved).toBe(8);
    expect(other.getCell(address(0, 0)).resolved).toBe(7);
  });

  it("calculate with their inputs, survive memory release, and leave only formula text in snapshots", async () => {
    const store = gridWith([define(TAX_RATE, taxRate)]).store;
    store.applyTransaction({
      patches: [{ op: "set", addr: address(0, 0), value: { kind: "literal", value: "EU" } }],
    });
    setFormula(store, 0, 1, "=taxrate(A1)*100");
    expect(store.getCell(address(0, 1)).resolved).toBe(EU_RATE * 100);

    await releaseEngineMemory();
    store.applyTransaction({
      patches: [{ op: "set", addr: address(0, 0), value: { kind: "literal", value: "US" } }],
    });
    expect(store.getCell(address(0, 1)).resolved).toBe(OTHER_RATE * 100);

    const snapshot = store.exportSnapshot?.();
    if (snapshot === undefined) throw new Error("the grid store has no snapshot");
    const restored = SheetwriteStore.fromSnapshot(snapshot);
    try {
      expect(restored.getFormula(address(0, 1))).toBe("=taxrate(A1)*100");
      expect(restored.getCell(address(0, 1)).resolved).toBe("#NAME?");
    } finally {
      restored.dispose();
    }
  });

  it("keep calculated values and send no change event across a memory release", async () => {
    let draws = 0;
    const store = gridWith([
      define({ ...metadata("DRAW"), volatile: true }, () => {
        draws += 1;
        return draws;
      }),
      define(TAX_RATE, taxRate),
    ]).store;
    setFormula(store, 0, 0, "=DRAW()");
    setFormula(store, 0, 1, "=NOW()");
    setFormula(store, 0, 2, '=TAXRATE("EU")');
    const before = Array.from(store.getVisibleWindow("s1", { start: 0, end: 1 }, [0, 1, 2]).values);
    const drawsBefore = draws;
    let changes = 0;
    const unsubscribe = store.on("change", () => {
      changes += 1;
    });

    await releaseEngineMemory();
    unsubscribe();

    const after = Array.from(store.getVisibleWindow("s1", { start: 0, end: 1 }, [0, 1, 2]).values);
    expect(after).toEqual(before);
    expect(draws).toBe(drawsBefore);
    expect(changes).toBe(0);

    // The replacement store still calls the volatile function on the next edit.
    setFormula(store, 1, 0, "=1");
    expect(store.getCell(address(0, 0)).resolved).toBe(drawsBefore + 1);
  });

  it("receive blocks as row arrays and turn failures into #VALUE!", () => {
    const received: (readonly FormulaArgument[])[] = [];
    const store = gridWith([
      define(metadata("ECHO"), (...values) => {
        received.push(values);
        return values.length;
      }),
      define(metadata("FAIL"), () => {
        throw new Error("lookup failed");
      }),
      // A JavaScript host can return a promise despite the type; it is not a scalar.
      define(metadata("LATER"), () => Promise.resolve(1) as unknown as number),
    ]).store;
    store.applyTransaction({
      patches: [
        { op: "set", addr: address(0, 0), value: { kind: "literal", value: 1 } },
        // Text after a non-BMP character, then a second text argument,
        // checks the UTF-16 text offsets.
        { op: "set", addr: address(1, 0), value: { kind: "literal", value: "tw😀o" } },
        { op: "set", addr: address(0, 1), value: { kind: "literal", value: true } },
      ],
    });

    setFormula(store, 2, 0, "=ECHO(A1:B2,A1,,1/0)");
    setFormula(store, 2, 1, '=ECHO(A1:B2,A1,,"x")');
    setFormula(store, 3, 0, "=FAIL()");
    setFormula(store, 3, 1, "=LATER()");

    expect(store.getCell(address(2, 0)).resolved).toBe("#DIV/0!");
    expect(store.getCell(address(2, 1)).resolved).toBe(4);
    expect(received.at(-1)).toEqual([
      [
        [1, true],
        ["tw😀o", null],
      ],
      1,
      null,
      "x",
    ]);
    expect(store.getCell(address(3, 0)).resolved).toBe("#VALUE!");
    expect(store.getCell(address(3, 1)).resolved).toBe("#VALUE!");
  });

  it("list built-in and host metadata in one list and refuse names that are not free", async () => {
    const store = gridWith([define(TAX_RATE, taxRate)], 2).store;

    const functions = await listFunctions(store);
    const names = functions.map((entry) => entry.name);
    expect(functions.find((entry) => entry.name === "SUM")).toMatchObject({
      returnKind: expect.any(String),
      volatile: false,
    });
    expect(functions.find((entry) => entry.name === "NOW")?.volatile).toBe(true);
    // The full engine lists its analysis functions too.
    expect(names).toContain("REGEXTEST");
    expect(functions.at(-1)).toMatchObject({
      name: "TAXRATE",
      description: TAX_RATE.description,
      arguments: [{ name: "region", types: ["text"], optional: false, repeating: false }],
      examples: TAX_RATE.examples,
      volatile: false,
    });

    // Formula help reads this list, so it completes and guides host functions.
    const analysis = analyzeFormula("=TAXR", 5, functions);
    expect(analysis.completion?.matches.map((entry) => entry.name)).toEqual(["TAXRATE"]);
    expect(analyzeFormula('=TAXRATE("EU", 1)', 0, functions).diagnostics).toEqual([
      expect.objectContaining({ message: "TAXRATE takes at most 1 argument." }),
    ]);
    // The syntax check is the full engine's parser, which calls a LAMBDA result at once.
    expect(analyzeFormula("=LAMBDA(x, x + 1)(2)", 0, functions).diagnostics).toEqual([]);

    for (const name of ["SUM", "A1", "R1C1", "BAD NAME", ""]) {
      const host = document.createElement("div");
      document.body.append(host);
      let failure: unknown;
      try {
        grids.push(
          createGrid(host, {
            workbook: makeWorkbook(2),
            addons: { functions: [define(metadata(name), () => null)] },
          }),
        );
      } catch (error) {
        failure = error;
      }
      expect(isSheetwriteError(failure) && failure.code).toBe("invalid-function");
      // The refused grid is destroyed, so it leaves nothing in its host.
      expect(host.childElementCount).toBe(0);
    }
    expect(await listFunctions(store)).toHaveLength(functions.length);
  });

  it("refuse store reads and changes during a call and leave the store usable", () => {
    const refusals: unknown[] = [];
    const recordRefusal = (use: () => void): number => {
      try {
        use();
      } catch (error) {
        refusals.push(error);
        throw error;
      }
      return 1;
    };
    // The functions only run after the grid exists, so they read it through this binding.
    let store: Store | undefined;
    const liveStore = (): Store => {
      if (store === undefined) throw new Error("the grid is not created yet");
      return store;
    };
    store = gridWith([
      define(metadata("PEEK"), () => recordRefusal(() => liveStore().getCell(address(0, 0)))),
      define(metadata("POKE"), () =>
        recordRefusal(() =>
          liveStore().applyTransaction({
            patches: [{ op: "set", addr: address(0, 0), value: { kind: "literal", value: 99 } }],
          }),
        ),
      ),
    ]).store;
    store.applyTransaction({
      patches: [{ op: "set", addr: address(0, 0), value: { kind: "literal", value: 5 } }],
    });

    setFormula(store, 1, 0, "=PEEK()");
    setFormula(store, 1, 1, "=POKE()");

    expect(store.getCell(address(1, 0)).resolved).toBe("#VALUE!");
    expect(store.getCell(address(1, 1)).resolved).toBe("#VALUE!");
    expect(refusals.map((error) => isSheetwriteError(error) && error.code)).toEqual([
      "blocked",
      "blocked",
    ]);

    // The refused change left the document and the engine in step.
    expect(store.getCell(address(0, 0)).resolved).toBe(5);
    const snapshot = store.exportSnapshot?.();
    if (snapshot === undefined) throw new Error("the grid store has no snapshot");
    const restored = SheetwriteStore.fromSnapshot(snapshot);
    try {
      expect(restored.getCell(address(0, 0)).resolved).toBe(5);
    } finally {
      restored.dispose();
    }
    setFormula(store, 2, 0, "=A1*2");
    expect(store.getCell(address(2, 0)).resolved).toBe(10);
  });

  it("stay on the live engine store when a memory release aborts", async () => {
    const store = gridWith([
      define(TAX_RATE, taxRate),
      define(metadata("TWICE"), (value) => Number(value) * 2),
    ]).store;
    const failing = new SheetwriteStore(makeWorkbook(1));
    const failingEngine = storeEngine(failing);
    if (failingEngine === null) throw new Error("store has no engine");
    const prepare = failingEngine.prepareMemoryRelease.bind(failingEngine);
    try {
      // The second store fails after the first one prepared its replacement,
      // so the release aborts and frees that replacement.
      failingEngine.prepareMemoryRelease = () => {
        throw new Error("forced preparation failure");
      };

      await expect(releaseEngineMemory()).rejects.toThrow("preparation failed");

      setFormula(store, 0, 0, '=TAXRATE("EU")');
      setFormula(store, 0, 1, "=TWICE(21)");
      expect(store.getCell(address(0, 0)).resolved).toBe(EU_RATE);
      expect(store.getCell(address(0, 1)).resolved).toBe(42);
    } finally {
      // The disposed engine stays listed until it is collected, so later
      // releases in the same process must see its real preparation again.
      failingEngine.prepareMemoryRelease = prepare;
      failing.dispose();
    }
  });
});
