import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { validateTransactionResources } from "../src/document-protocol.js";
import type { XlsxTableExportBackend } from "../src/export.js";
import { setXlsxTableExportBackend } from "../src/export.js";
import {
  AUTO_FIT_CHUNK_CELLS,
  DEFAULT_THEME,
  GridImpl,
  initSheetwrite,
  measureMaxElementHeight,
} from "../src/grid.js";
import { IncompleteDataError, SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { registerGridTransactionAdmission } from "../src/transaction-admission.js";
import type {
  CellScalar,
  ChangeEvent,
  DataSourcePage,
  DataSourceRequest,
  DocumentOp,
  RowData,
  Store,
  Workbook,
} from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

/** A pure-JS Store double; `getCell` is a tripwire for hot-path misuse. */
function makeFakeStore(
  workbook: Workbook,
  hooks: { onGetCell?: () => void; onWindow?: () => void } = {},
): Store {
  return {
    getWorkbook: () => workbook,
    getCell: () => {
      hooks.onGetCell?.();
      throw new Error("Store.getCell must not be called in the render hot path");
    },
    getFormula: () => null,
    getSpillAnchor: () => null,
    getRefTarget: () => null,
    recalculateVolatile: () => {},
    getVisibleWindow: (sheet, rows, cols) => {
      hooks.onWindow?.();
      const n = Math.max(0, (rows.end - rows.start) * cols.length);
      const values: CellScalar[] = new Array(n);
      for (let i = 0; i < n; i++) values[i] = `v${i}`;
      return { sheet, rows, cols, values, styleIds: new Uint32Array(n), styles: [{}] };
    },
    ensureColumns: () => {},
    applyTransaction: () => ({ status: "noop", epoch: 0, reason: "empty" }),
    on: () => () => {},
    viewRowCount: (sheet) => workbook.sheets.find((s) => s.id === sheet)?.rowCount ?? 0,
  };
}

let restoreStubs: () => void;

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreStubs();
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

const WINDOWED_DATASOURCE = { protocol: 2, columns: "windowed" } as const;

function coveredRow(request: DataSourceRequest, values: RowData = {}): RowData {
  const row: RowData = {};
  for (const band of request.columns) {
    for (const key of band.keys) row[key] = values[key] ?? null;
  }
  return row;
}

function coveredPage(request: DataSourceRequest, rows: RowData[]): DataSourcePage {
  return {
    protocol: 2,
    start: request.start,
    columns: request.columns,
    rows: rows.map((row) => coveredRow(request, row)),
  };
}

function expectEditor(host: HTMLElement): HTMLTextAreaElement {
  const node = host.querySelector("textarea.sheetwrite-editor");
  expect(node).toBeInstanceOf(HTMLTextAreaElement);
  if (!(node instanceof HTMLTextAreaElement)) {
    throw new Error("expected grid editor textarea");
  }

  return node;
}

function typeIntoFocusedCell(host: HTMLElement, value: string, key = "Enter"): void {
  host.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

  const editor = expectEditor(host);
  editor.value = value;
  editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

function scrollerOf(host: HTMLElement): HTMLDivElement {
  const node = host.querySelector(".sheetwrite-scroller");
  expect(node).toBeInstanceOf(HTMLDivElement);
  if (!(node instanceof HTMLDivElement)) {
    throw new Error("expected grid scroller");
  }

  return node;
}

function cellPoint(
  row: number,
  col: number,
  workbook: Workbook,
): { clientX: number; clientY: number } {
  const sheet = workbook.sheets[0];
  if (!sheet) throw new Error("expected fixture sheet");

  let x = DEFAULT_THEME.rowHeaderWidth;
  for (let c = 0; c < col; c++) x += sheet.columns[c]?.width ?? 0;
  x += (sheet.columns[col]?.width ?? DEFAULT_THEME.rowHeight) / 2;

  const y =
    DEFAULT_THEME.headerHeight + row * DEFAULT_THEME.rowHeight + DEFAULT_THEME.rowHeight / 2;

  return { clientX: x, clientY: y };
}

describe("Grid editing (Layer 3)", () => {
  beforeAll(async () => {
    await initSheetwrite();
  });

  it("commits a typed edit through the editor into the store", () => {
    const workbook = makeWorkbook(20);
    const store = new SheetwriteStore(workbook, makeColumnarData(20));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 2, col: 0 } });
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    // editor textarea mounts synchronously; well-known DOM node, narrow then read
    const node = host.querySelector("textarea.sheetwrite-editor");
    expect(node).not.toBeNull();
    if (!(node instanceof HTMLTextAreaElement)) return;
    node.value = "Edited!";
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(store.getCell({ sheet: "s1", row: 2, col: 0 }).resolved).toBe("Edited!");
    grid.destroy();
  });

  it("requests the required datasource window fields and consumes its page", async () => {
    const workbook = makeWorkbook(20);
    let captured: DataSourceRequest | undefined;
    const grid = new GridImpl(mountHost(), {
      workbook,
      datasource: {
        capabilities: WINDOWED_DATASOURCE,
        getRows: async (request: DataSourceRequest) => {
          captured ??= request;
          return coveredPage(request, [{ name: "Structured", amount: 7, city: "Paris" }]);
        },
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    if (!captured) throw new Error("datasource request was not issued");
    expect(captured).toMatchObject({
      sheet: "s1",
      protocol: 2,
      start: 0,
      revision: 0,
    });
    expect(captured.end).toBeGreaterThan(captured.start);
    expect(captured.columns).toEqual([{ start: 0, end: 3, keys: ["name", "amount", "city"] }]);
    expect(captured.signal).toBeInstanceOf(AbortSignal);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Structured");
    grid.destroy();
  });

  it("preserves a newer local literal edit when a stale page resolves", async () => {
    const workbook = makeWorkbook(20);
    const { promise, resolve } = Promise.withResolvers<DataSourcePage>();
    let request: DataSourceRequest | undefined;
    const grid = new GridImpl(mountHost(), {
      workbook,
      datasource: {
        capabilities: WINDOWED_DATASOURCE,
        getRows: (next) => {
          request ??= next;
          return promise;
        },
      },
    });
    const addr = { sheet: "s1", row: 0, col: 0 };
    grid.store.applyTransaction({
      patches: [{ op: "set", addr, value: { kind: "literal", value: "local" } }],
    });
    if (!request) throw new Error("datasource request was not issued");
    resolve(coveredPage(request, [{ name: "stale server" }]));
    await promise;
    await Promise.resolve();

    expect(grid.store.getCell(addr).resolved).toBe("local");
    grid.destroy();
  });

  it("starts a new search at the current viewport and wraps when needed", () => {
    const workbook = makeWorkbook(100);
    const store = new SheetwriteStore(workbook, makeColumnarData(100));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);
    const scroller = scrollerOf(host);

    scroller.scrollTop = 50 * DEFAULT_THEME.rowHeight;
    const middle = grid.search("Tokyo");
    expect(middle.matches[middle.active]?.row).toBe(52);

    scroller.scrollTop = 99 * DEFAULT_THEME.rowHeight;
    const wrapped = grid.search("Tokyo");
    expect(wrapped.matches[wrapped.active]?.row).toBe(1);
    grid.destroy();
  });

  it("uses merged-cell anchors for pointer selection and editing", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    grid.setSelection({
      kind: "range",
      range: {
        sheet: "s1",
        start: { row: 0, col: 0 },
        end: { row: 1, col: 1 },
      },
    });
    grid.actions.merge();

    const scroller = scrollerOf(host);
    const covered = cellPoint(1, 1, workbook);
    scroller.dispatchEvent(
      new PointerEvent("pointerdown", { ...covered, button: 0, bubbles: true }),
    );
    scroller.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));

    expect(grid.getSelection()).toEqual({
      kind: "cell",
      addr: { sheet: "s1", row: 0, col: 0 },
    });

    scroller.dispatchEvent(new MouseEvent("dblclick", { ...covered, button: 0, bubbles: true }));
    const editor = expectEditor(host);
    editor.value = "Merged anchor";
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Merged anchor");
    expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBeNull();

    grid.destroy();
  });

  it("undo restores a formula source instead of only its resolved value", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 1 },
          value: { kind: "literal", value: 10 },
        },
        {
          op: "set",
          addr: { sheet: "s1", row: 1, col: 1 },
          value: { kind: "literal", value: 5 },
        },
        {
          op: "set",
          addr: { sheet: "s1", row: 2, col: 1 },
          value: { kind: "formula", src: "=B1+B2*2" },
        },
      ],
    });
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);
    const addr = { sheet: "s1", row: 2, col: 1 };

    grid.setSelection({ kind: "cell", addr });
    typeIntoFocusedCell(host, "7");
    expect(store.getFormula(addr)).toBeNull();
    expect(store.getCell(addr).resolved).toBe(7);

    grid.undo();

    expect(store.getFormula(addr)).toBe("=B1+B2*2");
    expect(store.getCell(addr).resolved).toBe(20);

    grid.destroy();
  });
  it("applies arbitrary patches as one undoable Grid transaction", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const grid = new GridImpl(mountHost(), { workbook }, store);
    const first = { sheet: "s1", row: 0, col: 0 };
    const second = { sheet: "s1", row: 1, col: 1 };
    const events: number[] = [];
    grid.on("change", (event) => events.push(event.transaction.patches.length));

    grid.applyTransaction({
      patches: [
        { op: "set", addr: first, value: { kind: "literal", value: "Batch" } },
        { op: "set", addr: second, value: { kind: "literal", value: 99 } },
      ],
    });

    expect(events).toEqual([2]);
    expect(store.getCell(first).resolved).toBe("Batch");
    expect(store.getCell(second).resolved).toBe(99);

    grid.undo();
    expect(store.getCell(first).resolved).toBe("Customer 0");
    expect(store.getCell(second).resolved).toBe(10.5);

    grid.redo();
    expect(store.getCell(first).resolved).toBe("Batch");
    expect(store.getCell(second).resolved).toBe(99);

    grid.destroy();
  });

  it("resolves pointer coordinates for host-owned context menus", () => {
    const workbook = makeWorkbook(10);
    const store = makeFakeStore(workbook);
    const host = mountHost();
    const grid = new GridImpl(host, { workbook, config: { contextMenu: false } }, store);
    const point = cellPoint(2, 1, workbook);

    expect(grid.getCellAtPoint(point.clientX, point.clientY)).toEqual({
      sheet: "s1",
      row: 2,
      col: 1,
    });
    expect(grid.getCellAtPoint(0, 0)).toBeNull();
    expect(host.querySelector(".sheetwrite-context-menu")).toBeNull();

    grid.destroy();
  });
});

