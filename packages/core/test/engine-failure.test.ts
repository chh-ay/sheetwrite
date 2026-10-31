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

function setText(text: string): DocumentOp {
  return {
    op: "set",
    addr: { sheet: "s1", row: 0, col: 0 },
    value: { kind: "literal", value: text },
  };
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

describe("engine failure", () => {
  it("stops the engine on a trap and makes every grid on it read-only", async () => {
    const first = new GridImpl(mountHost(), {
      workbook: makeWorkbook(5),
      data: makeColumnarData(5),
    });
    const second = new GridImpl(mountHost(), {
      workbook: makeWorkbook(5),
      data: makeColumnarData(5),
    });
    const firstEvents: Array<GridEvents["engine-failed"]> = [];
    const secondEvents: Array<GridEvents["engine-failed"]> = [];
    first.on("engine-failed", (event) => firstEvents.push(event));
    second.on("engine-failed", (event) => secondEvents.push(event));

    const applyPatches = spyOn(StoreDataEngine.prototype, "applyPatches").mockImplementation(trap);
    let failure: unknown;
    try {
      failure = caught(() => first.applyTransaction({ patches: [setText("lost")] }));
    } finally {
      applyPatches.mockRestore();
    }

    const error = expectEngineFailed(failure);
    expect(error.cause).toBeInstanceOf(WebAssembly.RuntimeError);
    expect(isSheetwriteReady()).toBe(false);

    // The event and the read-only switch run one microtask after the failing call.
    await Promise.resolve();

    expect(firstEvents).toHaveLength(1);
    expect(firstEvents[0]?.error).toBe(error);
    expect(secondEvents).toHaveLength(1);
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

    // Painting stops: a refresh no longer reads the store.
    const viewRowCount = spyOn(SheetwriteStore.prototype, "viewRowCount");
    try {
      first.refresh();
      expect(viewRowCount).not.toHaveBeenCalled();
    } finally {
      viewRowCount.mockRestore();
    }

    first.destroy();
    second.destroy();
    expect(firstEvents).toHaveLength(1);
  });

  it("refuses work on stores of a stopped engine and restarts from a document", async () => {
    const workbook = makeWorkbook(5);
    const stopped = new SheetwriteStore(workbook, makeColumnarData(5));
    const snapshot = stopped.exportSnapshot();

    const applyPatches = spyOn(StoreDataEngine.prototype, "applyPatches").mockImplementation(trap);
    try {
      expectEngineFailed(caught(() => stopped.applyTransaction({ patches: [setText("lost")] })));
    } finally {
      applyPatches.mockRestore();
    }

    expectEngineFailed(caught(() => stopped.applyTransaction({ patches: [setText("again")] })));
    expectEngineFailed(caught(() => stopped.recalculateVolatile()));
    expect(() => createGrid(mountHost(), { workbook: makeWorkbook(5) })).toThrow(
      expect.objectContaining({ code: "initialization-required" }),
    );
    // Disposal does not call the stopped instance, so it cannot throw.
    stopped.dispose();

    await initSheetwrite();

    const restarted = SheetwriteStore.fromSnapshot(snapshot);
    expect(restarted.applyTransaction({ patches: [setText("kept")] }).status).toBe("applied");
    expect(restarted.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("kept");
    expect(isSheetwriteReady()).toBe(true);
    restarted.dispose();
  });

  it("stops the engine when a frame read traps", async () => {
    const grid = new GridImpl(mountHost(), {
      workbook: makeWorkbook(5),
      data: makeColumnarData(5),
    });
    const events: Array<GridEvents["engine-failed"]> = [];
    grid.on("engine-failed", (event) => events.push(event));

    const viewRowCount = spyOn(SheetwriteStore.prototype, "viewRowCount").mockImplementation(trap);
    try {
      grid.refresh();
    } finally {
      viewRowCount.mockRestore();
    }

    await Promise.resolve();

    expect(events).toHaveLength(1);
    expectEngineFailed(events[0]?.error);
    expect(grid.applyTransaction({ patches: [setText("refused")] })).toMatchObject({
      status: "noop",
      reason: "read-only",
    });
    grid.destroy();
  });

  it("ignores a later trap from a stopped instance after a restart", async () => {
    const stopped = new SheetwriteStore(makeWorkbook(5), makeColumnarData(5));
    const applyPatches = spyOn(StoreDataEngine.prototype, "applyPatches").mockImplementation(trap);
    try {
      expectEngineFailed(caught(() => stopped.applyTransaction({ patches: [setText("lost")] })));
    } finally {
      applyPatches.mockRestore();
    }

    await initSheetwrite();

    const grid = new GridImpl(mountHost(), {
      workbook: makeWorkbook(5),
      data: makeColumnarData(5),
    });
    const events: Array<GridEvents["engine-failed"]> = [];
    grid.on("engine-failed", (event) => events.push(event));
    expectEngineFailed(caught(() => stopped.loadPage("s1", 0, [], [])));
    await Promise.resolve();

    expect(events).toHaveLength(0);
    expect(grid.applyTransaction({ patches: [setText("kept")] }).status).toBe("applied");
    grid.destroy();
  });

  it("does not notify a destroyed grid", async () => {
    const destroyed = new GridImpl(mountHost(), {
      workbook: makeWorkbook(5),
      data: makeColumnarData(5),
    });
    const onEngineFailed = spyOn(GridImpl.prototype as never, "onEngineFailed");
    destroyed.destroy();

    const store = new SheetwriteStore(makeWorkbook(5), makeColumnarData(5));
    const applyPatches = spyOn(StoreDataEngine.prototype, "applyPatches").mockImplementation(trap);
    try {
      expectEngineFailed(caught(() => store.applyTransaction({ patches: [setText("lost")] })));
      expect(onEngineFailed).not.toHaveBeenCalled();
    } finally {
      applyPatches.mockRestore();
      onEngineFailed.mockRestore();
    }
  });

  it("stops the engine on a trap during memory release and types an allocation failure", async () => {
    const store = new SheetwriteStore(makeWorkbook(5), makeColumnarData(5));
    const prepare = spyOn(StoreDataEngine.prototype, "prepareMemoryRelease");

    try {
      prepare.mockImplementation(() => {
        throw new RangeError("Array buffer allocation failed");
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
