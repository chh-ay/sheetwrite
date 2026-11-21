import { beforeAll, describe, expect, it } from "bun:test";

import { ClipboardController } from "../src/clipboard-controller.js";
import { DocumentController } from "../src/document-controller.js";
import { initSheetwrite } from "../src/grid.js";
import { Scope } from "../src/scope.js";
import { SelectionModel } from "../src/selection.js";
import { SheetwriteStore } from "../src/store.js";
import type { CellStyle, DocumentOp, PasteSpecialOptions } from "../src/types.js";
import { range, sheet } from "./fixtures.js";

// Excel, "Paste options":
// https://support.microsoft.com/en-us/excel/paste-options

beforeAll(async () => {
  await initSheetwrite();
});

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

/** A grid's clipboard over a real store with sheets `s1` ("Data") and `s2`, 20 rows by A:D. */
function harness() {
  let items: FakeClipboardItem[] = [];
  Object.defineProperty(globalThis, "ClipboardItem", {
    configurable: true,
    value: FakeClipboardItem,
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      write: (next: FakeClipboardItem[]) => {
        items = next;
        return Promise.resolve();
      },
      read: () => Promise.resolve(items),
    },
  });
  const store = new SheetwriteStore({
    activeSheet: "s1",
    sheets: [{ ...sheet("s1", 20), name: "Data" }, sheet("s2", 20)],
  });
  const document = new DocumentController({
    store,
    loadable: store,
    readOnly: () => false,
    epoch: () => 0,
    materializeVirtualColumns: (patches) => patches,
    onMutationRejected: () => {},
    onHistoryApplied: () => {},
  });
  const selection = new SelectionModel(20, 0, 3);
  const lifetime = new Scope();
  let activeSheet = "s1";
  const asked: boolean[] = [];
  const clipboard = new ClipboardController({
    lifetime,
    store,
    selection: () => selection,
    activeSheet: () => activeSheet,
    sheet: () => store.getWorkbook().sheets.find((candidate) => candidate.id === activeSheet)!,
    colIndices: () => [0, 1, 2, 3],
    readOnly: () => false,
    mergeAnchorAt: () => null,
    toDataRow: (row) => row,
    toViewRow: (row) => row,
    undo: () => {
      throw new Error("This harness has no undo history");
    },
    lastUndo: () => null,
    commit: (patches, reason) => {
      return document.commit(patches, reason);
    },
    onCutChange: () => {},
    loadPasteSpecial: () => import("../src/paste-special.js"),
    askPasteSpecial: async (ownCopy) => {
      asked.push(ownCopy);
      return null;
    },
    sheetName: (id) => store.getWorkbook().sheets.find((candidate) => candidate.id === id)?.name,
  });
  const at = (row: number, col: number, sheetId = activeSheet) => ({ sheet: sheetId, row, col });
  const select = (r0: number, c0: number, r1 = r0, c1 = c0): void => {
    selection.selectCell(r0, c0);
    if (r1 !== r0 || c1 !== c0) selection.extendTo(r1, c1);
  };
  return {
    store,
    document,
    asked,
    at,
    sheetMeta: () => store.getWorkbook().sheets.find((candidate) => candidate.id === "s1")!,
    apply: (patches: DocumentOp[]) => document.commit(patches, "edit-programmatic"),
    set: (row: number, col: number, input: number | string, style?: CellStyle) =>
      document.commit(
        [
          {
            op: "set",
            addr: at(row, col),
            value:
              typeof input === "string" && input.startsWith("=")
                ? { kind: "formula", src: input }
                : { kind: "literal", value: input },
            style,
          },
        ],
        "edit-programmatic",
      ),
    value: (row: number, col: number) => store.getCell(at(row, col)).resolved,
    formula: (row: number, col: number) => store.getFormula(at(row, col)),
    style: (row: number, col: number) => store.getCell(at(row, col)).style,
    copy: async (r0: number, c0: number, r1 = r0, c1 = c0) => {
      select(r0, c0, r1, c1);
      expect(await clipboard.copy()).toBe("done");
    },
    pasteSpecial: (options: PasteSpecialOptions, r0: number, c0: number, r1 = r0, c1 = c0) => {
      select(r0, c0, r1, c1);
      return clipboard.pasteSpecial(options);
    },
    paste: (row: number, col: number) => {
      select(row, col);
      return clipboard.paste();
    },
    showSheet: (id: string) => {
      activeSheet = id;
    },
    close: () => {
      lifetime.close();
      document.destroy();
      store.dispose();
    },
  };
}