describe("Grid transaction resource ingress", () => {
  beforeAll(async () => {
    await initSheetwrite();
  });

  it("rejects local, remote, and direct-store overflow without state, history, or events", () => {
    const workbook = makeWorkbook(4);
    const grid = new GridImpl(mountHost(), {
      workbook,
      transactionResourceLimits: { maxOperations: 1 },
    });
    const changes: ChangeEvent[] = [];
    let rejectionEvents = 0;
    grid.on("change", (event) => changes.push(event));
    grid.on("mutation-rejected", () => {
      rejectionEvents += 1;
    });
    const first = { sheet: "s1", row: 0, col: 0 };
    const second = { sheet: "s1", row: 1, col: 0 };
    const third = { sheet: "s1", row: 2, col: 0 };

    const accepted = grid.applyTransaction({
      patches: [{ op: "set", addr: first, value: { kind: "literal", value: "accepted" } }],
    });
    expect(accepted.status).toBe("applied");
    if (accepted.status !== "applied") throw new Error("Grid count limit unexpectedly rejected");
    expect(
      validateTransactionResources(accepted.transaction.patches, {
        maxOperations: 1,
        maxEncodedBytes: 8 * 1024 * 1024,
      }).ok,
    ).toBe(true);

    const oversized: DocumentOp[] = [
      { op: "set", addr: second, value: { kind: "literal", value: "blocked" } },
      { op: "set", addr: third, value: { kind: "literal", value: "blocked" } },
    ];
    const local = grid.applyTransaction({ patches: oversized });
    const remote = grid.applyRemoteOperations(oversized);
    const direct = grid.store.applyTransaction({ patches: oversized });
    for (const result of [local, remote, direct]) {
      expect(result).toMatchObject({
        status: "rejected",
        epoch: 1,
        issues: [
          {
            kind: "resource-limit",
            resource: "operations",
            actual: 2,
            max: 1,
          },
        ],
      });
    }
    expect(grid.store.getCell(second).resolved).toBeNull();
    expect(grid.store.getCell(third).resolved).toBeNull();
    expect(changes).toHaveLength(1);
    expect(rejectionEvents).toBe(0);

    grid.undo();
    expect(grid.store.getCell(first).resolved).toBeNull();
    expect(changes).toHaveLength(2);
    expect(rejectionEvents).toBe(0);
    grid.destroy();
  });

  it("re-measures payloads that admission guards rewrote before the store applies them", () => {
    const workbook = makeWorkbook(4);
    const grid = new GridImpl(mountHost(), {
      workbook,
      transactionResourceLimits: { maxEncodedBytes: 128 },
    });
    const changes: ChangeEvent[] = [];
    let rejectionEvents = 0;
    grid.on("change", (event) => changes.push(event));
    grid.on("mutation-rejected", () => {
      rejectionEvents += 1;
    });
    const address = { sheet: "s1", row: 0, col: 0 };
    let rewritePayload = false;
    const disposeGuard = registerGridTransactionAdmission(grid, {
      reserve: (operations) => {
        if (rewritePayload) {
          const patch = operations[0];
          if (patch?.op === "set") {
            patch.value = { kind: "literal", value: "x".repeat(200) };
          }
        }
        return { ok: true, reservation: { cancel: () => {}, finish: () => {} } };
      },
    });

    const accepted = grid.applyTransaction({
      patches: [{ op: "set", addr: address, value: { kind: "literal", value: "first" } }],
    });
    expect(accepted.status).toBe("applied");
    expect(grid.store.getCell(address).resolved).toBe("first");

    rewritePayload = true;
    const rejected = grid.applyTransaction({
      patches: [{ op: "set", addr: address, value: { kind: "literal", value: "first" } }],
    });
    expect(rejected).toMatchObject({
      status: "rejected",
      issues: [{ kind: "resource-limit", resource: "encoded-bytes", max: 128 }],
    });
    if (rejected.status !== "rejected") throw new Error("rewritten payload unexpectedly applied");
    expect(grid.store.getCell(address).resolved).toBe("first");
    expect(changes).toHaveLength(1);
    expect(rejectionEvents).toBe(1);

    disposeGuard();
    grid.destroy();
  });

  it("reports an undo whose restore payload exceeds the limit and still undoes older edits", () => {
    const rows = 200;
    // The forward clear is one small range operation; its undo restores every
    // cleared value, which is well above this limit.
    const grid = new GridImpl(mountHost(), {
      workbook: makeWorkbook(rows),
      data: makeColumnarData(rows),
      transactionResourceLimits: { maxEncodedBytes: 256 },
    });
    const rejections: Array<{ kind: string; resource?: string }> = [];
    grid.on("mutation-rejected", ({ issues }) => {
      for (const issue of issues) {
        rejections.push({
          kind: issue.kind,
          resource: "resource" in issue ? issue.resource : undefined,
        });
      }
    });
    const edited = { sheet: "s1", row: 0, col: 1 };
    const cleared = { sheet: "s1", row: 5, col: 0 };

    expect(
      grid.applyTransaction({
        patches: [{ op: "set", addr: edited, value: { kind: "literal", value: 7 } }],
      }).status,
    ).toBe("applied");
    expect(
      grid.applyTransaction({
        patches: [
          {
            op: "clearRange",
            range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: rows - 1, col: 2 } },
            contents: true,
            style: false,
          },
        ],
      }).status,
    ).toBe("applied");

    grid.undo();
    expect(rejections).toEqual([{ kind: "resource-limit", resource: "encoded-bytes" }]);
    expect(grid.store.getCell(cleared).resolved).toBeNull();

    grid.undo();
    expect(grid.store.getCell(edited).resolved).toBe(0.5);
    expect(grid.store.getCell(cleared).resolved).toBeNull();
    expect(rejections).toHaveLength(1);
    grid.destroy();
  });

  it("undo restores every cell of a text clear above the default wire limit", () => {
    const rows = 1_000;
    const cols = 300;
    const columns = Array.from({ length: cols }, (_, col) => ({
      key: `text${col}`,
      header: `Text ${col}`,
      width: 100,
      type: "text" as const,
    }));
    const grid = new GridImpl(mountHost(), {
      workbook: {
        activeSheet: "s1",
        sheets: [{ id: "s1", name: "Text", rowCount: rows, columns }],
      },
      data: {
        rowCount: rows,
        columns: Object.fromEntries(
          columns.map((column, col) => [
            column.key,
            Array.from(
              { length: rows },
              (_, row) =>
                `Customer record ${String(row * cols + col).padStart(6, "0")} — saved value`,
            ),
          ]),
        ),
      },
    });
    const changes: ChangeEvent[] = [];
    let rejections = 0;
    grid.on("change", (event) => changes.push(event));
    grid.on("mutation-rejected", () => {
      rejections += 1;
    });
    try {
      expect(
        grid.applyTransaction({
          patches: [
            {
              op: "clearRange",
              range: {
                sheet: "s1",
                start: { row: 0, col: 0 },
                end: { row: rows - 1, col: cols - 1 },
              },
              contents: true,
              style: false,
            },
          ],
        }).status,
      ).toBe("applied");
      expect(grid.store.getCell({ sheet: "s1", row: 999, col: 299 }).resolved).toBeNull();
      grid.undo();
      const restored = grid.store.getVisibleWindow(
        "s1",
        { start: 0, end: rows },
        columns.map((_, col) => col),
      ).values;
      let mismatches = 0;
      for (let offset = 0; offset < rows * cols; offset += 1) {
        if (
          restored[offset] !== `Customer record ${String(offset).padStart(6, "0")} — saved value`
        ) {
          mismatches += 1;
        }
      }
      expect(mismatches).toBe(0);
      expect(changes.map((event) => event.commitReason)).toEqual(["api", "undo"]);
      expect(rejections).toBe(0);
      grid.redo();
      expect(grid.store.getCell({ sheet: "s1", row: 999, col: 299 }).resolved).toBeNull();
    } finally {
      grid.destroy();
    }
  }, 30_000);
});

