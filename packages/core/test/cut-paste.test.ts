import { afterEach, beforeAll, describe, expect, it } from "bun:test";

import { ClipboardController } from "../src/clipboard-controller.js";
import { DocumentController } from "../src/document-controller.js";
import { validateDocumentOperationShape } from "../src/document-protocol.js";
import { initSheetwrite } from "../src/grid.js";
import { rebaseDocumentOperations } from "../src/rebase.js";
import { Scope } from "../src/scope.js";
import { SelectionModel } from "../src/selection.js";
import { SheetwriteStore } from "../src/store.js";
import type { CellAddress, DocumentOp, Range } from "../src/types.js";
import { range, sheet } from "./fixtures.js";

// Excel, "Move or copy cells and cell contents":
// https://support.microsoft.com/en-us/office/move-or-copy-cells-and-cell-contents-803d65eb-6a3e-4534-8c6f-ff12d1c4139e

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

const ROWS = 30;

/**
 * A grid's clipboard over a real store with sheets `s1` and `s2`, both 30 rows
 * by A:D. With `nativeFormatsOnly`, the clipboard takes only plain text and
 * HTML, as Firefox's and Safari's do: a write with another format fails.
 */
function cutHarness(options: { nativeFormatsOnly?: boolean } = {}) {
  const clip: { items: FakeClipboardItem[]; text: string } = { items: [], text: "" };
  Object.defineProperty(globalThis, "ClipboardItem", {
    configurable: true,
    value: FakeClipboardItem,
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      write: (items: FakeClipboardItem[]) => {
        const native = ["text/plain", "text/html"];
        if (
          options.nativeFormatsOnly &&
          items.some((item) => item.types.some((type) => !native.includes(type)))
        ) {
          return Promise.reject(new DOMException("Type not supported", "NotAllowedError"));
        }
        clip.items = items;
        return Promise.resolve();
      },
      read: () => Promise.resolve(clip.items),
      writeText: (text: string) => {
        clip.text = text;
        return Promise.resolve();
      },
      readText: () => Promise.resolve(clip.text),
    },
  });

  const store = new SheetwriteStore({
    activeSheet: "s1",
    sheets: [
      { ...sheet("s1", ROWS), name: "Data" },
      { ...sheet("s2", ROWS), name: "Summary" },
    ],
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
  const selection = new SelectionModel(ROWS, 0, 3);
  const lifetime = new Scope();
  let activeSheet = "s1";
  const marks: Array<Range | null> = [];
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
    commit: (patches, reason) => {
      document.commit(patches, reason);
    },
    onCutChange: (range) => marks.push(range),
    loadPasteSpecial: () => import("../src/paste-special.js"),
    askPasteSpecial: async () => null,
    sheetName: () => "Sheet 1",
  });
  const stopListening = store.on("change", (event) => clipboard.storeChanged(event));

  const at = (row: number, col: number, sheetId = "s1"): CellAddress => ({
    sheet: sheetId,
    row,
    col,
  });
  return {
    store,
    document,
    clipboard,
    marks,
    clip,
    at,
    value: (row: number, col: number, sheetId?: string) =>
      store.getCell(at(row, col, sheetId)).resolved,
    formula: (row: number, col: number, sheetId?: string) =>
      store.getFormula(at(row, col, sheetId)),
    set: (row: number, col: number, input: number | string, sheetId?: string) =>
      document.commit(
        [
          {
            op: "set",
            addr: at(row, col, sheetId),
            value:
              typeof input === "string" && input.startsWith("=")
                ? { kind: "formula", src: input }
                : { kind: "literal", value: input },
          },
        ],
        "edit-programmatic",
      ),
    select: (r0: number, c0: number, r1 = r0, c1 = c0) => {
      selection.selectCell(r0, c0);
      if (r1 !== r0 || c1 !== c0) selection.extendTo(r1, c1);
    },
    showSheet: (id: string) => {
      activeSheet = id;
    },
    close: () => {
      stopListening();
      lifetime.close();
      document.destroy();
      store.dispose();
    },
  };
}

