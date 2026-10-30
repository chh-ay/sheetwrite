import { beforeAll, describe, expect, it } from "bun:test";

import {
  type FormulaArgument,
  type FormulaFunctionMetadata,
  initSheetwrite,
  isSheetwriteError,
  releaseEngineMemory,
  SheetwriteStore,
} from "../src/index.js";
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

function setFormula(store: SheetwriteStore, row: number, col: number, src: string): void {
  store.applyTransaction({
    patches: [{ op: "set", addr: address(row, col), value: { kind: "formula", src } }],
  });
}

beforeAll(async () => {
  await initSheetwrite();
});

describe("host formula functions", () => {
  it("calculate with their inputs, survive memory release, and leave only formula text in snapshots", async () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    try {
      store.applyTransaction({
        patches: [{ op: "set", addr: address(0, 0), value: { kind: "literal", value: "EU" } }],
      });
      setFormula(store, 0, 1, "=taxrate(A1)*100");
      expect(store.getCell(address(0, 1)).resolved).toBe("#NAME?");

      let changes = 0;
      const unsubscribe = store.on("change", () => {
        changes += 1;
      });
      store.registerFunction(TAX_RATE, taxRate);
      unsubscribe();
      expect(changes).toBe(1);
      expect(store.getCell(address(0, 1)).resolved).toBe(EU_RATE * 100);

      await releaseEngineMemory();
      store.applyTransaction({
        patches: [{ op: "set", addr: address(0, 0), value: { kind: "literal", value: "US" } }],
      });
      expect(store.getCell(address(0, 1)).resolved).toBe(OTHER_RATE * 100);

      const restored = SheetwriteStore.fromSnapshot(store.exportSnapshot());
      try {
        expect(restored.getFormula(address(0, 1))).toBe("=taxrate(A1)*100");
        expect(restored.getCell(address(0, 1)).resolved).toBe("#NAME?");
      } finally {
        restored.dispose();
      }

      expect(store.unregisterFunction("TAXRATE")).toBe(true);
      expect(store.unregisterFunction("TAXRATE")).toBe(false);
      expect(store.getCell(address(0, 1)).resolved).toBe("#NAME?");
    } finally {
      store.dispose();
    }
  });

  it("keep calculated values and send no change event across a memory release", async () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    try {
      let draws = 0;
      store.registerFunction({ ...metadata("DRAW"), volatile: true }, () => {
        draws += 1;
        return draws;
      });
      store.registerFunction(TAX_RATE, taxRate);
      setFormula(store, 0, 0, "=DRAW()");
      setFormula(store, 0, 1, "=NOW()");
      setFormula(store, 0, 2, '=TAXRATE("EU")');
      const before = Array.from(
        store.getVisibleWindow("s1", { start: 0, end: 1 }, [0, 1, 2]).values,
      );
      const drawsBefore = draws;
      let changes = 0;
      const unsubscribe = store.on("change", () => {
        changes += 1;
      });

      await releaseEngineMemory();
      unsubscribe();

      const after = Array.from(
        store.getVisibleWindow("s1", { start: 0, end: 1 }, [0, 1, 2]).values,
      );
      expect(after).toEqual(before);
      expect(draws).toBe(drawsBefore);
      expect(changes).toBe(0);

      // The replacement store still calls the volatile function on the next edit.
      setFormula(store, 1, 0, "=1");
      expect(store.getCell(address(0, 0)).resolved).toBe(drawsBefore + 1);
    } finally {
      store.dispose();
    }
  });

  it("receive blocks as row arrays and turn failures into #VALUE!", () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    try {
      const received: (readonly FormulaArgument[])[] = [];
      store.registerFunction(metadata("ECHO"), (...values) => {
        received.push(values);
        return values.length;
      });
      store.registerFunction(metadata("FAIL"), () => {
        throw new Error("lookup failed");
      });
      store.registerFunction(
        metadata("LATER"),
        // A JavaScript host can return a promise despite the type; it is not a scalar.
        () => Promise.resolve(1) as unknown as number,
      );
      store.applyTransaction({
        patches: [
          { op: "set", addr: address(0, 0), value: { kind: "literal", value: 1 } },
          { op: "set", addr: address(1, 0), value: { kind: "literal", value: "two" } },
          { op: "set", addr: address(0, 1), value: { kind: "literal", value: true } },
        ],
      });

      setFormula(store, 2, 0, "=ECHO(A1:B2,A1,,1/0)");
      setFormula(store, 2, 1, "=ECHO(A1:B2,A1,)");
      setFormula(store, 3, 0, "=FAIL()");
      setFormula(store, 3, 1, "=LATER()");

      expect(store.getCell(address(2, 0)).resolved).toBe("#DIV/0!");
      expect(store.getCell(address(2, 1)).resolved).toBe(3);
      expect(received.at(-1)).toEqual([
        [
          [1, true],
          ["two", null],
        ],
        1,
        null,
      ]);
      expect(store.getCell(address(3, 0)).resolved).toBe("#VALUE!");
      expect(store.getCell(address(3, 1)).resolved).toBe("#VALUE!");
    } finally {
      store.dispose();
    }
  });

  it("list built-in and host metadata in one list and refuse names that are not free", async () => {
    const store = new SheetwriteStore(makeWorkbook(2));
    try {
      store.registerFunction(TAX_RATE, taxRate);

      const functions = await store.listFunctions();
      const names = functions.map((entry) => entry.name);
      expect(functions.find((entry) => entry.name === "SUM")).toMatchObject({
        returnKind: expect.any(String),
        volatile: false,
      });
      expect(functions.find((entry) => entry.name === "NOW")?.volatile).toBe(true);
      // Analysis functions belong to @sheetwrite/formulas, not the default engine.
      expect(names).not.toContain("REGEXTEST");
      expect(functions.at(-1)).toMatchObject({
        name: "TAXRATE",
        description: TAX_RATE.description,
        arguments: [{ name: "region", types: ["text"], optional: false, repeating: false }],
        examples: TAX_RATE.examples,
        volatile: false,
      });

      for (const name of ["SUM", "A1", "R1C1", "BAD NAME", ""]) {
        let failure: unknown;
        try {
          store.registerFunction(metadata(name), () => null);
        } catch (error) {
          failure = error;
        }
        expect(isSheetwriteError(failure) && failure.code).toBe("invalid-function");
      }
      expect(await store.listFunctions()).toHaveLength(functions.length);
    } finally {
      store.dispose();
    }
  });

  it("refuse store reads and changes during a call and leave the store usable and disposable", () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    try {
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
      store.registerFunction(metadata("PEEK"), () =>
        recordRefusal(() => store.getCell(address(0, 0))),
      );
      store.registerFunction(metadata("POKE"), () =>
        recordRefusal(() =>
          store.applyTransaction({
            patches: [{ op: "set", addr: address(0, 0), value: { kind: "literal", value: 99 } }],
          }),
        ),
      );
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
      const restored = SheetwriteStore.fromSnapshot(store.exportSnapshot());
      try {
        expect(restored.getCell(address(0, 0)).resolved).toBe(5);
      } finally {
        restored.dispose();
      }
      setFormula(store, 2, 0, "=A1*2");
      expect(store.getCell(address(2, 0)).resolved).toBe(10);
    } finally {
      store.dispose();
    }
  });
});