describe("Grid store lifecycle", () => {
  beforeAll(async () => {
    await initSheetwrite();
  });

  it("disposes the store it constructed and leaves a fresh grid usable", () => {
    const host = mountHost();
    const disposeSpy = spyOn(SheetwriteStore.prototype, "dispose");

    // No store injected: the grid constructs and owns its SheetwriteStore, so
    // destroy() must free the underlying WASM CellStore.
    const grid = new GridImpl(host, { workbook: makeWorkbook(20) });
    grid.destroy();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    disposeSpy.mockRestore();

    // Each store owns an independent CellStore, so freeing one must not corrupt
    // a brand-new grid/store built afterwards.
    const host2 = mountHost();
    const grid2 = new GridImpl(host2, { workbook: makeWorkbook(20) });
    expect(() => grid2.store.getCell({ sheet: "s1", row: 0, col: 0 })).not.toThrow();
    grid2.destroy();
  });

  it("does not dispose a caller-provided store on destroy", () => {
    const workbook = makeWorkbook(20);
    const store = new SheetwriteStore(workbook, makeColumnarData(20));
    const host = mountHost();

    // Store injected via the constructor: the caller owns it, so destroy() must
    // leave it alone and fully usable.
    const grid = new GridImpl(host, { workbook }, store);
    const disposeSpy = spyOn(store, "dispose");
    grid.destroy();

    expect(disposeSpy).not.toHaveBeenCalled();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");

    disposeSpy.mockRestore();
    store.dispose();
  });
});