let harness: ReturnType<typeof cutHarness>;
afterEach(() => harness?.close());

describe("cut and paste", () => {
  it("marks the cells on cut and moves them, with every reference, on paste (#756)", async () => {
    harness = cutHarness();
    const h = harness;
    h.set(0, 0, 1);
    h.set(1, 0, 2);
    h.set(0, 1, "=A1*10");
    h.set(5, 3, "=A1+A2");

    h.select(0, 0, 1, 0);
    expect(await h.clipboard.cut()).toBe("done");
    // Nothing changes until the paste.
    expect(h.value(0, 0)).toBe(1);
    expect(h.value(1, 0)).toBe(2);
    expect(h.marks).toEqual([{ sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } }]);

    h.select(19, 0);
    expect(await h.clipboard.paste()).toBe("done");
    expect([h.value(19, 0), h.value(20, 0)]).toEqual([1, 2]);
    expect([h.value(0, 0), h.value(1, 0)]).toEqual([null, null]);
    expect(h.formula(0, 1)).toBe("=A20*10");
    expect(h.formula(5, 3)).toBe("=A20+A21");
    expect(h.value(5, 3)).toBe(3);
    expect(h.marks.at(-1)).toBeNull();

    // One undo step puts everything back, and redo moves it again.
    h.document.undo();
    expect([h.value(0, 0), h.value(1, 0), h.value(19, 0)]).toEqual([1, 2, null]);
    expect(h.formula(0, 1)).toBe("=A1*10");
    expect(h.formula(5, 3)).toBe("=A1+A2");
    h.document.redo();
    expect(h.formula(5, 3)).toBe("=A20+A21");
    expect(h.value(20, 0)).toBe(2);

    // The pasted cut is used up, as in Excel.
    h.select(25, 0);
    expect(await h.clipboard.paste()).toBe("empty");
  });

  it("keeps a moved formula pointing at the same cells", async () => {
    harness = cutHarness();
    const h = harness;
    h.set(0, 0, 4);
    h.set(0, 2, 5);
    h.set(0, 1, "=A1+C1");

    h.select(0, 0, 0, 1);
    await h.clipboard.cut();
    h.select(9, 2);
    await h.clipboard.paste();

    expect(h.formula(9, 3)).toBe("=C10+C1");
    expect(h.value(9, 3)).toBe(9);
  });

  it("replaces the cells it lands on, and undo brings them back", async () => {
    harness = cutHarness();
    const h = harness;
    h.set(0, 0, 1);
    h.set(2, 2, 5);
    h.set(4, 1, "=C3");

    h.select(0, 0);
    await h.clipboard.cut();
    h.select(2, 2);
    await h.clipboard.paste();

    expect(h.value(2, 2)).toBe(1);
    expect(h.formula(4, 1)).toBe("=#REF!");

    h.document.undo();
    expect([h.value(0, 0), h.value(2, 2)]).toEqual([1, 5]);
    expect(h.formula(4, 1)).toBe("=C3");
    expect(h.value(4, 1)).toBe(5);
  });

  it("moves a block onto part of itself", async () => {
    harness = cutHarness();
    const h = harness;
    h.set(0, 0, 1);
    h.set(1, 0, 2);
    h.set(2, 0, 3);
    h.set(0, 3, "=SUM(A1:A3)");

    h.select(0, 0, 2, 0);
    await h.clipboard.cut();
    h.select(1, 0);
    await h.clipboard.paste();

    expect([h.value(0, 0), h.value(1, 0), h.value(2, 0), h.value(3, 0)]).toEqual([null, 1, 2, 3]);
    expect(h.formula(0, 3)).toBe("=SUM(A2:A4)");
  });

  it("moves cells, notes and hyperlinks to another sheet", async () => {
    harness = cutHarness();
    const h = harness;
    h.set(0, 0, 3);
    h.set(1, 0, "=A1*2");
    h.set(0, 3, "=A2+1");
    h.document.commit(
      [
        { op: "setNote", addr: h.at(0, 0), text: "checked" },
        {
          op: "setHyperlink",
          sheet: "s1",
          hyperlink: {
            id: "link",
            range: { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 1, col: 0 } },
            target: { kind: "external", url: "https://example.com/" },
          },
        },
      ],
      "api",
    );

    h.select(0, 0, 1, 0);
    await h.clipboard.cut();
    h.showSheet("s2");
    h.select(4, 1);
    expect(await h.clipboard.paste()).toBe("done");

    expect(h.value(0, 0)).toBeNull();
    expect(h.formula(5, 1, "s2")).toBe("=B5*2");
    expect(h.value(5, 1, "s2")).toBe(6);
    expect(h.formula(0, 3)).toBe("=Summary!B6+1");
    const [s1, s2] = h.store.getWorkbook().sheets;
    expect(s1?.notes ?? []).toEqual([]);
    expect(s2?.notes).toEqual([{ addr: h.at(4, 1, "s2"), text: "checked" }]);
    expect(s1?.hyperlinks ?? []).toEqual([]);
    expect(s2?.hyperlinks?.map((link) => link.range)).toEqual([
      { sheet: "s2", start: { row: 5, col: 1 }, end: { row: 5, col: 1 } },
    ]);
  });

  it("ends the cut on Esc, a new copy or another edit, and the ended cut does not paste", async () => {
    harness = cutHarness();
    const h = harness;
    h.set(0, 0, 1);

    h.select(0, 0);
    await h.clipboard.cut();
    expect(h.clipboard.cancelCut()).toBe(true);
    expect(h.clipboard.cancelCut()).toBe(false);
    expect(h.marks).toEqual([expect.anything(), null]);
    h.select(5, 0);
    expect(await h.clipboard.paste()).toBe("empty");
    expect(h.value(0, 0)).toBe(1);

    h.select(0, 0);
    await h.clipboard.cut();
    h.set(3, 3, 7);
    expect(h.marks.at(-1)).toBeNull();
    expect(await h.clipboard.paste()).toBe("empty");

    await h.clipboard.cut();
    expect(await h.clipboard.copy()).toBe("done");
    expect(h.marks.at(-1)).toBeNull();
    // The copy pastes as a copy; the source stays.
    h.select(5, 0);
    expect(await h.clipboard.paste()).toBe("done");
    expect([h.value(0, 0), h.value(5, 0)]).toEqual([1, 1]);
  });

  it("pastes another app's clipboard as a plain paste and ends the cut", async () => {
    harness = cutHarness();
    const h = harness;
    h.set(0, 0, 1);

    h.select(0, 0);
    await h.clipboard.cut();
    h.clip.items = [
      new FakeClipboardItem({ "text/plain": new Blob(["42"], { type: "text/plain" }) }),
    ];
    h.select(5, 0);
    expect(await h.clipboard.paste()).toBe("done");

    expect([h.value(0, 0), h.value(5, 0)]).toEqual([1, 42]);
    expect(h.marks.at(-1)).toBeNull();
  });

  it("moves validation and conditional-format rules inside the block, and undo puts them back", async () => {
    harness = cutHarness();
    const h = harness;
    h.set(0, 0, 4);
    h.set(0, 1, 1);
    const format = {
      range: range("s1", 0, 0, 2, 0),
      when: { kind: "formula" as const, source: "=A1>B1" },
      style: { bold: true },
    };
    const formats = [format];
    h.document.commit(
      [
        {
          op: "setValidationRule",
          sheet: "s1",
          rule: {
            id: "moved",
            range: range("s1", 0, 0, 2, 0),
            condition: { kind: "list", values: [1, 2, 3, 4] },
            policy: "warn",
          },
        },
        {
          op: "setValidationRule",
          sheet: "s1",
          rule: {
            id: "replaced",
            range: range("s1", 9, 2, 9, 2),
            condition: { kind: "list", values: [5] },
            policy: "warn",
          },
        },
        { op: "setSheetMeta", sheet: "s1", patch: { conditionalFormats: formats } },
      ],
      "api",
    );

    // A1:B5 lands on C10:D14.
    h.select(0, 0, 4, 1);
    await h.clipboard.cut();
    h.select(9, 2);
    expect(await h.clipboard.paste()).toBe("done");

    const moved = h.store.getWorkbook().sheets[0]!;
    expect(moved.validationRules?.map((rule) => [rule.id, rule.range])).toEqual([
      ["moved", range("s1", 9, 2, 11, 2)],
    ]);
    expect(moved.conditionalFormats).toEqual([
      {
        ...format,
        range: range("s1", 9, 2, 11, 2),
        when: { kind: "formula", source: "=C10>D10" },
      },
    ]);

    h.document.undo();
    const restored = h.store.getWorkbook().sheets[0]!;
    expect(
      [...(restored.validationRules ?? [])]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((rule) => [rule.id, rule.range]),
    ).toEqual([
      ["moved", range("s1", 0, 0, 2, 0)],
      ["replaced", range("s1", 9, 2, 9, 2)],
    ]);
    expect(restored.conditionalFormats).toEqual(formats);
  });

  it("does not paste values after a cut, as Excel greys out Paste Special", async () => {
    harness = cutHarness();
    const h = harness;
    h.set(0, 0, 1);

    h.select(0, 0);
    await h.clipboard.cut();
    h.select(5, 0);
    expect(await h.clipboard.pasteValues()).toBe("empty");
    expect(h.value(5, 0)).toBeNull();
    // The cut still waits for its paste.
    expect(await h.clipboard.paste()).toBe("done");
    expect([h.value(0, 0), h.value(5, 0)]).toEqual([null, 1]);
  });
});

