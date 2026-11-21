import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { DEFAULT_THEME, GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellEditor, CellEditorContext, GridOptions, Workbook } from "../src/types.js";
import {
  answerDialog,
  makeColumnarData,
  makeWorkbook,
  mountHost,
  pressLikeWebKit,
} from "./fixtures.js";

let restoreCanvas: () => void;
let reportErrorDescriptor: PropertyDescriptor | undefined;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  reportErrorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "reportError");
  restoreCanvas = installCanvasTestStubs();
});

const mounted: { grid: GridImpl; store: SheetwriteStore }[] = [];

afterEach(() => {
  for (const { grid, store } of mounted.splice(0)) {
    grid.destroy();
    store.dispose();
  }
  restoreCanvas();
  if (reportErrorDescriptor) {
    Object.defineProperty(globalThis, "reportError", reportErrorDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "reportError");
  }
  document.body.innerHTML = "";
});

/** A grid over a store of `options.workbook` filled with `makeColumnarData`. */
function mountGrid(options: GridOptions & { workbook: Workbook }) {
  const { workbook } = options;
  const store = new SheetwriteStore(workbook, makeColumnarData(workbook.sheets[0]!.rowCount));
  const host = mountHost();
  const grid = new GridImpl(host, options, store);
  mounted.push({ grid, store });
  return { grid, store, host };
}

it("shows a list cell's dropdown arrow, opens the list from it or by typing, and edits text on F2", () => {
  const requestFrame = globalThis.requestAnimationFrame;
  // Paint at once, so the test reads the state that the next frame shows.
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    callback(0);
    return 0;
  };
  const workbook = makeWorkbook(4);
  workbook.sheets[0]!.validationRules = [
    {
      id: "region",
      range: { sheet: "s1", start: { row: 1, col: 1 }, end: { row: 2, col: 1 } },
      condition: { kind: "list", values: ["North", "South", "West", "South-West"] },
      policy: "reject",
    },
  ];
  const { grid, store, host } = mountGrid({ workbook });
  const press = (target: Element | null, key: string) =>
    target?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  const options = () =>
    [...host.querySelectorAll('[role="option"]')].map((item) => item.textContent);

  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 1 } });
  expect(host.querySelector(".sheetwrite-list-button")).toBeNull();
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 1 } });
  const button = host.querySelector<HTMLElement>(".sheetwrite-list-button");
  expect(button).not.toBeNull();
  // The arrow sits just right of B2, as in Excel.
  const cellRight = DEFAULT_THEME.rowHeaderWidth + 160 + 120;
  expect(button?.style.left).toBe(`${cellRight}px`);

  const scroller = host.querySelector(".sheetwrite-scroller");
  const click = new PointerEvent("pointerdown", {
    // The middle of the arrow, clear of the fill handle at the cell's corner.
    clientX: cellRight + 9,
    clientY: DEFAULT_THEME.headerHeight + 2 * DEFAULT_THEME.rowHeight - 9,
    button: 0,
    pointerType: "mouse",
    bubbles: true,
    cancelable: true,
  });
  scroller?.dispatchEvent(click);
  expect(options()).toEqual(["North", "South", "West", "South-West"]);
  expect(grid.getSelection()).toEqual({ kind: "cell", addr: { sheet: "s1", row: 1, col: 1 } });
  press(host.querySelector('[role="combobox"]'), "Escape");
  expect(host.querySelector('[role="listbox"]')).toBeNull();

  press(host, "w");
  const box = host.querySelector<HTMLInputElement>('[role="combobox"]');
  expect(box?.value).toBe("w");
  if (box) {
    box.value = "we";
    box.dispatchEvent(new Event("input", { bubbles: true }));
  }
  expect(options()).toEqual(["West", "South-West"]);
  press(box, "ArrowDown");
  press(box, "Enter");
  expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBe("West");

  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 1 } });
  press(host, "F2");
  expect(host.querySelector('[role="listbox"]')).toBeNull();
  expect(host.querySelector<HTMLTextAreaElement>("textarea.sheetwrite-editor")?.value).toBe("West");
  globalThis.requestAnimationFrame = requestFrame;
});

