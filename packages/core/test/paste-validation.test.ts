import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { DataValidationRule, Range } from "../src/types.js";
import { validationPastePatches } from "../src/validation-transfer.js";
import { makeColumnarData, makeWorkbook, mountHost } from "./fixtures.js";

class FakeClipboardItem {
  readonly types: string[];

  constructor(private readonly entries: Record<string, Blob>) {
    this.types = Object.keys(entries);
  }

  getType(type: string): Promise<Blob> {
    const value = this.entries[type];
    return value ? Promise.resolve(value) : Promise.reject(new Error(`Missing type ${type}`));
  }
}

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
  let items: FakeClipboardItem[] = [];
  let text = "";
  Object.defineProperty(globalThis, "ClipboardItem", { configurable: true, value: FakeClipboardItem });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      write: (written: FakeClipboardItem[]) => {
        items = written;
        return Promise.resolve();
      },
      read: () => Promise.resolve(items),
      writeText: (written: string) => {
        text = written;
        items = [];
        return Promise.resolve();
      },
      readText: () => Promise.resolve(text),
    },
  });
});

afterEach(() => {
  restoreStubs();
  document.body.replaceChildren();
});

function range(r0: number, c0: number, r1: number, c1: number): Range {
  return { sheet: "s1", start: { row: r0, col: c0 }, end: { row: r1, col: c1 } };
}

const regions: DataValidationRule = {
  id: "region",
  range: range(0, 2, 9, 2),
  condition: { kind: "list", values: ["North", "South"] },
  policy: "reject",
};

function mount(keepValidation = false) {
  const workbook = makeWorkbook(10);
  workbook.sheets[0]!.validationRules = [regions];
  const store = new SheetwriteStore(workbook, makeColumnarData(10));
  const host = mountHost();
  const grid = new GridImpl(host, { workbook, config: { paste: { keepValidation } } }, store);
  const rules = () => store.getWorkbook().sheets[0]?.validationRules ?? [];
  const cell = (row: number, col: number) => store.getCell({ sheet: "s1", row, col }).resolved;
  const copyAndPaste = async (from: Range, to: Range): Promise<void> => {
    grid.setSelection({ kind: "range", range: from });
    await grid.actions.copy();
    grid.setSelection({ kind: "range", range: to });
    await grid.actions.paste();
  };
  return { grid, store, host, rules, cell, copyAndPaste };
}

describe("paste and data validation", () => {
  it("lands the values and gives the cells the copied cells' rules, as Excel does", async () => {
    const { grid, store, rules, cell, copyAndPaste } = mount();
    // A2 (no rule) over C4: the value lands and C4 leaves the list rule.
    await copyAndPaste(range(1, 0, 1, 0), range(3, 2, 3, 2));
    expect(cell(3, 2)).toBe("Customer 1");
    expect(rules().map((rule) => rule.range)).toEqual([range(0, 2, 2, 2), range(4, 2, 9, 2)]);

    // C5 (with the rule) over B1: B1 gets the rule.
    await copyAndPaste(range(4, 2, 4, 2), range(0, 1, 0, 1));
    expect(rules().find((rule) => rule.range.start.col === 1)).toMatchObject({
      range: range(0, 1, 0, 1),
      condition: regions.condition,
    });

    grid.undo();
    grid.undo();
    expect(rules()).toEqual([regions]);
    expect(cell(3, 2)).toBe("Berlin");
    grid.destroy();
    store.dispose();
  });

  it("lands an outside value on a rule's cells and keeps the rule", async () => {
    const { grid, store, rules, cell } = mount();
    await navigator.clipboard.writeText("Nowhere");
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 5, col: 2 } });
    await grid.actions.paste();
    expect(cell(5, 2)).toBe("Nowhere");
    expect(rules()).toEqual([regions]);
    grid.destroy();
    store.dispose();
  });

  it("keeps the rules with paste.keepValidation and names the refused cells", async () => {
    const { grid, store, host, rules, cell, copyAndPaste } = mount(true);
    await copyAndPaste(range(1, 0, 4, 0), range(1, 2, 4, 2));
    expect(rules()).toEqual([regions]);
    expect([1, 2, 3, 4].map((row) => cell(row, 2))).toEqual([
      "Tokyo",
      "Berlin",
      "Phnom Penh",
      "Tokyo",
    ]);
    const notice = host.querySelector(".sheetwrite-action-status");
    expect(notice?.textContent).toContain("4 cells refused: C2, C3, C4 and 1 more.");
    const select = notice?.querySelector("button");
    expect(select?.textContent).toBe("Select them");
    select?.click();
    expect(grid.getSelection()).toMatchObject({ kind: "multi" });
    grid.destroy();
    store.dispose();
  });
});

describe("validationPastePatches", () => {
  it("repeats the copied rules over a multiple of the block and transposes them", () => {
    const sheet = { ...makeWorkbook(10).sheets[0]!, validationRules: [] };
    const pieces = [
      { rule: { condition: { kind: "any" as const }, policy: "reject" as const }, rows: [0, 0], cols: [0, 1] },
    ] as const;
    const placed = (options?: { transpose?: boolean }) =>
      validationPastePatches(sheet, pieces, { rows: 1, cols: 2 }, { row: 2, col: 0, rows: 2, cols: 2 }, options).map(
        (patch) => (patch.op === "setValidationRule" ? patch.rule.range : null),
      );
    expect(placed()).toEqual([range(2, 0, 2, 1), range(3, 0, 3, 1)]);
    expect(placed({ transpose: true })).toEqual([range(2, 0, 3, 0), range(2, 1, 3, 1)]);
  });
});
