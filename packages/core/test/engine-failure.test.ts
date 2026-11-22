import { afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { releaseEngineMemory } from "../src/engine-memory.js";
import { SheetwriteError } from "../src/errors.js";
import { createGrid, GridImpl, initSheetwrite, isSheetwriteReady } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { StoreDataEngine } from "../src/store/data-engine.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { DocumentOp, GridEvents } from "../src/types.js";
import { makeColumnarData, makeWorkbook, mountHost } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restore_stubs: () => void;

beforeEach(() => {
  restore_stubs = installCanvasTestStubs();
});

afterEach(async () => {
  mock.restore();
  restore_stubs();
  // Every test leaves a running engine behind, whether or not it stopped one.
  await initSheetwrite();
});

function mount_grid(store?: SheetwriteStore): GridImpl {
  return new GridImpl(mountHost(), { workbook: makeWorkbook(5), data: makeColumnarData(5) }, store);
}

function set_text(text: string): DocumentOp {
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
  for (const reader of [Reflect.get(engine, "view"), Reflect.get(engine, "window_reader")]) {
    const replace_engine: unknown = Reflect.get(reader, "replaceEngine");
    if (typeof replace_engine !== "function") throw new Error("Engine reader shape changed");
    Reflect.apply(replace_engine, reader, [STUCK_CELL_STORE]);
  }
}

/** Trap the way the engine does: the store stays stuck after the call. */
function trap_and_poison(this: StoreDataEngine): never {
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

function expect_engine_failed(error: unknown): SheetwriteError {
  if (!(error instanceof SheetwriteError)) {
    throw new Error(`Expected a SheetwriteError, got ${String(error)}`);
  }

  expect(error.code).toBe("engine-failed");
  expect(error.operation).toBe("engine");
  return error;
}

/** Stop the running engine through a trap in `store`'s next edit. */
function stop_through(store: { applyTransaction: SheetwriteStore["applyTransaction"] }): unknown {
  const apply_patches = spyOn(StoreDataEngine.prototype, "applyPatches").mockImplementation(
    trap_and_poison,
  );
  try {
    return caught(() => store.applyTransaction({ patches: [set_text("lost")] }));
  } finally {
    apply_patches.mockRestore();
  }
}

describe("engine failure", () => {
  it("stops the engine on a trap and makes every grid on it read-only", async () => {
    const first = mount_grid();
    const second = mount_grid();
    const first_events: Array<GridEvents["engine-failed"]> = [];
    const second_events: Array<GridEvents["engine-failed"]> = [];
    const command_states: Array<GridEvents["command-state-change"]> = [];
    first.on("engine-failed", (event) => first_events.push(event));
    second.on("engine-failed", (event) => second_events.push(event));
    first.on("command-state-change", (event) => command_states.push(event));

    const error = expect_engine_failed(stop_through(first));
    expect(error.cause).toBeInstanceOf(WebAssembly.RuntimeError);
    expect(isSheetwriteReady()).toBe(false);

    // Edits are refused at once; the event follows one microtask later.
    expect(first.applyTransaction({ patches: [set_text("refused")] })).toMatchObject({
      status: "noop",
      reason: "read-only",
    });
    await Promise.resolve();

    expect(first_events).toHaveLength(1);
    expect(first_events[0]?.error).toBe(error);
    expect(second_events).toHaveLength(1);
    // Command state reports read-only without reading the stuck store.
    expect(command_states.length).toBeGreaterThan(0);
    expect(second.applyTransaction({ patches: [set_text("refused")] })).toMatchObject({
      status: "noop",
      reason: "read-only",
    });

    // The host cannot switch editing back on while the engine is stopped.
    first.setReadOnly(false);
    expect(first.applyTransaction({ patches: [set_text("refused")] })).toMatchObject({
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
    expect(first_events).toHaveLength(1);
  });

  it("refuses work on stores of a stopped engine and restarts from a document", async () => {
    const stopped = new SheetwriteStore(makeWorkbook(5), makeColumnarData(5));
    const snapshot = stopped.exportSnapshot();

    expect_engine_failed(stop_through(stopped));
    expect_engine_failed(caught(() => stopped.applyTransaction({ patches: [set_text("again")] })));
    expect_engine_failed(caught(() => stopped.recalculateVolatile()));
    expect_engine_failed(caught(() => stopped.loadPage("s1", 0, [], [])));
    expect(() => createGrid(mountHost(), { workbook: makeWorkbook(5) })).toThrow(
      expect.objectContaining({ code: "initialization-required" }),
    );
    // Disposal does not call the stuck cell store, so it cannot throw.
    expect(() => stopped.dispose()).not.toThrow();

    await initSheetwrite();

    const restarted = SheetwriteStore.fromSnapshot(snapshot);
    expect(restarted.applyTransaction({ patches: [set_text("kept")] }).status).toBe("applied");
    expect(restarted.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("kept");
    expect(isSheetwriteReady()).toBe(true);
    restarted.dispose();
  });

  it("stops the engine when the first paint traps", async () => {
    const visible_window = spyOn(SheetwriteStore.prototype, "getVisibleWindow").mockImplementation(
      trap,
    );
    let grid: GridImpl;
    try {
      grid = mount_grid();
    } finally {
      visible_window.mockRestore();
    }

    const events: Array<GridEvents["engine-failed"]> = [];
    grid.on("engine-failed", (event) => events.push(event));
    await Promise.resolve();

    expect(events).toHaveLength(1);
    expect_engine_failed(events[0]?.error);
    expect(isSheetwriteReady()).toBe(false);
    expect(grid.applyTransaction({ patches: [set_text("refused")] })).toMatchObject({
      status: "noop",
      reason: "read-only",
    });
    grid.destroy();
  });

  it("keeps a restarted engine running when a grid uses a store from the stopped one", async () => {
    const bystander = new SheetwriteStore(makeWorkbook(5), makeColumnarData(5));
    const stopped = new SheetwriteStore(makeWorkbook(5), makeColumnarData(5));
    expect_engine_failed(stop_through(stopped));
    await initSheetwrite();
    const healthy = mount_grid();

    // Every frame read traps while the stale grid mounts; none may stop the running engine.
    const visible_window = spyOn(SheetwriteStore.prototype, "getVisibleWindow").mockImplementation(
      trap,
    );
    let stale: GridImpl;
    try {
      stale = mount_grid(bystander);
      stale.refresh();
    } finally {
      visible_window.mockRestore();
    }

    const events: Array<GridEvents["engine-failed"]> = [];
    stale.on("engine-failed", (event) => events.push(event));
    await Promise.resolve();

    expect(events).toHaveLength(1);
    expect(isSheetwriteReady()).toBe(true);
    expect(stale.applyTransaction({ patches: [set_text("refused")] })).toMatchObject({
      status: "noop",
      reason: "read-only",
    });
    expect(healthy.applyTransaction({ patches: [set_text("kept")] }).status).toBe("applied");
    // The stopped engine's store is out of the live set, so release does not read it.
    await releaseEngineMemory();
    expect(healthy.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("kept");
    stopped.dispose();

    stale.destroy();
    healthy.destroy();
  });

  it("keeps the resource-limit error when a snapshot load traps", async () => {
    const snapshot = new SheetwriteStore(makeWorkbook(5), makeColumnarData(5)).exportSnapshot();
    spyOn(StoreDataEngine.prototype, "hydrateSnapshot").mockImplementation(trap_and_poison);
    const failure = caught(() => SheetwriteStore.fromSnapshot(snapshot));
    mock.restore();

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
    expect(store.applyTransaction({ patches: [set_text("kept")] }).status).toBe("applied");

    prepare.mockImplementation(trap);
    expect_engine_failed(await releaseEngineMemory().catch((error: unknown) => error));
    expect(isSheetwriteReady()).toBe(false);
    expect_engine_failed(caught(() => store.applyTransaction({ patches: [set_text("lost")] })));
  });
});