describe("cut and paste in browsers without custom clipboard formats", () => {
  it("moves the cut cells and keeps a copy's formulas (#921)", async () => {
    harness = cutHarness({ nativeFormatsOnly: true });
    const h = harness;
    h.set(0, 0, "a");
    h.set(0, 1, 1);
    h.set(1, 0, "=B1*2");

    h.select(0, 0, 1, 1);
    expect(await h.clipboard.cut()).toBe("done");
    h.select(0, 2);
    expect(await h.clipboard.paste()).toBe("done");
    expect([h.value(0, 0), h.value(0, 1)]).toEqual([null, null]);
    expect([h.value(0, 2), h.value(0, 3)]).toEqual(["a", 1]);
    expect(h.formula(1, 2)).toBe("=D1*2");

    h.select(0, 2, 1, 3);
    expect(await h.clipboard.copy()).toBe("done");
    h.select(10, 0);
    expect(await h.clipboard.paste()).toBe("done");
    expect(h.formula(11, 0)).toBe("=B11*2");
  });
});

describe("moveCells operation", () => {
  const move: DocumentOp = {
    op: "moveCells",
    range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
    to: { sheet: "s2", row: 4, col: 1 },
  };

  it("is a valid document operation", () => {
    expect(validateDocumentOperationShape(move)).toEqual([]);
    expect(validateDocumentOperationShape({ ...move, to: { sheet: "s2", row: -1 } })).not.toEqual(
      [],
    );
  });

  it("conflicts with concurrent work on either sheet, and not with other sheets", () => {
    const onTarget: DocumentOp = {
      op: "set",
      addr: { sheet: "s2", row: 20, col: 3 },
      value: { kind: "literal", value: 1 },
    };
    const elsewhere: DocumentOp = { ...onTarget, addr: { sheet: "s3", row: 0, col: 0 } };

    expect(rebaseDocumentOperations([onTarget], [move]).status).toBe("conflict");
    expect(rebaseDocumentOperations([elsewhere], [move]).status).toBe("rebased");
  });
});
