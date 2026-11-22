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
  type ExternalLink,
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

function tax_rate(region: FormulaArgument): number {
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

function set_formula(store: Store, row: number, col: number, src: string): void {
  store.applyTransaction({
    patches: [{ op: "set", addr: address(row, col), value: { kind: "formula", src } }],
  });
}

let restore_canvas: () => void;
const grids: Grid[] = [];

/** A grid created with grid-specific `functions`. */
function grid_with(functions: readonly FormulaFunctionDefinition[], rows = 4): Grid {
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
  restore_canvas = installCanvasTestStubs();
});

afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
  document.body.replaceChildren();
  restore_canvas();
});

describe("host formula functions", () => {
  it("apply init functions to every grid, and grid-specific functions, which win by name, to their grid only", () => {
    const taxed = grid_with([define(TAX_RATE, tax_rate)]).store;
    const plain = grid_with([]).store;
    const replaced = grid_with([define(metadata("PAGEID"), () => 8)]).store;

    for (const store of [taxed, plain, replaced]) {
      set_formula(store, 0, 0, "=PAGEID()");
      set_formula(store, 0, 1, '=TAXRATE("EU")');
    }

    expect([taxed, plain, replaced].map((store) => store.getCell(address(0, 0)).resolved)).toEqual([
      7, 7, 8,
    ]);
    expect(taxed.getCell(address(0, 1)).resolved).toBe(EU_RATE);
    expect(plain.getCell(address(0, 1)).resolved).toBe("#NAME?");
  });

  it("recalculates only the formulas that read a link value a refresh changes", () => {
    let calls = 0;
    const seen = define(metadata("SEEN"), (value) => {
      calls += 1;
      return typeof value === "number" ? value : 0;
    });
    const rows = 20;
    const grid = grid_with([seen], rows);
    const links = (first: number, extra: number[] = []): ExternalLink[] => [
      {
        book: "Budget.xlsx",
        target: "Budget.xlsx",
        sheets: [
          {
            name: "Annual",
            cells: [...Array.from({ length: rows }, (_, row) => row), ...extra].map((row) => ({
              row,
              col: 0,
              value: row === 0 ? first : row,
            })),
          },
        ],
      },
    ];
    grid.applyTransaction({ patches: [{ op: "setExternalLinks", links: links(100) }] });
    for (let row = 0; row < rows; row += 1) {
      set_formula(grid.store, row, 0, `=SEEN([Budget.xlsx]Annual!A${row + 1})`);
    }

    calls = 0;
    grid.applyTransaction({ patches: [{ op: "setExternalLinks", links: links(200) }] });
    expect(calls).toBe(1);
    expect(grid.store.getCell(address(0, 0)).resolved).toBe(200);

    // A wider extent takes the full path: every reader recalculates.
    calls = 0;
    grid.applyTransaction({ patches: [{ op: "setExternalLinks", links: links(300, [rows]) }] });
    expect(calls).toBeGreaterThanOrEqual(rows);
    expect(grid.store.getCell(address(0, 0)).resolved).toBe(300);
  });

  it("calculate with their inputs, survive memory release, and leave only formula text in snapshots", async () => {
    const store = grid_with([define(TAX_RATE, tax_rate)]).store;
    store.applyTransaction({
      patches: [{ op: "set", addr: address(0, 0), value: { kind: "literal", value: "EU" } }],
    });
    set_formula(store, 0, 1, "=taxrate(A1)*100");
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
    const store = grid_with([
      define({ ...metadata("DRAW"), volatile: true }, () => {
        draws += 1;
        return draws;
      }),
      define(TAX_RATE, tax_rate),
    ]).store;
    set_formula(store, 0, 0, "=DRAW()");
    set_formula(store, 0, 1, "=NOW()");
    set_formula(store, 0, 2, '=TAXRATE("EU")');
    const before = Array.from(store.getVisibleWindow("s1", { start: 0, end: 1 }, [0, 1, 2]).values);
    const draws_before = draws;
    let changes = 0;
    const unsubscribe = store.on("change", () => {
      changes += 1;
    });

    await releaseEngineMemory();
    unsubscribe();

    const after = Array.from(store.getVisibleWindow("s1", { start: 0, end: 1 }, [0, 1, 2]).values);
    expect(after).toEqual(before);
    expect(draws).toBe(draws_before);
    expect(changes).toBe(0);

    // The replacement store still calls the volatile function on the next edit.
    set_formula(store, 1, 0, "=1");
    expect(store.getCell(address(0, 0)).resolved).toBe(draws_before + 1);
  });

  it("receive blocks as row arrays and turn failures into #VALUE!", () => {
    const received: (readonly FormulaArgument[])[] = [];
    const store = grid_with([
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

    set_formula(store, 2, 0, "=ECHO(A1:B2,A1,,1/0)");
    set_formula(store, 2, 1, '=ECHO(A1:B2,A1,,"x")');
    set_formula(store, 3, 0, "=FAIL()");
    set_formula(store, 3, 1, "=LATER()");

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
    const store = grid_with([define(TAX_RATE, tax_rate)], 2).store;

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
    const record_refusal = (use: () => void): number => {
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
    const live_store = (): Store => {
      if (store === undefined) throw new Error("the grid is not created yet");
      return store;
    };
    store = grid_with([
      define(metadata("PEEK"), () => record_refusal(() => live_store().getCell(address(0, 0)))),
      define(metadata("POKE"), () =>
        record_refusal(() =>
          live_store().applyTransaction({
            patches: [{ op: "set", addr: address(0, 0), value: { kind: "literal", value: 99 } }],
          }),
        ),
      ),
    ]).store;
    store.applyTransaction({
      patches: [{ op: "set", addr: address(0, 0), value: { kind: "literal", value: 5 } }],
    });

    set_formula(store, 1, 0, "=PEEK()");
    set_formula(store, 1, 1, "=POKE()");

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
    set_formula(store, 2, 0, "=A1*2");
    expect(store.getCell(address(2, 0)).resolved).toBe(10);
  });

  it("stay on the live engine store when a memory release aborts", async () => {
    const store = grid_with([
      define(TAX_RATE, tax_rate),
      define(metadata("TWICE"), (value) => Number(value) * 2),
    ]).store;
    const failing = new SheetwriteStore(makeWorkbook(1));
    const failing_engine = storeEngine(failing);
    if (failing_engine === null) throw new Error("store has no engine");
    const prepare = failing_engine.prepareMemoryRelease.bind(failing_engine);
    try {
      // The second store fails after the first one prepared its replacement,
      // so the release aborts and frees that replacement.
      failing_engine.prepareMemoryRelease = () => {
        throw new Error("forced preparation failure");
      };

      await expect(releaseEngineMemory()).rejects.toThrow("preparation failed");

      set_formula(store, 0, 0, '=TAXRATE("EU")');
      set_formula(store, 0, 1, "=TWICE(21)");
      expect(store.getCell(address(0, 0)).resolved).toBe(EU_RATE);
      expect(store.getCell(address(0, 1)).resolved).toBe(42);
    } finally {
      // The disposed engine stays listed until it is collected, so later
      // releases in the same process must see its real preparation again.
      failing_engine.prepareMemoryRelease = prepare;
      failing.dispose();
    }
  });
});
