import { afterEach, beforeAll, beforeEach, expect, it, spyOn } from "bun:test";

import { createGrid, initSheetwrite } from "../src/grid.js";
import { MemoryPersistenceAdapter } from "../src/persistence.js";
import { storeEngine } from "../src/store/engine-registry.js";
import { SyncCoordinator } from "../src/sync.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid, WorkbookSnapshot } from "../src/types.js";
import { setXlsxWorkbookBackend } from "../src/xlsx-backend.js";
import { elementAdded, makeColumnarData, makeWorkbook } from "./fixtures.js";

const IMPORTED: WorkbookSnapshot = {
  schemaVersion: 1,
  workbook: { activeSheet: "new" },
  sheets: [
    {
      id: "new",
      name: "Imported",
      order: 0,
      rowCount: 1,
      columns: [{ key: "value", header: "Value", width: 100, type: "number" }],
      cells: [
        {
          startRow: 0,
          startCol: 0,
          rowCount: 1,
          colCount: 1,
          cells: [{ rowOffset: 0, colOffset: 0, value: { kind: "literal", value: 42 } }],
        },
      ],
    },
  ],
};

let grid: Grid;
let host: HTMLDivElement;
let restore: () => void;

beforeAll(async () => {
  await initSheetwrite();
});
beforeEach(() => {
  restore = installCanvasTestStubs();
  host = document.createElement("div");
  document.body.append(host);
  grid = createGrid(host, { workbook: makeWorkbook(), data: makeColumnarData() });
});
afterEach(() => {
  grid.destroy();
  host.remove();
  restore();
  setXlsxWorkbookBackend(null);
});

it.each(["new", "s1"])(
  "replaces the document on sheet %s in the same grid and clears history",
  async (id) => {
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 0 },
          value: { kind: "literal", value: "edited" },
        },
      ],
    });
    expect(grid.getCommandState("undo").disabled).toBe(false);
    const viewport = host.querySelector(".sheetwrite-viewport");
    await grid.importWorkbook({
      ...IMPORTED,
      workbook: { activeSheet: id },
      sheets: IMPORTED.sheets.map((sheet) => ({ ...sheet, id })),
    });

    expect(grid.getActiveSheet()).toBe(id);
    expect(grid.store.getCell({ sheet: id, row: 0, col: 0 }).resolved).toBe(42);
    expect(grid.exportSnapshot().sheets.map((sheet) => sheet.id)).toEqual([id]);
    expect(grid.getCellInput(1, 0)).toBeNull();
    expect(host.querySelector(".sheetwrite-viewport")).toBe(viewport);
    expect(grid.getCommandState("undo").disabled).toBe(true);
    expect(grid.getCommandState("redo").disabled).toBe(true);
  },
);

it("keeps the old document and history when parsing or validation fails", async () => {
  grid.applyTransaction({
    patches: [
      {
        op: "set",
        addr: { sheet: "s1", row: 0, col: 0 },
        value: { kind: "literal", value: "edited" },
      },
    ],
  });
  const before = grid.exportSnapshot();
  await expect(
    grid.importWorkbook(async () => {
      throw new Error("broken ZIP");
    }),
  ).rejects.toThrow("broken ZIP");
  await expect(grid.importWorkbook({ ...IMPORTED, sheets: [] })).rejects.toThrow();
  expect(grid.exportSnapshot()).toEqual(before);
  expect(grid.getCommandState("undo").disabled).toBe(false);
});

it("aborts the previous loader and ignores its late result", async () => {
  const loaded = Promise.withResolvers<WorkbookSnapshot>();
  const started = Promise.withResolvers<AbortSignal>();
  const first = grid.importWorkbook((signal) => {
    started.resolve(signal);
    return loaded.promise;
  });
  const rejected = first.catch((error: unknown) => error);
  const signal = await started.promise;
  await grid.importWorkbook(IMPORTED);
  expect(signal.aborted).toBe(true);
  loaded.resolve({ ...IMPORTED, workbook: { activeSheet: "s1" } });
  expect(await rejected).toBe(signal.reason);
  expect(grid.getActiveSheet()).toBe("new");
});

it("releases the old engine storage after replacement", async () => {
  const old = storeEngine(grid.store);
  if (!old) throw new Error("Expected owned engine");
  expect(
    old.getRuntimeResourceSnapshot("teardown", "before").wasm.logicalLiveBytes,
  ).toBeGreaterThan(0);

  await grid.importWorkbook(IMPORTED);
  expect(storeEngine(grid.store)).not.toBe(old);
  const released = old.getRuntimeResourceSnapshot("teardown", "after-destroy");
  expect(released.wasm.logicalLiveBytes).toBe(0);
  expect(released.jsOwners).toEqual([]);
});

