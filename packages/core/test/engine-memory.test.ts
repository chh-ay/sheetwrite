import { beforeAll, describe, expect, it, spyOn } from "bun:test";

import { getEngine } from "../src/engine.js";
import { initSheetwrite, releaseEngineMemory, SheetwriteStore } from "../src/index.js";
import { storeEngine } from "../src/store/engine-registry.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

const address = (row: number, col: number) => ({ sheet: "s1", row, col });

// A datasource request in flight keeps its store reachable until it settles. A test
// that only counts a request holds its store here instead; otherwise a collection
// while the release instantiates can free the store before the release asks it.
const storesWithOpenRequests = new Set<SheetwriteStore>();

/** Runs a probe in a fresh bun process and returns its JSON report. */
async function runProbe(name: string, args: string[] = [], env?: Record<string, string>) {
  const probe = new URL(name, import.meta.url).pathname;
  const child = Bun.spawn(["bun", probe, ...args], {
    env: { ...Bun.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exitCode, `${name} failed:\n${stderr}`).toBe(0);
  return JSON.parse(stdout) as unknown;
}

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

  it("drops the retired linear memory while disposed facades stay reachable", async () => {
    // Concurrent JIT compilations keep the values they profiled alive until they
    // finish, and sibling suites keep starting them, so the probe runs alone and
    // compiles on the main thread: only the product's own references remain.
    const report = await runProbe("./engine-release-lifetime-probe.ts", [], {
      BUN_JSC_useConcurrentJIT: "0",
    });
    expect(report).toEqual({ stores: 1, freed: true });
  });

  it("finishes a release when a store that waits for a page load is disposed", async () => {
    const store = new SheetwriteStore(makeWorkbook(2));
    const engine = storeEngine(store);
    if (!engine) throw new Error("Expected a registered engine");

    // A datasource request that never ends; disposing the store must end the wait.
    engine.beginPageRequest();
    storesWithOpenRequests.add(store);
    const asked = Promise.withResolvers<void>();
    const waitForPageLoads = engine.waitForPageLoads.bind(engine);
    spyOn(engine, "waitForPageLoads").mockImplementation(() => {
      const wait = waitForPageLoads();
      asked.resolve();
      return wait;
    });
    const release = releaseEngineMemory();
    expect(releaseEngineMemory()).toBe(release);
    await asked.promise;

    // Without the fix this await never settles and the test runner times out.
    store.dispose();
    storesWithOpenRequests.delete(store);

    await expect(release).resolves.toMatchObject({ wasmBytesAfter: expect.any(Number) });
  });

  for (const engine of ["wasm", "formulas"]) {
    it(`keeps ${engine} stores and history atomic on failure and waits for datasource loads`, async () => {
      const report = await runProbe("./engine-memory-probe.ts", [engine]);
      expect(report).toEqual({ engine, atomic: true, waitedForPage: true });
    });
  }

  it("rejects a transfer that declares an array larger than engine memory", () => {
    // Store transfer tag, one pooled string, and that string's byte length.
    const STORE_TAG = 0x32524d53;
    const OVERSIZED_LENGTH = 0xffff_fff0;
    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, STORE_TAG, true);
    view.setUint32(4, 1, true);
    view.setUint32(8, OVERSIZED_LENGTH, true);

    let failure: unknown;
    try {
      getEngine().CellStore.importMemoryState(bytes);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeDefined();
    expect(failure).not.toBeInstanceOf(WebAssembly.RuntimeError);
  });
});
