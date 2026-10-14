import { beforeAll, describe, expect, it } from "bun:test";
import { releaseEngineMemory } from "../src/engine-memory.js";
import { getEngine } from "../src/engine.js";
import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

const address = (row: number, col: number) => ({ sheet: "s1", row, col });

describe("explicit engine memory release", () => {
  it("moves every live dense store without changing source, style, cached results, or events", async () => {
    const first = new SheetwriteStore(makeWorkbook(10));
    const second = new SheetwriteStore(makeWorkbook(4));
    try {
      first.applyTransaction({
        patches: [
          {
            op: "set",
            addr: address(0, 0),
            value: { kind: "literal", value: "cached text" },
            style: { bold: true },
          },
          { op: "set", addr: address(0, 1), value: { kind: "literal", value: 20 } },
          { op: "set", addr: address(1, 0), value: { kind: "ref", target: address(0, 1) } },
          { op: "set", addr: address(1, 1), value: { kind: "formula", src: "=B1+2" } },
          { op: "set", addr: address(2, 0), value: { kind: "formula", src: "=NOW()" } },
          { op: "set", addr: address(2, 1), value: { kind: "formula", src: "=1/0" } },
          { op: "set", addr: address(3, 0), value: { kind: "formula", src: "=B1>0" } },
          {
            op: "set",
            addr: address(4, 0),
            value: { kind: "formula", src: '=IF(B1>0,"text result","no")' },
          },
          { op: "set", addr: address(5, 0), value: { kind: "formula", src: "=SEQUENCE(2,2)" } },
        ],
      });
      second.applyTransaction({
        patches: [
          { op: "set", addr: address(0, 0), value: { kind: "literal", value: "other workbook" } },
        ],
      });
      const snapshot = first.exportSnapshot();
      const window = first.getVisibleWindow("s1", { start: 0, end: 8 }, [0, 1, 2]);
      const values = Array.from(window.values);
      let changes = 0;
      const unsubscribe = first.on("change", () => {
        changes += 1;
      });
      const report = await releaseEngineMemory();
      expect(report.stores).toBeGreaterThanOrEqual(2);
      expect(report.wasmBytesAfter).toBeGreaterThan(0);
      expect(report.pauseMs).toBeGreaterThanOrEqual(0);
      expect(first.exportSnapshot()).toEqual(snapshot);
      expect(first.getVisibleWindow("s1", { start: 0, end: 8 }, [0, 1, 2]).values).toEqual(values);
      expect(changes).toBe(0);
      expect(second.getCell(address(0, 0)).resolved).toBe("other workbook");
      first.applyTransaction({
        patches: [{ op: "set", addr: address(0, 1), value: { kind: "literal", value: 100 } }],
      });
      expect(first.getCell(address(1, 0)).resolved).toBe(100);
      expect(first.getCell(address(1, 1)).resolved).toBe(102);
      expect(changes).toBe(1);
      unsubscribe();
    } finally {
      first.dispose();
      second.dispose();
    }
  });

  it("drops the retired linear memory and shares concurrent release calls", async () => {
    const store = new SheetwriteStore(makeWorkbook(2));
    try {
      const retired = new WeakRef(getEngine().getMemory());
      const first = releaseEngineMemory();
      expect(releaseEngineMemory()).toBe(first);
      await first;
      for (let cycle = 0; cycle < 5; cycle++) {
        // A real task boundary ends WeakRef's keep-alive job; fake time cannot force GC.
        await new Promise<void>((resolve) => setImmediate(resolve));
        Bun.gc(true);
      }
      expect(retired.deref()).toBeUndefined();
      store.applyTransaction({
        patches: [{ op: "set", addr: address(0, 1), value: { kind: "literal", value: 7 } }],
      });
      expect(store.getCell(address(0, 1)).resolved).toBe(7);
    } finally {
      store.dispose();
    }
  });
});