it("removes grid DOM when disposing its owned store fails", () => {
  const host = mountHost();
  const grid = new GridImpl(host, { workbook: makeWorkbook(3) });
  const store = grid.store;
  if (!(store instanceof SheetwriteStore)) throw new Error("owned store missing");
  const dispose = store.dispose.bind(store);
  store.dispose = () => {
    dispose();
    throw new Error("dispose failed");
  };

  expect(() => grid.destroy()).toThrow("dispose failed");
  expect(host.childElementCount).toBe(0);
  expect(host.classList.contains("sheetwrite")).toBe(false);
  expect(() => grid.destroy()).not.toThrow();
});

it("updates aria-rowcount when rows are inserted", () => {
  const requestFrame = globalThis.requestAnimationFrame;
  // Paint at once, so the test reads the state that the next frame shows.
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    callback(0);
    return 0;
  };
  const { grid, host } = mountGrid({ workbook: makeWorkbook(3) });
  try {
    grid.applyTransaction({ patches: [{ op: "addRows", sheet: "s1", at: 0, count: 2 }] });

    expect(host.querySelector('[role="grid"]')?.getAttribute("aria-rowcount")).toBe("6");
  } finally {
    globalThis.requestAnimationFrame = requestFrame;
  }
});

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

describe("custom editor canonical lifecycle", () => {
  it("parses commits, enforces validation/protection, updates, histories, navigates, and restores focus", async () => {
    const workbook = withEditors(makeWorkbook(2));
    const stats = editorStats();
    const { grid, store, host } = mountGrid({
      workbook,
      presentation: "data-grid",
      editors: { input: inputEditor(stats) },
    });
    const rejected: string[][] = [];
    let changes = 0;
    grid.on("mutation-rejected", ({ issues }) => rejected.push(issues.map((issue) => issue.kind)));
    grid.on("change", () => {
      changes += 1;
    });

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
    press(input, "Enter");
    expect(store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).toBe(42);
    expect(grid.getSelection()).toEqual({
      kind: "cell",
      addr: { sheet: "s1", row: 1, col: 1 },
    });
    expect(changes).toBeGreaterThanOrEqual(2);
    expect(document.activeElement).toBe(host);

    grid.undo();
    expect(store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).toBe(7);

    grid.beginEdit(0, 1);
    input = activeEditorInput(host);
    input.value = "-1";
    press(input, "Tab");
    // The rule's Stop alert refuses the entry before it reaches the store.
    await answerDialog(host, "Cancel");
    expect(store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).toBe(7);
    expect(rejected).toEqual([]);

    grid.beginEdit(0, 0);
    input = activeEditorInput(host);
    input.value = "blocked";
    press(input, "Enter");
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");
    expect(rejected.at(-1)).toEqual(["protection"]);

    grid.beginEdit(1, 2, "B", false);
    input = activeEditorInput(host);
    press(input, "Escape");
    expect(stats.cancels).toBe(1);
    expect(document.activeElement).toBe(host);
    await Promise.resolve();
    expect(stats.mounts).toBe(4);
    expect(stats.destroys).toBe(4);
  });

  it("cancels rejected and invalid custom-editor commit results without mutation", async () => {
    const workbook = makeWorkbook(1);
    workbook.sheets[0]!.columns[0]!.editor = "boundary";
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
    const { grid, store, host } = mountGrid({ workbook, editors: { boundary: editor } });

    for (let index = 0; index < 2; index += 1) {
      grid.beginEdit(0, 0);
      press(activeEditorInput(host), "Enter");
      await Promise.resolve();
      await Promise.resolve();
      expect(host.querySelector(".sheetwrite-custom-editor")).toBeNull();
      expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");
    }
    expect({ cancels, destroys }).toEqual({ cancels: 2, destroys: 2 });

    grid.beginEdit(0, 0);
    expect(() => latestContext?.commit(42 as never)).not.toThrow();
    expect(latestContext?.signal.aborted).toBe(true);
    expect(host.querySelector(".sheetwrite-custom-editor")).toBeNull();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");
    expect({ cancels, destroys }).toEqual({ cancels: 3, destroys: 3 });
  });

  it("keeps a custom editor open for a press on its own button that does not focus the button", () => {
    const workbook = makeWorkbook(1);
    workbook.sheets[0]!.columns[0]!.editor = "stepper";
    let commits = 0;
    let steps = 0;
    const editor: CellEditor = {
      mount(root) {
        const input = document.createElement("input");
        const step = document.createElement("button");
        step.type = "button";
        step.addEventListener("click", () => {
          steps += 1;
        });
        root.append(input, step);
        return {
          update() {},
          reposition() {},
          commit() {
            commits += 1;
            return input.value;
          },
          cancel() {},
          destroy() {},
        };
      },
    };
    const { grid, host } = mountGrid({ workbook, editors: { stepper: editor } });

    grid.beginEdit(0, 0);
    expect(document.activeElement).toBe(activeEditorInput(host));
    pressLikeWebKit(host.querySelector<HTMLButtonElement>(".sheetwrite-custom-editor button")!);
    expect({ commits, steps }).toEqual({ commits: 0, steps: 1 });
    expect(host.querySelector(".sheetwrite-custom-editor")).not.toBeNull();
    press(activeEditorInput(host), "Enter");
    expect(commits).toBe(1);
  });

  it("keeps async commits bound to their canonical row through sort, clearView, and filter", async () => {
    for (const viewChange of ["sort", "clearView", "filter"] as const) {
      const workbook = makeWorkbook(3);
      workbook.sheets[0]!.columns[0]!.editor = "pending";
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
      const { grid, store, host } = mountGrid({ workbook, editors: { pending: editor } });
      if (viewChange === "clearView") grid.setViewSort([{ col: 1, ascending: false }]);
      grid.beginEdit(0, 0);
      const originalDataRow = viewChange === "clearView" ? 2 : 0;
      const otherDataRow = viewChange === "clearView" ? 0 : 2;
      const committed: CellEditorContext["address"][] = [];
      grid.on("edit-commit", ({ addr }) => {
        committed.push(addr);
      });
      press(activeEditorInput(host), "Enter");

      if (viewChange === "clearView") grid.clearView();
      else if (viewChange === "filter") grid.filterBy(0, "Customer 0");
      else grid.setViewSort([{ col: 1, ascending: false }]);
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
    }
  });

  /** Press `key` on `target`, as a user does. */
  const press = (target: HTMLElement, key: string): void => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  };

  /**
   * Open the editor of the cell at view row 0, column A: a list rule's list
   * opens on Alt+Down, as in Excel; F2 would edit its text.
   */
  const openEditor = (grid: GridImpl, host: HTMLElement, kind: string): void => {
    if (kind !== "list") {
      grid.beginEdit(0, 0);
      return;
    }
    // The selection, like `beginEdit`, takes the row as shown.
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
    host.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    // Alt+Down opens the list and keeps the selection where it is.
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
  };

  /** The field each kind of editor shows. */
  const EDITOR_FIELD = {
    stock: "textarea.sheetwrite-editor",
    list: '[role="combobox"]',
    checkbox: '[role="checkbox"]',
    custom: ".sheetwrite-custom-editor input",
  } as const;

  /** Give column A of `workbook` a list or checkbox rule whose chosen value is `choice`. */
  const choiceRule = (
    workbook: Workbook,
    kind: keyof typeof EDITOR_FIELD,
    choice: string,
    policy: "warn" | "reject",
  ): void => {
    if (kind !== "list" && kind !== "checkbox") return;
    workbook.sheets[0]!.validationRules = [
      {
        id: "choice",
        range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 2, col: 0 } },
        condition:
          kind === "list"
            ? { kind: "list", values: [choice] }
            : { kind: "checkbox", checkedValue: choice, uncheckedValue: "Unchecked" },
        policy,
      },
    ];
  };

  for (const editorKind of ["stock", "list", "checkbox"] as const) {
    for (const viewChange of ["sort", "clearView", "filter"] as const) {
      it(`commits the ${editorKind} editor to its canonical row after ${viewChange}`, () => {
        const workbook = makeWorkbook(3);
        choiceRule(workbook, editorKind, "Edited choice", "warn");
        const { grid, store, host } = mountGrid({ workbook });
        if (viewChange !== "sort") grid.setViewSort([{ col: 1, ascending: false }]);
        openEditor(grid, host, editorKind);
        const selector = EDITOR_FIELD[editorKind];
        const editor = host.querySelector<HTMLElement>(selector);
        if (!editor) throw new Error(`${editorKind} editor missing`);
        if (editor instanceof HTMLTextAreaElement) editor.value = "Edited choice";
        const committed: CellEditorContext["address"][] = [];
        grid.on("edit-commit", ({ addr }) => committed.push(addr));

        if (viewChange === "clearView") grid.clearView();
        else if (viewChange === "filter") grid.filterBy(0, "Customer 2");
        else grid.setViewSort([{ col: 1, ascending: false }]);
        expect(host.querySelector(selector)).toBe(editor);
        if (editorKind === "list") press(editor, "ArrowDown");
        press(editor, editorKind === "checkbox" ? " " : "Enter");

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
      });
    }
  }

  it("cancels every editor when filtering removes its canonical row, including pending custom commits", async () => {
    for (const editorKind of ["stock", "list", "checkbox", "custom"] as const) {
      const workbook = makeWorkbook(3);
      choiceRule(workbook, editorKind, "Stale choice", "reject");
      const stats = editorStats();
      const pending = Promise.withResolvers<string>();
      const custom = inputEditor(stats);
      if (editorKind === "custom") workbook.sheets[0]!.columns[0]!.editor = "pending";
      const { grid, store, host } = mountGrid({
        workbook,
        editors: {
          pending: {
            mount(root, context) {
              const session = custom.mount(root, context);
              return { ...session, commit: () => pending.promise };
            },
          },
        },
      });
      const committed: unknown[] = [];
      grid.on("edit-commit", (event) => committed.push(event));
      openEditor(grid, host, editorKind);
      const selector = EDITOR_FIELD[editorKind];
      const editor = host.querySelector<HTMLElement>(selector);
      if (!editor) throw new Error(`${editorKind} editor missing`);
      if (editor instanceof HTMLTextAreaElement) editor.value = "Stale choice";
      if (editorKind === "custom") press(editor, "Enter");

      grid.filterBy(0, "Customer 2");
      expect(host.querySelector(selector)).toBeNull();
      if (editorKind === "list") press(editor, "ArrowDown");
      press(editor, editorKind === "checkbox" ? " " : "Enter");
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
    }
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
      const stats = editorStats();
      const { grid, store, host } = mountGrid({ workbook, editors: { input: inputEditor(stats) } });
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
    press(activeEditorInput(host), "Escape");
    expect(hookSignals).toEqual([true, true]);
    expect(host.querySelector(".sheetwrite-custom-editor")).toBeNull();
    expect(document.activeElement).toBe(host);
    expect(reported).toHaveLength(1);

    grid.beginEdit(0, 0);
    expect(() => grid.destroy()).not.toThrow();
    expect(() => grid.destroy()).not.toThrow();
    expect(disposals).toBe(1);
    expect(reported).toHaveLength(2);
    expect(host.childElementCount).toBe(0);
  });
});