describe("Paste Special", () => {
  it("adds copied values to the target's numbers and keeps the target's formats, as one undo step", async () => {
    const h = harness();
    try {
      h.set(0, 0, 10, { bold: true });
      h.set(1, 0, "=A1*2");
      h.set(0, 2, 1, { italic: true });
      h.set(1, 2, "=5");
      await h.copy(0, 0, 1, 0);

      expect(await h.pasteSpecial({ paste: "values", operation: "add" }, 0, 2)).toBe("done");
      expect([h.value(0, 2), h.value(1, 2)]).toEqual([11, 25]);
      // A number stays a number; a formula on either side becomes a formula.
      expect(h.formula(0, 2)).toBeNull();
      expect(h.formula(1, 2)).toBe("=(5)+20");
      expect(h.style(0, 2)).toEqual({ italic: true });

      h.document.undo();
      expect([h.value(0, 2), h.formula(1, 2)]).toEqual([1, "=5"]);
    } finally {
      h.close();
    }
  });

  it("transposes, skips blanks and shifts each formula by its own move", async () => {
    const h = harness();
    try {
      h.set(0, 0, 1);
      h.set(1, 0, "=A1");
      h.set(1, 1, 4);
      h.set(5, 2, "keep");
      await h.copy(0, 0, 1, 1);

      expect(await h.pasteSpecial({ transpose: true, skipBlanks: true }, 4, 2)).toBe("done");
      // A1:B2 lands on C5:D6 turned: A2 moves to D5, and its =A1 follows to =D4.
      expect([h.value(4, 2), h.formula(4, 3), h.value(5, 3)]).toEqual([1, "=D4", 4]);
      // B1 is blank, so C6 keeps its value.
      expect(h.value(5, 2)).toBe("keep");
    } finally {
      h.close();
    }
  });

  it("pastes formats, notes, column widths or validation alone", async () => {
    const h = harness();
    try {
      h.set(0, 0, 7, { bold: true, numberFormat: "0.00" });
      h.apply([
        { op: "setNote", addr: h.at(0, 0), text: "Checked" },
        { op: "setColumn", sheet: "s1", col: 0, patch: { width: 150 } },
        {
          op: "setValidationRule",
          sheet: "s1",
          rule: {
            id: "rule-1",
            range: range("s1", 0, 0, 0, 0),
            condition: { kind: "any" },
            policy: "reject",
          },
        },
      ]);
      h.set(3, 2, 3);
      await h.copy(0, 0);

      expect(await h.pasteSpecial({ paste: "formats" }, 3, 2)).toBe("done");
      expect([h.value(3, 2), h.style(3, 2)]).toEqual([3, { bold: true, numberFormat: "0.00" }]);
      expect(await h.pasteSpecial({ paste: "comments" }, 3, 2)).toBe("done");
      expect(h.sheetMeta().notes?.map((note) => [note.addr.row, note.addr.col, note.text])).toEqual(
        [
          [0, 0, "Checked"],
          [3, 2, "Checked"],
        ],
      );
      expect(await h.pasteSpecial({ paste: "columnWidths" }, 3, 2)).toBe("done");
      expect(h.sheetMeta().columns[2]?.width).toBe(150);
      expect(await h.pasteSpecial({ paste: "validation" }, 3, 2)).toBe("done");
      expect(h.sheetMeta().validationRules?.map((rule) => rule.range)).toEqual([
        range("s1", 0, 0, 0, 0),
        range("s1", 3, 2, 3, 2),
      ]);
      expect(h.value(3, 2)).toBe(3);
    } finally {
      h.close();
    }
  });

  it("links to the copied cells: absolute for one cell, with the sheet's name from another sheet", async () => {
    const h = harness();
    try {
      h.set(0, 0, 5);
      h.set(1, 0, 6);
      await h.copy(0, 0);
      expect(await h.pasteSpecial({ link: true }, 0, 3)).toBe("done");
      expect(h.formula(0, 3)).toBe("=$A$1");

      await h.copy(0, 0, 1, 0);
      h.showSheet("s2");
      expect(await h.pasteSpecial({ link: true }, 2, 1)).toBe("done");
      expect([h.formula(2, 1), h.formula(3, 1)]).toEqual(["=Data!A1", "=Data!A2"]);
      expect([h.value(2, 1), h.value(3, 1)]).toEqual([5, 6]);
    } finally {
      h.close();
    }
  });

  it("carries notes and conditional formats with Paste, as Excel's All, and merges them on request", async () => {
    const h = harness();
    try {
      const rule = (r0: number, r1: number) => ({
        range: range("s1", r0, 0, r1, 0),
        when: { kind: "greaterThan" as const, value: 1 },
        style: { bold: true },
      });
      h.set(0, 0, 2);
      h.apply([
        { op: "setNote", addr: h.at(0, 0), text: "Source" },
        { op: "setNote", addr: h.at(10, 0), text: "Target" },
        {
          op: "setSheetMeta",
          sheet: "s1",
          patch: { conditionalFormats: [rule(0, 0), rule(9, 11)] },
        },
      ]);
      await h.copy(0, 0);

      expect(await h.paste(10, 0)).toBe("done");
      expect(h.sheetMeta().notes?.find((note) => note.addr.row === 10)?.text).toBe("Source");
      // A10:A12's rule gives up A11, which takes the copied rule.
      expect(
        h
          .sheetMeta()
          .conditionalFormats?.map((format) => [format.range.start.row, format.range.end.row]),
      ).toEqual([
        [0, 0],
        [9, 9],
        [11, 11],
        [10, 10],
      ]);

      expect(await h.pasteSpecial({ paste: "allMergingConditionalFormats" }, 9, 0)).toBe("done");
      expect(h.sheetMeta().conditionalFormats?.length).toBe(5);

      // With `ask`, the dialog chooses; Cancel pastes nothing.
      expect(await h.pasteSpecial({ ask: true }, 15, 0)).toBe("empty");
      expect(h.asked).toEqual([true]);
      expect(h.value(15, 0)).toBeNull();
    } finally {
      h.close();
    }
  });
});
