import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { toCsv } from "../src/export.js";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellEditor, CellEditorContext, Workbook } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

let restoreCanvas: () => void;
let reportErrorDescriptor: PropertyDescriptor | undefined;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  reportErrorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "reportError");
  restoreCanvas = installCanvasTestStubs();
});

afterEach(() => {
  restoreCanvas();
  if (reportErrorDescriptor) {
    Object.defineProperty(globalThis, "reportError", reportErrorDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "reportError");
  }
  document.body.innerHTML = "";
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 640, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 320, configurable: true });
  document.body.appendChild(host);
  return host;
}

function headers(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>('[role="columnheader"]')].map(
    (header) => header.textContent ?? "",
  );
}

function withEditors(workbook: Workbook): Workbook {
  for (const column of workbook.sheets[0]!.columns) column.editor = "input";
  workbook.sheets[0]!.validationRules = [
    {
      id: "positive",
      range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 1, col: 1 } },
      condition: { kind: "number", min: 0 },
      policy: "reject",
    },
  ];
  workbook.sheets[0]!.protectedRanges = [
    {
      id: "locked",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
    },
  ];
  return workbook;
}

interface EditorStats {
  mounts: number;
  updates: number;
  repositions: number;
  commits: number;
  cancels: number;
  destroys: number;
  contexts: CellEditorContext[];
}

function inputEditor(stats: EditorStats): CellEditor {
  return {
    mount(host, context) {
      stats.mounts += 1;
      stats.contexts.push(context);
      const input = document.createElement("input");
      input.value = context.initialInput ?? context.text;
      host.appendChild(input);
      return {
        update(next) {
          stats.updates += 1;
          stats.contexts.push(next);
        },
        reposition() {
          stats.repositions += 1;
        },
        commit() {
          stats.commits += 1;
          return input.value;
        },
        cancel() {
          stats.cancels += 1;
        },
        destroy() {
          stats.destroys += 1;
          input.remove();
        },
      };
    },
  };
}

function editorStats(): EditorStats {
  return {
    mounts: 0,
    updates: 0,
    repositions: 0,
    commits: 0,
    cancels: 0,
    destroys: 0,
    contexts: [],
  };
}

function activeEditorInput(host: HTMLElement): HTMLInputElement {
  const input = host.querySelector(".sheetwrite-custom-editor input");
  if (!(input instanceof HTMLInputElement)) throw new Error("custom editor input missing");
  return input;
}

describe("semantic presentation contract", () => {
  it("keeps spreadsheet headers positional and data-grid headers semantic without consuming row 0", async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => written.push(value) },
    });

    for (const presentation of ["spreadsheet", "data-grid"] as const) {
      const workbook = makeWorkbook(2);
      const store = new SheetwriteStore(workbook, makeColumnarData(2));
      const host = mountHost();
      const grid = new GridImpl(host, { workbook, presentation }, store);

      expect(headers(host).slice(0, 3)).toEqual(
        presentation === "spreadsheet" ? ["A", "B", "C"] : ["Name", "Amount", "City"],
      );
      const firstCell = host.querySelector<HTMLElement>(
        '[role="row"][aria-rowindex="2"] [role="gridcell"]',
      );
      expect(firstCell?.textContent).toBe("Customer 0");
      expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");
      expect(toCsv(store.getWorkbook().sheets[0]!, store)).toContain(
        "Name,Amount,City\r\nCustomer 0,0.5,Phnom Penh",
      );

      grid.setSelection({
        kind: "range",
        range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 1 } },
      });
      await expect(grid.actions.copy()).resolves.toBe("done");
      expect(written.at(-1)).toBe("Customer 0\t0.5");

      grid.destroy();
      store.dispose();
      host.remove();
    }
    expect(written).toEqual(["Customer 0\t0.5", "Customer 0\t0.5"]);
  });
});