describe("Grid theme contract: setTheme merges, replaceTheme replaces", () => {
  beforeAll(async () => {
    await initSheetwrite();
  });

  it("replaceTheme(undefined) re-reads host CSS custom properties (Tailwind-style)", () => {
    const workbook = makeWorkbook(10);
    const host = mountHost();
    // A Tailwind arbitrary property (`[--sheetwrite-bg:...]`) lands as a
    // custom property on the host; construction and replaceTheme(undefined)
    // must both resolve it.
    host.style.setProperty("--sheetwrite-bg", "#0b0b0c");
    const grid = new GridImpl(host, { workbook }, makeFakeStore(workbook));
    expect(grid.getEffectiveTheme().bg).toBe("#0b0b0c");

    grid.setTheme({ bg: "#ff0000" });
    grid.replaceTheme(undefined);
    expect(grid.getEffectiveTheme().bg).toBe("#0b0b0c");

    grid.destroy();
  });

  it("replaceTheme replaces the whole option value instead of merging", () => {
    const workbook = makeWorkbook(10);
    const grid = new GridImpl(mountHost(), { workbook }, makeFakeStore(workbook));

    grid.replaceTheme({ bg: "#ff0000" });
    grid.replaceTheme({ fg: "#123456" });

    const theme = grid.getEffectiveTheme();
    expect(theme.fg).toBe("#123456");
    expect(theme.bg).toBe(DEFAULT_THEME.bg); // not kept from the previous value

    grid.destroy();
  });

  it("setTheme keeps merging for imperative users", () => {
    const workbook = makeWorkbook(10);
    const grid = new GridImpl(mountHost(), { workbook }, makeFakeStore(workbook));

    grid.setTheme({ bg: "#ff0000" });
    grid.setTheme({ fg: "#123456" });

    const theme = grid.getEffectiveTheme();
    expect(theme.bg).toBe("#ff0000");
    expect(theme.fg).toBe("#123456");

    grid.destroy();
  });
});

describe("ChangeEvent.commitReason", () => {
  beforeAll(async () => {
    await initSheetwrite();
  });

  function reasonsOf(grid: GridImpl): string[] {
    const reasons: string[] = [];
    grid.on("change", (event) => reasons.push(event.commitReason));
    return reasons;
  }

  it("classifies editor commits by gesture: Enter vs blur", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);
    const reasons = reasonsOf(grid);

    grid.beginEdit(0, 0);
    let editor = expectEditor(host);
    editor.value = "by enter";
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    grid.beginEdit(1, 0);
    editor = expectEditor(host);
    editor.value = "by blur";
    editor.dispatchEvent(new FocusEvent("blur"));

    expect(reasons).toEqual(["edit-enter", "edit-blur"]);

    grid.destroy();
    store.dispose();
  });
});

describe("Grid.setOverscan", () => {
  beforeAll(async () => {
    await initSheetwrite();
  });

  it("live-widens the render window on the next frame", () => {
    const workbook = makeWorkbook(200);
    const store = new SheetwriteStore(workbook, makeColumnarData(200));
    const grid = new GridImpl(mountHost(), { workbook, overscan: 0 }, store);
    const windows: Array<{ firstRow: number; lastRow: number }> = [];
    grid.on("scroll", (event) =>
      windows.push({ firstRow: event.firstRow, lastRow: event.lastRow }),
    );

    grid.refresh();
    const before = windows.at(-1)!;

    grid.setOverscan(40);
    grid.refresh();
    const after = windows.at(-1)!;

    // 40 extra rows painted beyond the viewport (bottom edge; top clamps at 0).
    expect(after.lastRow).toBe(before.lastRow + 40);

    // `undefined` restores the DEFAULT_OVERSCAN-based window.
    grid.setOverscan();
    grid.refresh();
    expect(windows.at(-1)!.lastRow).toBeLessThan(after.lastRow);

    grid.destroy();
    store.dispose();
  });
});

