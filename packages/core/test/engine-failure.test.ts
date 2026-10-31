import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { releaseEngineMemory } from "../src/engine-memory.js";
import { SheetwriteError } from "../src/errors.js";
import { createGrid, GridImpl, initSheetwrite, isSheetwriteReady } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { StoreDataEngine } from "../src/store/data-engine.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { DocumentOp, GridEvents } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(async () => {
  restoreStubs();
  // Every test leaves a running engine behind, whether or not it stopped one.
  await initSheetwrite();
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

function mountGrid(store?: SheetwriteStore): GridImpl {
  return new GridImpl(mountHost(), { workbook: makeWorkbook(5), data: makeColumnarData(5) }, store);
}

function setText(text: string): DocumentOp {
  return {
    op: "set",
    addr: { sheet: "s1", row: 0, col: 0 },
    value: { kind: "literal", value: text },
  };
}

/**
 * After a real trap the cell store's borrow flag stays set, so every later
 * call into it throws. This stand-in does the same for every member read.
 */
const STUCK_CELL_STORE = new Proxy(
  {},
  {
    get() {
      throw new Error("recursive use of an object detected which would lead to unsafe aliasing");
    },
  },
);

function poison(engine: StoreDataEngine): void {
  Reflect.set(engine, "wasm", STUCK_CELL_STORE);
  for (const reader of [Reflect.get(engine, "view"), Reflect.get(engine, "windowReader")]) {
    const replaceEngine: unknown = Reflect.get(reader, "replaceEngine");
    if (typeof replaceEngine !== "function") throw new Error("Engine reader shape changed");
    Reflect.apply(replaceEngine, reader, [STUCK_CELL_STORE]);
  }
}

/** Trap the way the engine does: the store stays stuck after the call. */
function trapAndPoison(this: StoreDataEngine): never {
  poison(this);
  throw new WebAssembly.RuntimeError("unreachable");
}

function trap(): never {
  throw new WebAssembly.RuntimeError("unreachable");
}

function caught(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  throw new Error("Expected the call to throw");
}

function expectEngineFailed(error: unknown): SheetwriteError {
  if (!(error instanceof SheetwriteError)) {
    throw new Error(`Expected a SheetwriteError, got ${String(error)}`);
  }

  expect(error.code).toBe("engine-failed");
  expect(error.operation).toBe("engine");
  return error;
}

/** Stop the running engine through a trap in `store`'s next edit. */
function stopThrough(store: { applyTransaction: SheetwriteStore["applyTransaction"] }): unknown {
  const applyPatches = spyOn(StoreDataEngine.prototype, "applyPatches").mockImplementation(
    trapAndPoison,
  );
  try {
    return caught(() => store.applyTransaction({ patches: [setText("lost")] }));
  } finally {
    applyPatches.mockRestore();
  }
}