it.each(["online", "offline"] as const)(
  "blocks replacement while a %s collaboration session is attached",
  async (initialConnection) => {
    const before = grid.exportSnapshot();
    const sync = new SyncCoordinator(grid, new MemoryPersistenceAdapter(), {
      documentId: "sync-doc",
      serverVersion: 0,
      initialConnection,
    });
    await expect(grid.importWorkbook(IMPORTED)).rejects.toMatchObject({ code: "unavailable" });
    expect(grid.exportSnapshot()).toEqual(before);
    sync.destroy();
    await grid.importWorkbook(IMPORTED);
    expect(grid.getActiveSheet()).toBe("new");
  },
);

it.each(["host signal", "destroy"])("aborts a pending loader on %s", async (cause) => {
  const started = Promise.withResolvers<AbortSignal>();
  const loaded = Promise.withResolvers<WorkbookSnapshot>();
  const controller = new AbortController();
  const before = grid.exportSnapshot();
  const pending = grid.importWorkbook(
    (signal) => {
      started.resolve(signal);
      return loaded.promise;
    },
    { signal: controller.signal },
  );
  const rejected = pending.catch((error: unknown) => error);
  const signal = await started.promise;
  if (cause === "destroy") grid.destroy();
  else controller.abort();
  expect(signal.aborted).toBe(true);
  expect(await rejected).toBe(signal.reason);
  if (cause === "host signal") expect(grid.exportSnapshot()).toEqual(before);
});

it("stops an old-document summary before it can read the replacement", async () => {
  const rows = 100_000;
  grid.destroy();
  grid = createGrid(host, { workbook: makeWorkbook(rows), data: makeColumnarData(rows) });
  grid.setSelection({
    kind: "range",
    range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: rows - 1, col: 2 } },
  });
  const read = Promise.withResolvers<void>();
  const getWindow = grid.store.getVisibleWindow.bind(grid.store);
  const observe = spyOn(grid.store, "getVisibleWindow").mockImplementation((...args) => {
    const window = getWindow(...args);
    read.resolve();
    return window;
  });
  const summary = grid.summarizeSelection().catch((error: unknown) => error);
  await read.promise;
  await grid.importWorkbook(IMPORTED);
  const outcome: unknown = await summary;
  expect(outcome).toMatchObject({ name: "AbortError" });
  expect(grid.store.getCell({ sheet: "new", row: 0, col: 0 }).resolved).toBe(42);
  observe.mockRestore();
});

it("offers the accessible File command only with a backend and imports the chosen file", async () => {
  grid.setConfig({ ribbon: true });
  await elementAdded(host, ".sheetwrite-ribbon", HTMLDivElement);
  const fileTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (tab) => tab.textContent === "File",
  );
  if (!fileTab) throw new Error("Expected File tab");
  expect(fileTab.hidden).toBe(true);

  setXlsxWorkbookBackend({
    name: "picker-test",
    fromXlsxWorkbook: async () => IMPORTED,
    toXlsxWorkbook: async () => new Uint8Array(),
  });
  grid.setConfig({ ribbon: { mode: "compact" } });
  await elementAdded(host, '.sheetwrite-ribbon [aria-label="Import XLSX"]', HTMLButtonElement);
  const nextFileTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (tab) => tab.textContent === "File",
  );
  if (!nextFileTab) throw new Error("Expected File tab");
  expect(nextFileTab.hidden).toBe(false);
  nextFileTab.click();
  const command = host.querySelector('[aria-label="Import XLSX"]');
  if (!(command instanceof HTMLButtonElement)) throw new Error("Expected import button");
  expect(command.disabled).toBe(false);
  const pickerAdded = elementAdded(host, 'input[type="file"]', HTMLInputElement);
  command.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  const picker = await pickerAdded;
  expect(picker.getAttribute("aria-label")).toBe("Import XLSX");
  const imported = Promise.withResolvers<void>();
  const stop = grid.on("active-sheet", () => imported.resolve());
  Object.defineProperty(picker, "files", {
    value: { item: () => new File(["xlsx"], "book.xlsx") },
  });
  picker.dispatchEvent(new Event("change"));
  await imported.promise;
  stop();
  expect(grid.store.getCell({ sheet: "new", row: 0, col: 0 }).resolved).toBe(42);
});