describe("Grid.setMinColumns", () => {
  beforeAll(async () => {
    await initSheetwrite();
  });

  it("keeps presentation padding virtual until a padded column is edited", () => {
    const workbook = makeWorkbook(5);
    const store = new SheetwriteStore(workbook, makeColumnarData(5));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);
    let changes = 0;
    grid.on("change", () => {
      changes += 1;
    });

    grid.setMinColumns(12);
    grid.refresh();

    expect(store.getWorkbook().sheets[0]!.columns).toHaveLength(3);
    expect(host.getAttribute("aria-colcount")).toBe("12");
    expect(changes).toBe(0);

    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 10 },
          value: { kind: "literal", value: "materialized" },
        },
      ],
    });
    expect(store.getWorkbook().sheets[0]!.columns).toHaveLength(11);
    expect(store.getCell({ sheet: "s1", row: 0, col: 10 }).resolved).toBe("materialized");
    expect(changes).toBe(1);

    grid.destroy();
    store.dispose();
  });

  it("routes Grid.exportXlsx through the registered table backend", async () => {
    const store = new SheetwriteStore(makeWorkbook(5), makeColumnarData(5));
    const grid = new GridImpl(mountHost(), { workbook: store.getWorkbook() }, store);
    const actionErrors: unknown[] = [];
    grid.on("export-error", (event) => actionErrors.push(event));
    const expected = new Error("fake XLSX export reached");
    let receivedWorkbook: Workbook | undefined;
    let receivedStore: Store | undefined;
    const backend: XlsxTableExportBackend = {
      name: "fake-grid-export",
      toXlsxTable: async (workbook, actualStore) => {
        receivedWorkbook = workbook;
        receivedStore = actualStore;
        throw expected;
      },
    };

    setXlsxTableExportBackend(null as never);
    await expect(grid.exportXlsx("missing.xlsx")).rejects.toMatchObject({
      code: "optional-backend-unavailable",
      operation: "xlsx-export",
    });
    setXlsxTableExportBackend(backend);
    try {
      await expect(grid.exportXlsx("fake.xlsx")).rejects.toMatchObject({
        code: "export-failed",
        operation: "xlsx-export",
        cause: expected,
      });
      expect(receivedWorkbook).toBe(store.getWorkbook());
      expect(receivedStore).toBe(store);
      expect(actionErrors).toEqual([]);
    } finally {
      setXlsxTableExportBackend(null as never);
      grid.destroy();
    }
  });

  it("guards table XLSX export by the backend-selected active sheet only", async () => {
    const workbook = makeWorkbook(5);
    workbook.sheets.push({
      id: "inactive",
      name: "Inactive",
      rowCount: 5,
      columns: workbook.sheets[0]!.columns.map((column) => ({ ...column })),
    });
    const store = new SheetwriteStore(workbook, undefined, {
      storage: "paged",
      chunkRows: 4,
      cacheBytes: 1024,
    });
    store.loadPage(
      "s1",
      0,
      [{ start: 0, end: 3, keys: ["name", "amount", "city"] }],
      Array.from({ length: 5 }, (_, row) => ({
        name: `Customer ${row}`,
        amount: row * 10 + 0.5,
        city: "Tokyo",
      })),
    );
    const grid = new GridImpl(mountHost(), { workbook }, store);
    const reachedBackend = new Error("active sheet passed completeness guard");
    setXlsxTableExportBackend({
      name: "sheet-scoped-completeness",
      toXlsxTable: async () => {
        throw reachedBackend;
      },
    });

    try {
      expect(store.queryCapability("s1").status).toBe("complete");
      expect(store.queryCapability("inactive").status).toBe("incomplete");
      await expect(grid.exportXlsx("active.xlsx")).rejects.toMatchObject({
        code: "export-failed",
        operation: "xlsx-export",
        cause: reachedBackend,
      });

      grid.setActiveSheet("inactive");
      await expect(grid.exportXlsx("incomplete.xlsx")).rejects.toThrow(IncompleteDataError);
    } finally {
      setXlsxTableExportBackend(null as never);
      grid.destroy();
      store.dispose();
    }
  });
});