describe("engine failure", () => {
  it("stops the engine on a trap and makes every grid on it read-only", async () => {
    const first = mountGrid();
    const second = mountGrid();
    const firstEvents: Array<GridEvents["engine-failed"]> = [];
    const secondEvents: Array<GridEvents["engine-failed"]> = [];
    const commandStates: Array<GridEvents["command-state-change"]> = [];
    first.on("engine-failed", (event) => firstEvents.push(event));
    second.on("engine-failed", (event) => secondEvents.push(event));
    first.on("command-state-change", (event) => commandStates.push(event));

    const error = expectEngineFailed(stopThrough(first));
    expect(error.cause).toBeInstanceOf(WebAssembly.RuntimeError);
    expect(isSheetwriteReady()).toBe(false);

    // Edits are refused at once; the event follows one microtask later.
    expect(first.applyTransaction({ patches: [setText("refused")] })).toMatchObject({
      status: "noop",
      reason: "read-only",
    });
    await Promise.resolve();

    expect(firstEvents).toHaveLength(1);
    expect(firstEvents[0]?.error).toBe(error);
    expect(secondEvents).toHaveLength(1);
    // Command state reports read-only without reading the stuck store.
    expect(commandStates.length).toBeGreaterThan(0);
    expect(second.applyTransaction({ patches: [setText("refused")] })).toMatchObject({
      status: "noop",
      reason: "read-only",
    });

    // The host cannot switch editing back on while the engine is stopped.
    first.setReadOnly(false);
    expect(first.applyTransaction({ patches: [setText("refused")] })).toMatchObject({
      status: "noop",
      reason: "read-only",
    });

    // Painting and selection no longer reach the stuck store.
    first.refresh();
    first.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 1, col: 1 }, end: { row: 2, col: 2 } },
    });
    await Promise.resolve();

    expect(() => first.destroy()).not.toThrow();
    expect(() => second.destroy()).not.toThrow();
    expect(firstEvents).toHaveLength(1);
  });

  it("refuses work on stores of a stopped engine and restarts from a document", async () => {
    const stopped = new SheetwriteStore(makeWorkbook(5), makeColumnarData(5));
    const snapshot = stopped.exportSnapshot();

    expectEngineFailed(stopThrough(stopped));
    expectEngineFailed(caught(() => stopped.applyTransaction({ patches: [setText("again")] })));
    expectEngineFailed(caught(() => stopped.recalculateVolatile()));
    expectEngineFailed(caught(() => stopped.loadPage("s1", 0, [], [])));
    expect(() => createGrid(mountHost(), { workbook: makeWorkbook(5) })).toThrow(
      expect.objectContaining({ code: "initialization-required" }),
    );
    // Disposal does not call the stuck cell store, so it cannot throw.
    expect(() => stopped.dispose()).not.toThrow();

    await initSheetwrite();

    const restarted = SheetwriteStore.fromSnapshot(snapshot);
    expect(restarted.applyTransaction({ patches: [setText("kept")] }).status).toBe("applied");
    expect(restarted.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("kept");
    expect(isSheetwriteReady()).toBe(true);
    restarted.dispose();
  });

  it("stops the engine when the first paint traps", async () => {
    const visibleWindow = spyOn(SheetwriteStore.prototype, "getVisibleWindow").mockImplementation(
      trap,
    );
    let grid: GridImpl;
    try {
      grid = mountGrid();
    } finally {
      visibleWindow.mockRestore();
    }

    const events: Array<GridEvents["engine-failed"]> = [];
    grid.on("engine-failed", (event) => events.push(event));
    await Promise.resolve();

    expect(events).toHaveLength(1);
    expectEngineFailed(events[0]?.error);
    expect(isSheetwriteReady()).toBe(false);
    expect(grid.applyTransaction({ patches: [setText("refused")] })).toMatchObject({
      status: "noop",
      reason: "read-only",
    });
    grid.destroy();
  });

  it("keeps a restarted engine running when a grid uses a store from the stopped one", async () => {
    const bystander = new SheetwriteStore(makeWorkbook(5), makeColumnarData(5));
    expectEngineFailed(stopThrough(new SheetwriteStore(makeWorkbook(5), makeColumnarData(5))));
    await initSheetwrite();
    const healthy = mountGrid();

    // Every frame read traps while the stale grid mounts; none may stop the running engine.
    const visibleWindow = spyOn(SheetwriteStore.prototype, "getVisibleWindow").mockImplementation(
      trap,
    );
    let stale: GridImpl;
    try {
      stale = mountGrid(bystander);
      stale.refresh();
    } finally {
      visibleWindow.mockRestore();
    }

    const events: Array<GridEvents["engine-failed"]> = [];
    stale.on("engine-failed", (event) => events.push(event));
    await Promise.resolve();

    expect(events).toHaveLength(1);
    expect(isSheetwriteReady()).toBe(true);
    expect(stale.applyTransaction({ patches: [setText("refused")] })).toMatchObject({
      status: "noop",
      reason: "read-only",
    });
    expect(healthy.applyTransaction({ patches: [setText("kept")] }).status).toBe("applied");

    stale.destroy();
    healthy.destroy();
  });

  it("does not notify a destroyed grid", () => {
    const destroyed = mountGrid();
    destroyed.destroy();

    const notified: unknown[] = [];
    const prototype: { onEngineFailed(): void } = Object.getPrototypeOf(destroyed);
    const onEngineFailed = spyOn(prototype, "onEngineFailed").mockImplementation(function (
      this: unknown,
    ) {
      notified.push(this);
    });
    try {
      expectEngineFailed(stopThrough(new SheetwriteStore(makeWorkbook(5), makeColumnarData(5))));
    } finally {
      onEngineFailed.mockRestore();
    }

    expect(notified).not.toContain(destroyed);
  });

  it("migrates only the running engine's stores after a restart", async () => {
    const stopped = new SheetwriteStore(makeWorkbook(5), makeColumnarData(5));
    expectEngineFailed(stopThrough(stopped));
    await initSheetwrite();

    const running = new SheetwriteStore(makeWorkbook(5), makeColumnarData(5));
    running.applyTransaction({ patches: [setText("kept")] });

    // The stopped store is out of the live set, so release does not read it.
    await releaseEngineMemory();
    expect(running.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("kept");
    running.dispose();
  });

  it("keeps the resource-limit error when a snapshot load traps", async () => {
    const snapshot = new SheetwriteStore(makeWorkbook(5), makeColumnarData(5)).exportSnapshot();
    const hydrate = spyOn(StoreDataEngine.prototype, "hydrateSnapshot").mockImplementation(
      trapAndPoison,
    );
    let failure: unknown;
    try {
      failure = caught(() => SheetwriteStore.fromSnapshot(snapshot));
    } finally {
      hydrate.mockRestore();
    }

    expect(failure).toMatchObject({
      name: "SnapshotValidationError",
      errors: [expect.objectContaining({ code: "resource-limit" })],
    });
    // The stuck store is not migrated, so memory release still works.
    await expect(releaseEngineMemory()).resolves.toMatchObject({
      wasmBytesBefore: expect.any(Number),
    });
  });

  it("stops the engine on a trap during memory release and types an allocation failure", async () => {
    const store = new SheetwriteStore(makeWorkbook(5), makeColumnarData(5));
    const prepare = spyOn(StoreDataEngine.prototype, "prepareMemoryRelease");

    try {
      // History migration wraps the allocation failure in its own error.
      prepare.mockImplementation(() => {
        throw new Error("Sheetwrite: compact history migration failed", {
          cause: new RangeError("Array buffer allocation failed"),
        });
      });
      await expect(releaseEngineMemory()).rejects.toMatchObject({
        code: "resource-limit",
        operation: "engine",
      });
      expect(isSheetwriteReady()).toBe(true);
      expect(store.applyTransaction({ patches: [setText("kept")] }).status).toBe("applied");

      prepare.mockImplementation(trap);
      expectEngineFailed(await releaseEngineMemory().catch((error: unknown) => error));
      expect(isSheetwriteReady()).toBe(false);
      expectEngineFailed(caught(() => store.applyTransaction({ patches: [setText("lost")] })));
    } finally {
      prepare.mockRestore();
    }
  });
});