describe("custom editor canonical lifecycle", () => {
  it("parses commits, enforces validation/protection, updates, histories, navigates, and restores focus", async () => {
    const workbook = withEditors(makeWorkbook(2));
    const store = new SheetwriteStore(workbook, makeColumnarData(2));
    const host = mountHost();
    const stats = editorStats();
    const grid = new GridImpl(
      host,
      { workbook, presentation: "data-grid", editors: { input: inputEditor(stats) } },
      store,
    );
    const rejected: string[][] = [];
    const commits: unknown[] = [];
    const changes: unknown[] = [];
    grid.on("mutation-rejected", ({ issues }) => rejected.push(issues.map((issue) => issue.kind)));
    grid.on("edit-commit", (event) => commits.push(event));
    grid.on("change", (event) => changes.push(event));

    grid.beginEdit(0, 1);
    let input = activeEditorInput(host);
    expect(input.getAttribute("aria-label")).toContain("Amount");
    expect(input.getAttribute("aria-label")).toMatch(/\b1\b/);
    expect(stats.contexts[0]?.address).toEqual({ sheet: "s1", row: 0, col: 1 });
    expect(stats.contexts[0]?.value).toBe(0.5);

    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 1 },
          value: { kind: "literal", value: 7 },
        },
      ],
    });
    expect(stats.updates).toBe(1);
    expect(stats.contexts.at(-1)?.value).toBe(7);

    input.value = "42";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).toBe(42);
    expect(grid.getSelection()).toEqual({
      kind: "cell",
      addr: { sheet: "s1", row: 1, col: 1 },
    });
    expect(stats.commits).toBe(1);
    expect(stats.destroys).toBe(1);
    expect(commits).toHaveLength(1);
    expect(changes.length).toBeGreaterThanOrEqual(2);
    expect(document.activeElement).toBe(host);

    grid.undo();
    expect(store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).toBe(7);

    grid.beginEdit(0, 1);
    input = activeEditorInput(host);
    input.value = "-1";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );
    expect(store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).toBe(7);
    expect(rejected.at(-1)).toEqual(["validation"]);

    grid.beginEdit(0, 0);
    input = activeEditorInput(host);
    input.value = "blocked";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");
    expect(rejected.at(-1)).toEqual(["protection"]);

    grid.beginEdit(1, 2, "B", false);
    input = activeEditorInput(host);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(stats.cancels).toBe(1);
    expect(document.activeElement).toBe(host);

    grid.destroy();
    store.dispose();
    await Promise.resolve();
    expect(stats.mounts).toBe(4);
    expect(stats.destroys).toBe(4);
  });

  it("cancels rejected and invalid custom-editor commit results without mutation", async () => {
    const workbook = makeWorkbook(1);
    workbook.sheets[0]!.columns[0]!.editor = "boundary";
    const store = new SheetwriteStore(workbook, makeColumnarData(1));
    const host = mountHost();
    let attempt = 0;
    let cancels = 0;
    let destroys = 0;
    let latestContext: CellEditorContext | undefined;
    const editor: CellEditor = {
      mount(root, context) {
        latestContext = context;
        const input = document.createElement("input");
        root.appendChild(input);
        return {
          update() {},
          reposition() {},
          commit() {
            attempt += 1;
            if (attempt === 1) return Promise.reject(new Error("lookup failed"));
            return null as never;
          },
          cancel() {
            cancels += 1;
          },
          destroy() {
            destroys += 1;
          },
        };
      },
    };
    const grid = new GridImpl(host, { workbook, editors: { boundary: editor } }, store);

    for (let index = 0; index < 2; index += 1) {
      grid.beginEdit(0, 0);
      activeEditorInput(host).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(host.querySelector(".sheetwrite-custom-editor")).toBeNull();
      expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");
    }
    expect({ cancels, destroys }).toEqual({ cancels: 2, destroys: 2 });

    grid.beginEdit(0, 0);
    expect(latestContext).toBeDefined();
    expect(() => latestContext?.commit(42 as never)).not.toThrow();
    expect(latestContext?.signal.aborted).toBe(true);
    expect(host.querySelector(".sheetwrite-custom-editor")).toBeNull();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");
    expect({ cancels, destroys }).toEqual({ cancels: 3, destroys: 3 });

    grid.destroy();
    store.dispose();
  });

  it("keeps async commits bound to their canonical row through sort, clearView, and filter", async () => {
    for (const viewChange of ["sort", "clearView", "filter"] as const) {
      const workbook = makeWorkbook(3);
      workbook.sheets[0]!.columns[0]!.editor = "pending";
      const store = new SheetwriteStore(workbook, makeColumnarData(3));
      const host = mountHost();
      const result = Promise.withResolvers<string>();
      const contexts: CellEditorContext[] = [];
      const editor: CellEditor = {
        mount(root, context) {
          contexts.push(context);
          const input = document.createElement("input");
          root.appendChild(input);
          return {
            update(next) {
              contexts.push(next);
            },
            reposition() {},
            commit: () => result.promise,
            cancel() {},
            destroy() {},
          };
        },
      };
      const grid = new GridImpl(host, { workbook, editors: { pending: editor } }, store);
      if (viewChange === "clearView") grid.sortBy(1, false);
      grid.beginEdit(0, 0);
      const originalDataRow = viewChange === "clearView" ? 2 : 0;
      const otherDataRow = viewChange === "clearView" ? 0 : 2;
      const committed: CellEditorContext["address"][] = [];
      grid.on("edit-commit", ({ addr }) => {
        committed.push(addr);
      });
      activeEditorInput(host).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );

      if (viewChange === "clearView") grid.clearView();
      else if (viewChange === "filter") grid.filterBy(0, "Customer 0");
      else grid.sortBy(1, false);
      const expectedViewRow = viewChange === "filter" ? 0 : 2;
      expect(contexts.at(-1)?.address).toEqual({
        sheet: "s1",
        row: originalDataRow,
        col: 0,
      });
      expect(contexts.at(-1)?.viewAddress.row).toBe(expectedViewRow);

      result.resolve(`${viewChange} target`);
      await result.promise;
      await Promise.resolve();
      expect(store.getCell({ sheet: "s1", row: originalDataRow, col: 0 }).resolved).toBe(
        `${viewChange} target`,
      );
      expect(store.getCell({ sheet: "s1", row: otherDataRow, col: 0 }).resolved).toBe(
        `Customer ${otherDataRow}`,
      );
      expect(committed).toEqual([{ sheet: "s1", row: expectedViewRow, col: 0 }]);

      grid.destroy();
      store.dispose();
      host.remove();
    }
  });

  for (const editorKind of ["stock", "list", "checkbox"] as const) {
    for (const viewChange of ["sort", "clearView", "filter"] as const) {
      it(`commits the ${editorKind} editor to its canonical row after ${viewChange}`, () => {
        const workbook = makeWorkbook(3);
        const sheet = workbook.sheets[0];
        if (!sheet) throw new Error("editor workbook sheet missing");
        if (editorKind !== "stock") {
          sheet.validationRules = [
            {
              id: "choice",
              range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 2, col: 0 } },
              condition:
                editorKind === "list"
                  ? { kind: "list", values: ["Edited choice"] }
                  : {
                      kind: "checkbox",
                      checkedValue: "Edited choice",
                      uncheckedValue: "Unchecked",
                    },
              policy: "warn",
            },
          ];
        }
        const store = new SheetwriteStore(workbook, makeColumnarData(3));
        const host = mountHost();
        const grid = new GridImpl(host, { workbook }, store);
        if (viewChange !== "sort") grid.sortBy(1, false);
        grid.beginEdit(0, 0);
        const selector =
          editorKind === "stock"
            ? "textarea.sheetwrite-editor"
            : editorKind === "list"
              ? '[role="listbox"]'
              : '[role="checkbox"]';
        const editor = host.querySelector<HTMLElement>(selector);
        if (!editor) throw new Error(`${editorKind} editor missing`);
        if (editor instanceof HTMLTextAreaElement) editor.value = "Edited choice";
        const committed: CellEditorContext["address"][] = [];
        grid.on("edit-commit", ({ addr }) => committed.push(addr));

        if (viewChange === "clearView") grid.clearView();
        else if (viewChange === "filter") grid.filterBy(0, "Customer 2");
        else grid.sortBy(1, false);
        expect(host.querySelector(selector)).toBe(editor);
        editor.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: editorKind === "checkbox" ? " " : "Enter",
            bubbles: true,
            cancelable: true,
          }),
        );

        const canonicalRow = viewChange === "sort" ? 0 : 2;
        const otherRow = viewChange === "sort" ? 2 : 0;
        const viewRow = viewChange === "filter" ? 0 : 2;
        expect(store.getCell({ sheet: "s1", row: canonicalRow, col: 0 }).resolved).toBe(
          "Edited choice",
        );
        expect(store.getCell({ sheet: "s1", row: otherRow, col: 0 }).resolved).toBe(
          `Customer ${otherRow}`,
        );
        expect(committed).toEqual([{ sheet: "s1", row: viewRow, col: 0 }]);
        expect(host.querySelector(selector)).toBeNull();
        grid.undo();
        expect(store.getCell({ sheet: "s1", row: canonicalRow, col: 0 }).resolved).toBe(
          `Customer ${canonicalRow}`,
        );
        grid.destroy();
        store.dispose();
        host.remove();
      });
    }
  }

  it("cancels every editor when filtering removes its canonical row, including pending custom commits", async () => {
    for (const editorKind of ["stock", "list", "checkbox", "custom"] as const) {
      const workbook = makeWorkbook(3);
      const sheet = workbook.sheets[0];
      const column = sheet?.columns[0];
      if (!sheet || !column) throw new Error("editor workbook column missing");
      if (editorKind === "list" || editorKind === "checkbox") {
        sheet.validationRules = [
          {
            id: "choice",
            range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 2, col: 0 } },
            condition:
              editorKind === "list"
                ? { kind: "list", values: ["Stale choice"] }
                : { kind: "checkbox", checkedValue: "Stale choice", uncheckedValue: "Unchecked" },
            policy: "reject",
          },
        ];
      }
      const stats = editorStats();
      const pending = Promise.withResolvers<string>();
      const custom = inputEditor(stats);
      if (editorKind === "custom") column.editor = "pending";
      const store = new SheetwriteStore(workbook, makeColumnarData(3));
      const host = mountHost();
      const grid = new GridImpl(
        host,
        {
          workbook,
          editors: {
            pending: {
              mount(root, context) {
                const session = custom.mount(root, context);
                return { ...session, commit: () => pending.promise };
              },
            },
          },
        },
        store,
      );
      const committed: unknown[] = [];
      grid.on("edit-commit", (event) => committed.push(event));
      grid.beginEdit(0, 0);
      const selector =
        editorKind === "stock"
          ? "textarea.sheetwrite-editor"
          : editorKind === "list"
            ? '[role="listbox"]'
            : editorKind === "checkbox"
              ? '[role="checkbox"]'
              : ".sheetwrite-custom-editor input";
      const editor = host.querySelector<HTMLElement>(selector);
      if (!editor) throw new Error(`${editorKind} editor missing`);
      if (editor instanceof HTMLTextAreaElement) editor.value = "Stale choice";
      if (editorKind === "custom") {
        editor.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
          }),
        );
      }

      grid.filterBy(0, "Customer 2");
      expect(host.querySelector(selector)).toBeNull();
      editor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: editorKind === "checkbox" ? " " : "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      pending.resolve("Stale choice");
      await pending.promise;
      await Promise.resolve();
      expect(committed).toEqual([]);
      expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");
      expect(store.getCell({ sheet: "s1", row: 2, col: 0 }).resolved).toBe("Customer 2");
      if (editorKind === "custom") {
        expect(stats.contexts[0]?.signal.aborted).toBe(true);
        expect({ cancels: stats.cancels, destroys: stats.destroys }).toEqual({
          cancels: 1,
          destroys: 1,
        });
      }
      grid.destroy();
      store.dispose();
      host.remove();
    }
  });

  it("notifies beginEdit selection changes before the before-open edit-begin event", () => {
    const workbook = makeWorkbook(3);
    const store = new SheetwriteStore(workbook, makeColumnarData(3));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);
    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
    });
    const events: string[] = [];
    grid.on("selection", ({ selection }) => {
      events.push("selection");
      expect(selection).toEqual({ kind: "cell", addr: { sheet: "s1", row: 1, col: 1 } });
      expect(grid.getSelection()).toEqual(selection);
      expect(host.querySelector("textarea.sheetwrite-editor")).toBeNull();
    });
    grid.on("edit-begin", ({ addr }) => {
      events.push("edit-begin");
      expect(addr).toEqual({ sheet: "s1", row: 1, col: 1 });
      expect(host.querySelector("textarea.sheetwrite-editor")).toBeNull();
    });

    grid.beginEdit(1, 1);
    expect(events).toEqual(["selection", "edit-begin"]);
    expect(host.querySelector("textarea.sheetwrite-editor")).not.toBeNull();
    grid.beginEdit(1, 1);
    expect(events).toEqual(["selection", "edit-begin", "edit-begin"]);
    grid.destroy();
    store.dispose();
  });

  for (const replacement of ["sheet", "editor"] as const) {
    it(`does not mount an obsolete editor after edit-begin replaces the ${replacement}`, () => {
      const workbook = makeWorkbook(3);
      const sheet = workbook.sheets[0];
      const otherSheet = makeWorkbook(3).sheets[0];
      if (!sheet || !otherSheet) throw new Error("editor workbook sheets missing");
      for (const column of sheet.columns) column.editor = "input";
      otherSheet.id = "s2";
      otherSheet.name = "Other sheet";
      workbook.sheets.push(otherSheet);
      const store = new SheetwriteStore(workbook, makeColumnarData(3));
      const host = mountHost();
      const stats = editorStats();
      const grid = new GridImpl(host, { workbook, editors: { input: inputEditor(stats) } }, store);
      const begins: CellEditorContext["address"][] = [];
      grid.on("edit-begin", ({ addr }) => {
        begins.push(addr);
        expect(host.querySelector(".sheetwrite-custom-editor")).toBeNull();
        if (addr.row !== 0) return;
        if (replacement === "sheet") grid.setActiveSheet("s2");
        else grid.beginEdit(1, 0);
      });

      grid.beginEdit(0, 0);
      expect(begins).toEqual(
        replacement === "sheet"
          ? [{ sheet: "s1", row: 0, col: 0 }]
          : [
              { sheet: "s1", row: 0, col: 0 },
              { sheet: "s1", row: 1, col: 0 },
            ],
      );
      expect(stats.mounts).toBe(replacement === "sheet" ? 0 : 1);
      if (replacement === "sheet") {
        expect(host.querySelector(".sheetwrite-custom-editor")).toBeNull();
        expect(grid.getCellInput(0, 0)?.address.sheet).toBe("s2");
      } else {
        expect(stats.contexts[0]?.address).toEqual({ sheet: "s1", row: 1, col: 0 });
        const input = activeEditorInput(host);
        input.value = "Replacement edit";
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
          }),
        );
        expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");
        expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe("Replacement edit");
      }
      grid.destroy();
      store.dispose();
      host.remove();
    });
  }

  it("finishes cancel and Grid teardown when an editor destroy hook throws", () => {
    const reported: unknown[] = [];
    Object.defineProperty(globalThis, "reportError", {
      configurable: true,
      value: (error: unknown) => reported.push(error),
    });
    const workbook = makeWorkbook(1);
    workbook.sheets[0]!.columns[0]!.editor = "hostile";
    const host = mountHost();
    const hookSignals: boolean[] = [];
    let destroys = 0;
    const editor: CellEditor = {
      mount(root, context) {
        root.appendChild(document.createElement("input"));
        return {
          update() {},
          reposition() {},
          commit() {},
          cancel() {
            hookSignals.push(context.signal.aborted);
          },
          destroy() {
            hookSignals.push(context.signal.aborted);
            destroys += 1;
            throw new Error("hostile destroy");
          },
        };
      },
    };
    const grid = new GridImpl(host, {
      workbook,
      data: makeColumnarData(1),
      editors: { hostile: editor },
    });
    const ownedStore = grid.store;
    if (!(ownedStore instanceof SheetwriteStore)) throw new Error("owned store missing");
    const originalDispose = ownedStore.dispose.bind(ownedStore);
    let disposals = 0;
    ownedStore.dispose = () => {
      disposals += 1;
      originalDispose();
    };

    grid.beginEdit(0, 0);
    activeEditorInput(host).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(hookSignals).toEqual([true, true]);
    expect(host.querySelector(".sheetwrite-custom-editor")).toBeNull();
    expect(document.activeElement).toBe(host);
    expect(reported).toHaveLength(1);

    grid.beginEdit(0, 0);
    expect(() => grid.destroy()).not.toThrow();
    expect(() => grid.destroy()).not.toThrow();
    expect(hookSignals).toEqual([true, true, true, true]);
    expect(destroys).toBe(2);
    expect(disposals).toBe(1);
    expect(reported).toHaveLength(2);
    expect(host.classList.contains("sheetwrite")).toBe(false);
    expect(host.getAttribute("role")).toBeNull();
    expect(host.childElementCount).toBe(0);
  });
});