describe("Grid auto-fit", () => {
  it("matches small geometry while bounding and yielding large row and column reads", () => {
    const text = `${"wide ".repeat(40)}\nsecond wrapped line`;
    const smallWorkbook = makeWorkbook(1);
    const smallStore = new SheetwriteStore(smallWorkbook);
    smallStore.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 0 },
          value: { kind: "literal", value: text },
          style: { wrap: true, fontSize: 18 },
        },
      ],
    });
    const smallGrid = new GridImpl(mountHost(), { workbook: smallWorkbook }, smallStore);
    smallGrid.autoFitRows({
      sheet: "s1",
      start: { row: 0, col: 0 },
      end: { row: 0, col: 0 },
    });
    smallGrid.autoFitColumns([0]);
    const expectedHeight = smallWorkbook.sheets[0]!.rowHeights!.get(0)!;
    const expectedWidth = smallWorkbook.sheets[0]!.columns[0]!.width;

    const rowCount = AUTO_FIT_CHUNK_CELLS + 1;
    const workbook = makeWorkbook(rowCount);
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: rowCount - 1, col: 0 },
          value: { kind: "literal", value: text },
          style: { wrap: true, fontSize: 18 },
        },
      ],
    });
    const grid = new GridImpl(mountHost(), { workbook }, store);
    const changes: ChangeEvent[] = [];
    grid.on("change", (event) => changes.push(event));
    const scheduled = new Map<number, FrameRequestCallback>();
    let nextFrame = 1;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      const frame = nextFrame++;
      scheduled.set(frame, callback);
      return frame;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((frame: number): void => {
      scheduled.delete(frame);
    }) as typeof cancelAnimationFrame;
    const drain = (): void => {
      let steps = 0;
      while (scheduled.size > 0) {
        if (++steps > 100) throw new Error("auto-fit scheduler did not quiesce");
        const [frame, callback] = scheduled.entries().next().value!;
        scheduled.delete(frame);
        callback(steps);
      }
    };
    const expectBoundedReads = (): void => {
      const stats = grid.getAutoFitResourceStats();
      expect(stats.maxWindowCells).toBeLessThanOrEqual(AUTO_FIT_CHUNK_CELLS);
      expect(stats.windowRequests).toBeGreaterThanOrEqual(1);
      expect(stats.windowRequests).toBeLessThanOrEqual(Math.ceil(rowCount / AUTO_FIT_CHUNK_CELLS));
      expect(stats.scheduledChunks).toBeGreaterThanOrEqual(1);
      expect(stats.scheduledChunks).toBeLessThanOrEqual(stats.windowRequests);
    };

    try {
      grid.resetAutoFitResourceStats();
      grid.autoFitRows({
        sheet: "s1",
        start: { row: 0, col: 0 },
        end: { row: rowCount - 1, col: 0 },
      });
      expect(workbook.sheets[0]!.rowHeights).toBeUndefined();
      expect(scheduled.size).toBeGreaterThanOrEqual(1);
      drain();
      expect(workbook.sheets[0]!.rowHeights!.get(rowCount - 1)).toBe(expectedHeight);
      expect(changes).toHaveLength(1);
      expectBoundedReads();
      grid.undo();
      expect(workbook.sheets[0]!.rowHeights!.get(rowCount - 1)).toBeUndefined();
      grid.redo();
      expect(workbook.sheets[0]!.rowHeights!.get(rowCount - 1)).toBe(expectedHeight);

      changes.length = 0;
      grid.resetAutoFitResourceStats();
      grid.autoFitColumns([0]);
      expect(workbook.sheets[0]!.columns[0]!.width).toBe(160);
      expect(scheduled.size).toBeGreaterThanOrEqual(1);
      drain();
      expect(workbook.sheets[0]!.columns[0]!.width).toBe(expectedWidth);
      expect(changes).toHaveLength(1);
      expectBoundedReads();
      grid.undo();
      expect(workbook.sheets[0]!.columns[0]!.width).toBe(160);
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      grid.destroy();
      store.dispose();
      smallGrid.destroy();
      smallStore.dispose();
    }
  });

  it("cancels chunked work on destroy without a late commit", () => {
    const rowCount = AUTO_FIT_CHUNK_CELLS * 2;
    const workbook = makeWorkbook(rowCount);
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: rowCount - 1, col: 0 },
          value: { kind: "literal", value: "never measured ".repeat(20) },
        },
      ],
    });
    const grid = new GridImpl(mountHost(), { workbook }, store);
    const changes: ChangeEvent[] = [];
    grid.on("change", (event) => changes.push(event));
    const scheduled = new Map<number, FrameRequestCallback>();
    let nextFrame = 1;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      const frame = nextFrame++;
      scheduled.set(frame, callback);
      return frame;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((frame: number): void => {
      scheduled.delete(frame);
    }) as typeof cancelAnimationFrame;

    try {
      grid.autoFitColumns([0]);
      const [firstFrame, first] = scheduled.entries().next().value!;
      scheduled.delete(firstFrame);
      first(0);
      const late = scheduled.values().next().value;
      if (!late) throw new Error("expected auto-fit to yield before its second chunk");

      grid.destroy();
      late(1);

      expect(workbook.sheets[0]!.columns[0]!.width).toBe(160);
      expect(changes).toEqual([]);
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      grid.destroy();
      store.dispose();
    }
  });

  it("rejects incomplete paged ranges before measuring loading sentinels", () => {
    const workbook = makeWorkbook(20);
    const store = new SheetwriteStore(workbook, undefined, {
      storage: "paged",
      chunkRows: 4,
      cacheBytes: 1_000_000,
    });
    const grid = new GridImpl(mountHost(), { workbook }, store);
    grid.resetAutoFitResourceStats();

    expect(() =>
      grid.autoFitRows({
        sheet: "s1",
        start: { row: 0, col: 0 },
        end: { row: 19, col: 2 },
      }),
    ).toThrow(IncompleteDataError);
    expect(() => grid.autoFitColumns([0])).toThrow(IncompleteDataError);
    expect(grid.getAutoFitResourceStats()).toMatchObject({
      windowRequests: 0,
      scheduledChunks: 0,
      committedPatches: 0,
    });

    grid.destroy();
    store.dispose();
  });
});

