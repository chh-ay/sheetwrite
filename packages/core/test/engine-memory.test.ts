import { beforeAll, describe, expect, it } from "bun:test";

import { getEngine } from "../src/engine.js";
import { initSheetwrite, releaseEngineMemory, SheetwriteStore } from "../src/index.js";
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
      const refreshed = first.getVisibleWindow("s1", { start: 0, end: 8 }, [0, 1, 2]);
      expect(refreshed.values).toEqual(values);
      expect(refreshed.stringPoolEpoch).not.toBe(window.stringPoolEpoch);
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
    const disposed = new SheetwriteStore(makeWorkbook(2));
    const range = { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } };
    const snapshot = disposed.captureRangeHistory(range);
    if (!snapshot) throw new Error("Expected a compact history resource");

    disposed.dispose();

    try {
      const retired = new WeakRef(getEngine().getMemory());
      const first = releaseEngineMemory();
      expect(releaseEngineMemory()).toBe(first);
      await first;
      for (let cycle = 0; cycle < 5; cycle++) {
        // A real task boundary ends WeakRef's keep-alive job; fake time cannot force GC.
        const next = Promise.withResolvers<void>();
        setImmediate(next.resolve);
        await next.promise;
        Bun.gc(true);
      }

      expect(retired.deref()).toBeUndefined();
      // Retained disposed facades/resources must not retain an old glue memory cache.
      expect(disposed.getWorkbook().sheets).toHaveLength(1);
      expect(() => snapshot.toDocumentOp(range)).toThrow("already disposed");
      snapshot.dispose();
      disposed.dispose();

      store.applyTransaction({
        patches: [{ op: "set", addr: address(0, 1), value: { kind: "literal", value: 7 } }],
      });
      expect(store.getCell(address(0, 1)).resolved).toBe(7);
    } finally {
      store.dispose();
    }
  });

  for (const engine of ["wasm", "formulas"]) {
    it(`keeps ${engine} stores and history atomic on failure and waits for datasource loads`, async () => {
      const probe = new URL("./engine-memory-probe.ts", import.meta.url).pathname;
      const process = Bun.spawn(["bun", probe, engine], { stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
        process.exited,
      ]);
      expect(exitCode, `Memory release probe failed:\n${stderr}`).toBe(0);
      expect(JSON.parse(stdout)).toEqual({ engine, atomic: true, waitedForPage: true });
    });
  }
});