describe("observable command state", () => {
  it("drives undo/redo disabled state and formatting active/mixed ARIA state", async () => {
    const workbook = makeWorkbook(2);
    const store = new SheetwriteStore(workbook, makeColumnarData(2));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook, config: { toolbar: true } }, store);
    const bold = host.querySelector<HTMLButtonElement>(".sheetwrite-tb-bold");
    const undo = host.querySelector<HTMLButtonElement>(".sheetwrite-tb-undo");
    if (!bold || !undo) throw new Error("toolbar controls missing");

    expect(grid.getCommandState("bold")).toEqual({ disabled: true, activity: "inactive" });
    expect(undo.disabled).toBe(true);

    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
    grid.actions.toggleBold();
    await Promise.resolve();
    expect(grid.getCommandState("bold")).toEqual({ disabled: false, activity: "active" });
    expect(bold.getAttribute("aria-pressed")).toBe("true");
    expect(undo.disabled).toBe(false);

    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
    });
    await Promise.resolve();
    expect(grid.getCommandState("bold").activity).toBe("mixed");
    expect(bold.getAttribute("aria-pressed")).toBe("mixed");

    grid.setReadOnly(true);
    await Promise.resolve();
    expect(bold.disabled).toBe(true);
    expect(undo.disabled).toBe(true);

    grid.destroy();
    store.dispose();
  });
});