describe("transactional document metadata", () => {
  it("emits and histories merge, row height, freeze, conditional, and group operations", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const grid = new GridImpl(mountHost(), { workbook }, store);
    const events: ChangeEvent[] = [];
    grid.on("change", (event) => events.push(event));

    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
    });
    grid.actions.merge();
    const mergeEvent = events.at(-1);
    if (!mergeEvent) throw new Error("expected merge to emit a transaction");
    const replayWorkbook = makeWorkbook(10);
    const replayStore = new SheetwriteStore(replayWorkbook, makeColumnarData(10));
    const replayGrid = new GridImpl(mountHost(), { workbook: replayWorkbook }, replayStore);
    replayGrid.applyTransaction(mergeEvent.transaction);
    expect(replayWorkbook.sheets[0]!.merges).toEqual(workbook.sheets[0]!.merges);
    for (let row = 0; row <= 1; row++) {
      for (let col = 0; col <= 1; col++) {
        const addr = { sheet: "s1", row, col };
        expect(replayStore.getCell(addr).resolved).toBe(store.getCell(addr).resolved);
      }
    }
    expect(workbook.sheets[0]!.merges).toEqual([{ r0: 0, c0: 0, r1: 1, c1: 1 }]);
    grid.undo();
    expect(workbook.sheets[0]!.merges).toEqual([]);
    expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBe(10.5);
    grid.redo();
    expect(workbook.sheets[0]!.merges).toEqual([{ r0: 0, c0: 0, r1: 1, c1: 1 }]);
    expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBeNull();

    grid.setRowHeight(2, 44);
    expect(events.at(-1)?.transaction.patches[0]).toEqual({
      op: "setRowMeta",
      sheet: "s1",
      row: 2,
      meta: { height: 44 },
    });
    expect(workbook.sheets[0]!.rowHeights?.get(2)).toBe(44);
    grid.undo();
    expect(workbook.sheets[0]!.rowHeights?.has(2)).toBe(false);
    grid.redo();
    expect(workbook.sheets[0]!.rowHeights?.get(2)).toBe(44);

    grid.setFrozen(2, 1);
    expect(events.at(-1)?.transaction.patches[0]).toMatchObject({
      op: "setSheetMeta",
      sheet: "s1",
      patch: { frozenRows: 2, frozenCols: 1 },
    });
    grid.undo();
    expect(workbook.sheets[0]).toMatchObject({ frozenRows: 0, frozenCols: 0 });
    grid.redo();
    expect(workbook.sheets[0]).toMatchObject({ frozenRows: 2, frozenCols: 1 });

    const rule = {
      range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 9, col: 1 } },
      when: { kind: "greaterThan" as const, value: 10 },
      style: { color: "#ff0000" },
    };
    grid.setConditionalFormats([rule]);
    expect(workbook.sheets[0]!.conditionalFormats).toEqual([rule]);
    grid.undo();
    expect(workbook.sheets[0]!.conditionalFormats).toEqual([]);
    grid.redo();
    expect(workbook.sheets[0]!.conditionalFormats).toEqual([rule]);

    grid.applyTransaction({
      patches: [
        {
          op: "setNamedRange",
          namedRange: {
            name: "Totals",
            range: {
              sheet: "s1",
              start: { row: 0, col: 1 },
              end: { row: 2, col: 1 },
            },
          },
        },
        {
          op: "setNamedRange",
          namedRange: {
            name: "Totals",
            scope: "s1",
            range: {
              sheet: "s1",
              start: { row: 0, col: 2 },
              end: { row: 2, col: 2 },
            },
          },
        },
      ],
    });
    expect(workbook.namedRanges).toHaveLength(2);
    grid.undo();
    expect(workbook.namedRanges).toEqual([]);
    grid.redo();
    expect(workbook.namedRanges).toHaveLength(2);
    grid.applyTransaction({
      patches: [{ op: "removeNamedRange", name: "Totals", scope: "s1" }],
    });
    expect(workbook.namedRanges).toHaveLength(1);
    grid.undo();
    expect(workbook.namedRanges).toHaveLength(2);

    grid.groupRows(3, 5);
    grid.setGroupCollapsed(3, true);
    expect(workbook.sheets[0]!.rowGroups).toEqual([{ start: 3, end: 5, collapsed: true }]);
    expect(grid.store.viewRowCount("s1")).toBe(7);
    grid.undo();
    expect(workbook.sheets[0]!.rowGroups).toEqual([{ start: 3, end: 5, collapsed: false }]);

    replayGrid.destroy();
    replayStore.dispose();
    grid.destroy();
    store.dispose();
  });

  it("supports add, rename, reorder, remove, and lossless undo for cross-sheet formulas", () => {
    const workbook: Workbook = {
      activeSheet: "summary",
      sheets: [
        {
          id: "source",
          name: "Sales",
          rowCount: 2,
          columns: [{ key: "value", header: "Value", width: 100, type: "number" }],
        },
        {
          id: "summary",
          name: "Summary",
          rowCount: 2,
          columns: [{ key: "result", header: "Result", width: 100, type: "number" }],
        },
      ],
    };
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "source", row: 0, col: 0 },
          value: { kind: "literal", value: 4 },
        },
        {
          op: "set",
          addr: { sheet: "summary", row: 0, col: 0 },
          value: { kind: "formula", src: "=Sales!A1+1" },
        },
      ],
    });
    const grid = new GridImpl(mountHost(), { workbook }, store);
    const events: ChangeEvent[] = [];
    grid.on("change", (event) => events.push(event));

    const notes = grid.addSheet({ id: "notes", name: "Notes", rowCount: 3 });
    expect(notes.sheet).toBe("notes");
    expect(workbook.sheets.map((sheet) => sheet.id)).toEqual(["source", "summary", "notes"]);
    expect(events.at(-1)?.transaction.patches[0]?.op).toBe("addSheet");
    grid.undo();
    expect(workbook.sheets.map((sheet) => sheet.id)).toEqual(["source", "summary"]);
    grid.redo();
    expect(workbook.sheets.map((sheet) => sheet.id)).toEqual(["source", "summary", "notes"]);

    grid.renameSheet("source", "Sales Data");
    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("=('Sales Data'!A1+1)");
    grid.undo();
    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("=(Sales!A1+1)");
    grid.redo();
    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("=('Sales Data'!A1+1)");

    grid.moveSheet("source", 1);
    expect(workbook.sheets.map((sheet) => sheet.id)).toEqual(["summary", "source", "notes"]);
    grid.undo();
    expect(workbook.sheets.map((sheet) => sheet.id)).toEqual(["source", "summary", "notes"]);

    grid.removeSheet("source");
    expect(workbook.sheets.map((sheet) => sheet.id)).toEqual(["summary", "notes"]);
    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("=(#REF!+1)");
    expect(store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe("#REF!");
    grid.undo();
    expect(workbook.sheets.map((sheet) => sheet.id)).toEqual(["source", "summary", "notes"]);
    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("=('Sales Data'!A1+1)");
    expect(store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe(5);
    grid.redo();
    expect(workbook.sheets.map((sheet) => sheet.id)).toEqual(["summary", "notes"]);
    expect(store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe("#REF!");

    grid.destroy();
    store.dispose();
  });

  it("histories validation, protection, notes, filters, and column visibility", () => {
    const workbook = makeWorkbook(6);
    const store = new SheetwriteStore(workbook, makeColumnarData(6));
    const grid = new GridImpl(mountHost(), { workbook }, store);
    const range = { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 3, col: 0 } };

    expect(
      grid.setValidationRule({
        id: "status",
        range,
        condition: { kind: "list", values: ["Ready", "Blocked"] },
        policy: "reject",
      }).status,
    ).toBe("applied");
    expect(workbook.sheets[0]!.validationRules).toHaveLength(1);
    grid.undo();
    expect(workbook.sheets[0]!.validationRules).toEqual([]);
    grid.redo();
    expect(workbook.sheets[0]!.validationRules).toHaveLength(1);

    grid.setProtectedRange({ id: "locked", range: { ...range, start: { row: 4, col: 0 } } });
    expect(workbook.sheets[0]!.protectedRanges).toHaveLength(1);
    grid.undo();
    expect(workbook.sheets[0]!.protectedRanges).toEqual([]);

    const noteAddr = { sheet: "s1", row: 2, col: 2 };
    grid.setNote(noteAddr, "Check source");
    expect(grid.getNote(noteAddr)).toBe("Check source");
    grid.undo();
    expect(grid.getNote(noteAddr)).toBeNull();
    grid.redo();
    expect(grid.getNote(noteAddr)).toBe("Check source");

    grid.setColumnFilter(0, { kind: "contains", text: "Customer" });
    expect(grid.getColumnFilters().get(0)).toEqual({ kind: "contains", text: "Customer" });
    grid.undo();
    expect(grid.getColumnFilters().has(0)).toBe(false);

    grid.hideColumns([1]);
    expect(grid.hiddenColumns()).toEqual([1]);
    grid.undo();
    expect(grid.hiddenColumns()).toEqual([]);
    grid.actions.hideColumns([2]);
    expect(grid.hiddenColumns()).toEqual([2]);
    grid.actions.showColumns();
    expect(grid.hiddenColumns()).toEqual([]);

    grid.destroy();
    store.dispose();
  });

  it("emits structured mutation rejection events for protected and invalid writes", () => {
    const workbook = makeWorkbook(3);
    workbook.sheets[0]!.validationRules = [
      {
        id: "positive",
        range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 2, col: 1 } },
        condition: { kind: "number", min: 0 },
        policy: "reject",
      },
    ];
    workbook.sheets[0]!.protectedRanges = [
      {
        id: "locked",
        range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 2, col: 0 } },
      },
    ];
    const store = new SheetwriteStore(workbook);
    const grid = new GridImpl(mountHost(), { workbook }, store);
    const events: string[][] = [];
    grid.on("mutation-rejected", ({ issues }) => {
      events.push(issues.map((issue) => issue.kind));
    });

    expect(
      grid.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: "s1", row: 0, col: 0 },
            value: { kind: "literal", value: "x" },
          },
        ],
      }).status,
    ).toBe("rejected");
    expect(
      grid.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: "s1", row: 0, col: 1 },
            value: { kind: "literal", value: -1 },
          },
        ],
      }).status,
    ).toBe("rejected");
    expect(events).toEqual([["protection"], ["validation"]]);

    grid.setProtectionResolver(() => "allow");
    expect(
      grid.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: "s1", row: 0, col: 0 },
            value: { kind: "literal", value: "x" },
          },
        ],
      }).status,
    ).toBe("applied");

    grid.destroy();
    store.dispose();
  });

  it("keeps every document metadata action inert in read-only mode", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const grid = new GridImpl(mountHost(), { workbook, readOnly: true }, store);
    let changes = 0;
    grid.on("change", () => {
      changes += 1;
    });
    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
    });

    grid.actions.merge();
    grid.setRowHeight(0, 99);
    grid.setFrozen(2, 1);
    grid.groupRows(1, 3);
    grid.hideRows([1]);
    grid.addSheet({ id: "blocked", name: "Blocked" });
    grid.renameSheet("s1", "Blocked");
    grid.removeSheet("s1");
    grid.setValidationRule({
      id: "blocked-rule",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
      condition: { kind: "list", values: ["x"] },
      policy: "reject",
    });
    grid.setProtectedRange({
      id: "blocked-protection",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
    });
    grid.setNote({ sheet: "s1", row: 0, col: 0 }, "blocked");
    grid.hideColumns([1]);
    grid.setColumnFilter(0, { kind: "contains", text: "blocked" });

    expect(changes).toBe(0);
    expect(workbook.sheets).toHaveLength(1);
    expect(workbook.sheets[0]).toMatchObject({ name: "Sheet 1" });
    expect(workbook.sheets[0]!.merges ?? []).toEqual([]);
    expect(workbook.sheets[0]!.rowHeights).toBeUndefined();
    expect(workbook.sheets[0]!.frozenRows).toBeUndefined();
    expect(workbook.sheets[0]!.rowGroups).toBeUndefined();
    expect(workbook.sheets[0]!.hiddenRows).toBeUndefined();
    expect(workbook.sheets[0]!.validationRules).toBeUndefined();
    expect(workbook.sheets[0]!.protectedRanges).toBeUndefined();
    expect(workbook.sheets[0]!.notes).toBeUndefined();
    expect(workbook.sheets[0]!.columns[1]!.visible).toBeUndefined();
    expect(workbook.sheets[0]!.filters).toBeUndefined();

    grid.destroy();
    store.dispose();
  });
});

describe("element height cap measurement", () => {
  const stubDocument = (layoutClamp: number, scrollClamp = Number.POSITIVE_INFINITY): Document => {
    const clientHeight = 32;
    const scroller = {
      style: { cssText: "" },
      clientHeight,
      append: () => {},
      remove: () => {},
      _scrollTop: 0,
      get scrollTop() {
        return this._scrollTop;
      },
      set scrollTop(value: number) {
        // Engines clamp assignments to the real maximum scroll offset.
        this._scrollTop = Math.min(value, Math.max(0, scrollClamp - clientHeight));
      },
    };
    const sizer = {
      style: { cssText: "" },
      getBoundingClientRect: () => ({ height: layoutClamp }),
    };
    let calls = 0;
    return {
      body: { append: () => {} },
      createElement: () => (calls++ === 0 ? scroller : sizer),
    } as unknown as Document;
  };

  it("uses the engine's measured clamp minus a safety margin", () => {
    // Chromium at 125% browser zoom clamps near 26.8M CSS px — well below the
    // 33M constant this measurement replaced; trusting the constant left the
    // tail of a 1M-row document unreachable.
    const measuredClamp = 26_843_545.6;
    const cap = measureMaxElementHeight(stubDocument(measuredClamp));
    expect(cap).toBeGreaterThan(0);
    expect(cap).toBeLessThan(measuredClamp);
    expect(measureMaxElementHeight(stubDocument(measuredClamp / 2))).toBeLessThan(cap);
  });

  it("falls back to a conservative cap when no clamp can be measured", () => {
    const fallback = measureMaxElementHeight(null);
    expect(fallback).toBeGreaterThan(0);
    expect(fallback).toBeLessThan(26_843_545);
    expect(measureMaxElementHeight(stubDocument(0, 0))).toBe(fallback);
    expect(measureMaxElementHeight(stubDocument(Number.NaN, Number.NaN))).toBe(fallback);
  });
});
