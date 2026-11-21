import { beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { ClipboardController, SHEETWRITE_CLIPBOARD_MIME } from "../src/clipboard-controller.js";
import { parseTsv, rowsToTsv } from "../src/clipboard.js";
import { DocumentController } from "../src/document-controller.js";
import { initSheetwrite } from "../src/grid.js";
import { Scope } from "../src/scope.js";
import { SelectionModel } from "../src/selection.js";
import { SheetwriteStore } from "../src/store.js";
import type {
  CellAddress,
  CellScalar,
  CellStyle,
  CellValue,
  DocumentOp,
  Range,
  Sheet,
  Store,
} from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});
describe("clipboard TSV", () => {
  it("serializes a block, quoting fields with tabs/newlines/quotes", () => {
    expect(rowsToTsv([["a", 1, null]])).toBe("a\t1\t");
    expect(rowsToTsv([['q"x', "b\tc", "d\ne"]])).toBe('"q""x"\t"b\tc"\t"d\ne"');
    expect(rowsToTsv([[true, false]])).toBe("TRUE\tFALSE");
  });

  it("hardens every dangerous string prefix in external TSV while leaving numbers intact", () => {
    const dangerous = ["=cmd", "+1", "-1", "@x", "\tx", "\rx"];
    expect(parseTsv(rowsToTsv([dangerous, [-1, 1, 0, null, true, false]]))).toEqual([
      dangerous.map((value) => `'${value}`),
      ["-1", "1", "0", "", "TRUE", "FALSE"],
    ]);
  });

  it("strips exactly one leading TSV BOM and preserves quoted and trailing blank records", () => {
    expect(parseTsv("\ufeffα\tβ")).toEqual([["α", "β"]]);
    expect(parseTsv("\ufeff\ufeffα")).toEqual([["\ufeffα"]]);
    expect(parseTsv('""')).toEqual([[""]]);
    expect(rowsToTsv([[null], [null], [null]])).toBe('""\r\n""\r\n""');
    expect(parseTsv(rowsToTsv([[null], [null], [null]]))).toEqual([[""], [""], [""]]);
  });
});

/**
 * In-memory {@link Store} stand-in exercising exactly the reads the controller
 * makes (`getCell`, `getFormula`, `viewRowCount`) plus a patch sink standing in
 * for `commit`. Formula patches are stored verbatim (never evaluated); literal
 * patches resolve to their own value. Enough to prove the controller's shift,
 * verbatim, values-only, and external-TSV behaviors without the WASM engine.
 */
class FakeStore {
  private readonly cells = new Map<
    string,
    { value: CellValue; resolved: CellScalar; style: CellStyle }
  >();
  readonly rowCount = 100;

  private key(addr: CellAddress): string {
    return `${addr.sheet}:${addr.row}:${addr.col}`;
  }

  seed(
    row: number,
    col: number,
    value: CellValue,
    resolved: CellScalar,
    style: CellStyle = {},
  ): void {
    this.cells.set(this.key({ sheet: "s1", row, col }), { value, resolved, style });
  }

  getCell(addr: CellAddress): { resolved: CellScalar; style: CellStyle } {
    const cell = this.cells.get(this.key(addr));
    return { resolved: cell?.resolved ?? null, style: cell?.style ?? {} };
  }

  getFormula(addr: CellAddress): string | null {
    const cell = this.cells.get(this.key(addr));
    return cell?.value.kind === "formula" ? cell.value.src : null;
  }

  getRefTarget(addr: CellAddress): CellAddress | null {
    const cell = this.cells.get(this.key(addr));
    return cell?.value.kind === "ref" ? cell.value.target : null;
  }

  viewRowCount(): number {
    return this.rowCount;
  }

  apply(patches: DocumentOp[]): void {
    for (const patch of patches) {
      if (patch.op === "set") {
        const resolved = patch.value.kind === "literal" ? patch.value.value : null;
        this.cells.set(this.key(patch.addr), {
          value: patch.value,
          resolved,
          style: patch.style ?? {},
        });
        continue;
      }
      if (patch.op === "setBlock") {
        const formulas = new Map(patch.block.formulas ?? []);
        const refs = new Map(patch.block.refs ?? []);
        const styles = patch.block.styleTable ?? [];
        const styleIds = patch.block.styleIds;
        for (let row = 0; row < patch.block.rowCount; row++) {
          for (let col = 0; col < patch.block.colCount; col++) {
            const offset = row * patch.block.colCount + col;
            const value: CellValue = formulas.has(offset)
              ? { kind: "formula", src: formulas.get(offset)! }
              : refs.has(offset)
                ? { kind: "ref", target: refs.get(offset)! }
                : { kind: "literal", value: patch.block.values[offset]! };
            const addr = {
              sheet: patch.range.sheet,
              row: Math.min(patch.range.start.row, patch.range.end.row) + row,
              col: Math.min(patch.range.start.col, patch.range.end.col) + col,
            };
            this.cells.set(this.key(addr), {
              value,
              resolved: value.kind === "literal" ? value.value : null,
              style: styleIds ? (styles[styleIds[offset]!] ?? {}) : {},
            });
          }
        }
        continue;
      }
      if (patch.op === "clearRange") {
        const r0 = Math.min(patch.range.start.row, patch.range.end.row);
        const r1 = Math.max(patch.range.start.row, patch.range.end.row);
        const c0 = Math.min(patch.range.start.col, patch.range.end.col);
        const c1 = Math.max(patch.range.start.col, patch.range.end.col);
        for (let row = r0; row <= r1; row++) {
          for (let col = c0; col <= c1; col++) {
            const addr = { sheet: patch.range.sheet, row, col };
            const existing = this.cells.get(this.key(addr));
            this.cells.set(this.key(addr), {
              value:
                patch.contents === false
                  ? (existing?.value ?? { kind: "literal", value: null })
                  : { kind: "literal", value: null },
              resolved: patch.contents === false ? (existing?.resolved ?? null) : null,
              style: patch.style === false ? (existing?.style ?? {}) : {},
            });
          }
        }
      }
      if (patch.op === "moveCells") {
        // Moves each cell verbatim; reference rewriting is the engine's.
        const r0 = Math.min(patch.range.start.row, patch.range.end.row);
        const r1 = Math.max(patch.range.start.row, patch.range.end.row);
        const c0 = Math.min(patch.range.start.col, patch.range.end.col);
        const c1 = Math.max(patch.range.start.col, patch.range.end.col);
        const moved: Array<
          [CellAddress, { value: CellValue; resolved: CellScalar; style: CellStyle }]
        > = [];
        for (let row = r0; row <= r1; row++) {
          for (let col = c0; col <= c1; col++) {
            const key = this.key({ sheet: patch.range.sheet, row, col });
            const cell = this.cells.get(key);
            this.cells.delete(key);
            if (!cell) continue;
            moved.push([
              { sheet: patch.to.sheet, row: patch.to.row + row - r0, col: patch.to.col + col - c0 },
              cell,
            ]);
          }
        }
        for (const [addr, cell] of moved) this.cells.set(this.key(addr), cell);
      }
    }
  }
}

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

interface Harness {
  controller: ClipboardController;
  /** The grid scope the controller runs under; closing it is the grid's destroy. */
  lifetime: Scope;
  store: FakeStore;
  sheet: Sheet;
  selection: SelectionModel;
  /** CommitReasons the controller passed to `deps.commit`, in order. */
  commitReasons: string[];
  select: (row: number, col: number) => void;
  setSystemClipboard: (text: string) => void;
  setReadOnly: (value: boolean) => void;
  /** The cut marks the controller reported, in order. */
  cutMarks: Array<Range | null>;
  /** Why the controller refused each paste, in order. */
  refusals: string[];
}

function makeHarness(
  options: {
    mergeAnchorAt?: (
      row: number,
      col: number,
    ) => {
      r0: number;
      c0: number;
      r1: number;
      c1: number;
    } | null;
    toDataRow?: (viewRow: number) => number;
  } = {},
): Harness {
  const clip: { text: string; items: FakeClipboardItem[] } = { text: "", items: [] };
  Object.defineProperty(globalThis, "ClipboardItem", {
    configurable: true,
    value: FakeClipboardItem,
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      write: (items: FakeClipboardItem[]) => {
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

  const store = new FakeStore();
  const lifetime = new Scope();
  const sheet = makeWorkbook(100).sheets[0]!; // columns: name(text), amount(number), city(text)
  const selection = new SelectionModel(100, 0, 2);
  let readOnly = false;

  const commitReasons: string[] = [];
  const cutMarks: Array<Range | null> = [];
  const refusals: string[] = [];
  const controller = new ClipboardController({
    lifetime,
    store: store as unknown as Store,
    selection: () => selection,
    activeSheet: () => "s1",
    sheet: () => sheet,
    colIndices: () => [0, 1, 2],
    readOnly: () => readOnly,
    mergeAnchorAt: options.mergeAnchorAt ?? (() => null),
    toDataRow: options.toDataRow ?? ((viewRow) => viewRow),
    toViewRow: (dataRow) => dataRow,
    undo: () => {
      throw new Error("This harness has no undo history");
    },
    lastUndo: () => null,
    // A harness with its own row order stands for a sorted or filtered view.
    rowSpan: (first, last) => (options.toDataRow ? null : { first, last }),
    commit: (patches, reason) => {
      commitReasons.push(reason);
      store.apply(patches);
      for (const patch of patches) {
        if (patch.op === "setHyperlink") {
          const links = sheet.hyperlinks ?? [];
          const index = links.findIndex((candidate) => candidate.id === patch.hyperlink.id);
          if (index < 0) sheet.hyperlinks = [...links, structuredClone(patch.hyperlink)];
          else {
            const next = [...links];
            next[index] = structuredClone(patch.hyperlink);
            sheet.hyperlinks = next;
          }
        } else if (patch.op === "removeHyperlink") {
          sheet.hyperlinks = sheet.hyperlinks?.filter((candidate) => candidate.id !== patch.id);
        }
      }
      return { status: "applied", epoch: 0, transaction: { patches } };
    },
    onCutChange: (range) => cutMarks.push(range),
    onPasteRefused: (reason) => refusals.push(reason),
    loadPasteSpecial: () => import("../src/paste-special.js"),
    askPasteSpecial: async () => null,
    sheetName: () => "Sheet 1",
  });

  return {
    controller,
    lifetime,
    store,
    sheet,
    selection,
    commitReasons,
    cutMarks,
    refusals,
    select: (row, col) => selection.selectCell(row, col),
    setReadOnly: (value) => {
      readOnly = value;
    },
    setSystemClipboard: (text) => {
      clip.text = text;
      clip.items = [];
    },
  };
}

describe("ClipboardController", () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it("copy + paste re-anchors relative refs by the paste displacement", async () => {
    // Formula at B2 (row 1, col 1); copy, paste two rows down to B4 (row 3).
    h.store.seed(1, 1, { kind: "formula", src: "=A1+B$2" }, 0);
    h.select(1, 1);
    await h.controller.copy();

    h.select(3, 1);
    await h.controller.paste();

    // Relative A1 shifts +2 rows -> A3; absolute-row B$2 keeps its row, same column.
    expect(h.store.getFormula({ sheet: "s1", row: 3, col: 1 })).toBe("=A3+B$2");
  });

  it("repeats a copied cell over a larger selection, shifting each copy, as Excel does", async () => {
    h.store.seed(1, 1, { kind: "formula", src: "=A2" }, 0);
    h.select(1, 1);
    await h.controller.copy();

    h.selection.selectCell(3, 1);
    h.selection.extendTo(5, 2);
    await h.controller.paste();

    expect(h.store.getFormula({ sheet: "s1", row: 3, col: 1 })).toBe("=A4");
    expect(h.store.getFormula({ sheet: "s1", row: 5, col: 1 })).toBe("=A6");
    expect(h.store.getFormula({ sheet: "s1", row: 4, col: 2 })).toBe("=B5");
  });

  it("cut marks the source and paste moves it with one moveCells operation", async () => {
    h.store.seed(1, 1, { kind: "formula", src: "=A1+B$2" }, 0);
    h.select(1, 1);
    await h.controller.cut();

    // As in Excel, a cut changes nothing until the paste.
    expect(h.store.getFormula({ sheet: "s1", row: 1, col: 1 })).toBe("=A1+B$2");
    expect(h.cutMarks).toEqual([
      { sheet: "s1", start: { row: 1, col: 1 }, end: { row: 1, col: 1 } },
    ]);

    h.select(3, 1);
    await h.controller.paste();

    expect(h.store.getFormula({ sheet: "s1", row: 3, col: 1 })).toBe("=A1+B$2");
    expect(h.store.getFormula({ sheet: "s1", row: 1, col: 1 })).toBeNull();
    expect(h.commitReasons).toEqual(["paste"]);
  });

  it("keeps the source intact when the clipboard rejects a cut", async () => {
    h.store.seed(1, 1, { kind: "formula", src: "=A1+B$2" }, 0);
    h.select(1, 1);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("clipboard denied")),
        readText: () => Promise.resolve(""),
      },
    });

    await h.controller.cut();

    expect(h.store.getFormula({ sheet: "s1", row: 1, col: 1 })).toBe("=A1+B$2");
  });

  it("marks the captured source when selection changes during the clipboard write", async () => {
    const { promise: pendingWrite, resolve: finishWrite } = Promise.withResolvers<void>();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => pendingWrite,
        readText: () => Promise.resolve(""),
      },
    });
    h.store.seed(1, 1, { kind: "formula", src: "=A1+B$2" }, 0);
    h.store.seed(3, 1, { kind: "literal", value: "keep" }, "keep");
    h.select(1, 1);

    const cut = h.controller.cut();
    h.select(3, 1);
    finishWrite();
    await cut;

    expect(h.cutMarks).toEqual([
      { sheet: "s1", start: { row: 1, col: 1 }, end: { row: 1, col: 1 } },
    ]);
    expect(h.store.getFormula({ sheet: "s1", row: 1, col: 1 })).toBe("=A1+B$2");
    expect(h.store.getCell({ sheet: "s1", row: 3, col: 1 }).resolved).toBe("keep");
    expect(h.commitReasons).toEqual([]);
  });

  it("lets a newer paste stop an older one that is still reading", async () => {
    const reads: Array<(text: string) => void> = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: () => {
          const read = Promise.withResolvers<string>();
          reads.push(read.resolve);
          return read.promise;
        },
      },
    });

    h.select(3, 1);
    const older = h.controller.paste();
    h.select(5, 1);
    const newer = h.controller.paste();
    reads[1]?.("new");
    reads[0]?.("old");

    expect(await older).toBe("empty");
    expect(await newer).toBe("done");
    expect(h.store.getCell({ sheet: "s1", row: 3, col: 1 }).resolved).toBeNull();
    expect(h.store.getCell({ sheet: "s1", row: 5, col: 1 }).resolved).toBe("new");
    expect(h.commitReasons).toEqual(["paste"]);
  });

  it("keeps a cut source when the grid closes before the clipboard accepts it", async () => {
    const { promise: pendingWrite, resolve: finishWrite } = Promise.withResolvers<void>();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => pendingWrite,
        readText: () => Promise.resolve(""),
      },
    });
    h.store.seed(1, 1, { kind: "formula", src: "=A1+B$2" }, 0);
    h.select(1, 1);

    const cut = h.controller.cut();
    h.lifetime.close();
    finishWrite();

    expect(await cut).toBe("empty");
    expect(h.store.getFormula({ sheet: "s1", row: 1, col: 1 })).toBe("=A1+B$2");
    expect(h.commitReasons).toEqual([]);
  });

  it("does not clear a read-only cut source", async () => {
    h.store.seed(1, 1, { kind: "formula", src: "=A1+B$2" }, 0);
    h.select(1, 1);
    h.setReadOnly(true);

    await h.controller.cut();

    expect(h.store.getFormula({ sheet: "s1", row: 1, col: 1 })).toBe("=A1+B$2");
  });

  it("pasteValues writes the resolved literal and no formula", async () => {
    // Formula resolving to 15 at C1 (row 0, col 2).
    h.store.seed(0, 2, { kind: "formula", src: "=A1+B$2" }, 15);
    h.select(0, 2);
    await h.controller.copy();

    h.select(2, 2);
    await h.controller.pasteValues();

    const target = { sheet: "s1", row: 2, col: 2 };
    expect(h.store.getCell(target).resolved).toBe(15);
    expect(h.store.getFormula(target)).toBeNull();
  });

  it("copies bounded hyperlink metadata with a new stable identity and translated range", async () => {
    h.sheet.hyperlinks = [
      {
        id: "source-link",
        range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
        target: { kind: "external", url: "https://example.com/report" },
        display: "Report",
        style: { color: "#123456", underline: true },
      },
    ];
    h.select(0, 0);
    await h.controller.copy();
    h.select(2, 0);
    await h.controller.paste();
    expect(h.sheet.hyperlinks).toHaveLength(2);
    expect(h.sheet.hyperlinks![1]).toMatchObject({
      range: { sheet: "s1", start: { row: 2, col: 0 }, end: { row: 2, col: 0 } },
      target: { kind: "external", url: "https://example.com/report" },
      display: "Report",
      style: { color: "#123456", underline: true },
    });
    expect(h.sheet.hyperlinks![1]!.id).not.toBe("source-link");
  });

  it("preserves signed numbers from external paste", async () => {
    h.setSystemClipboard("text\t-1\r\ntext\t+1");
    h.select(0, 0);
    await h.controller.paste();

    expect(h.store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).toBe(-1);
    expect(h.store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBe(1);
  });

  it("neutralizes injection prefixes in external text, never producing a formula", async () => {
    h.setSystemClipboard("=SUM(A1)\tsafe");
    h.select(0, 0);
    await h.controller.paste();

    const target = { sheet: "s1", row: 0, col: 0 };
    expect(h.store.getCell(target).resolved).toBe("'=SUM(A1)");
    expect(h.store.getFormula(target)).toBeNull();
  });

  it("preserves formulas and refs from the packed clipboard read", async () => {
    Object.assign(h.store, {
      getClipboardWindow: () => ({
        sheet: "s1",
        viewRows: { start: 0, end: 1 },
        dataRows: new Uint32Array([0]),
        cols: [0, 1],
        values: [7, 42],
        styleIds: new Uint32Array([0, 1]),
        styles: [{ bold: true }, { italic: true }],
        formulas: [{ offset: 0, source: "=B1" }],
        refs: [{ offset: 1, target: { sheet: "s1", row: 1, col: 1 } }],
        ffiCalls: 1,
        transferredElements: 2,
      }),
    });
    h.selection.selectCell(0, 0);
    h.selection.extendTo(0, 1);
    await h.controller.copy();

    h.select(2, 0);
    await h.controller.paste();

    expect(h.store.getFormula({ sheet: "s1", row: 2, col: 0 })).toBe("=B3");
    expect(h.store.getCell({ sheet: "s1", row: 2, col: 0 }).style).toEqual({ bold: true });
    expect(h.store.getRefTarget({ sheet: "s1", row: 2, col: 1 })).toEqual({
      sheet: "s1",
      row: 1,
      col: 1,
    });
    expect(h.store.getCell({ sheet: "s1", row: 2, col: 1 }).style).toEqual({ italic: true });
  });

  it("serializes covered merge cells as blanks", async () => {
    h = makeHarness({
      mergeAnchorAt: (row, col) => (row === 0 && col <= 1 ? { r0: 0, c0: 0, r1: 0, c1: 1 } : null),
    });
    h.store.seed(0, 0, { kind: "literal", value: "anchor" }, "anchor");
    h.store.seed(0, 1, { kind: "literal", value: "covered" }, "covered");
    h.selection.selectCell(0, 0);
    h.selection.extendTo(0, 1);
    await h.controller.copy();
    h.select(2, 0);
    await h.controller.paste();

    expect(h.store.getCell({ sheet: "s1", row: 2, col: 0 }).resolved).toBe("anchor");
    expect(h.store.getCell({ sheet: "s1", row: 2, col: 1 }).resolved).toBeNull();
  });

  it("resolves 'blocked' on a rejected readText and leaves the store unchanged", async () => {
    h.store.seed(1, 1, { kind: "literal", value: "keep" }, "keep");
    h.select(1, 1);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.resolve(),
        readText: () => Promise.reject(new Error("read denied")),
      },
    });

    await expect(h.controller.paste()).resolves.toBe("blocked");
    expect(h.store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBe("keep");
  });

  it("round-trips formulas and styles through the browser custom clipboard format", async () => {
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: FakeClipboardItem,
    });
    let written: FakeClipboardItem | null = null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: (items: FakeClipboardItem[]) => {
          written = items[0] ?? null;
          return Promise.resolve();
        },
        read: () => Promise.resolve(written ? [written] : []),
        writeText: () => Promise.reject(new Error("text fallback should not run")),
        readText: () => Promise.reject(new Error("text fallback should not run")),
      },
    });
    h.store.seed(0, 0, { kind: "formula", src: "=B1" }, 7, {
      bold: true,
      backgroundColor: "#abcdef",
    });
    h.select(0, 0);

    await expect(h.controller.copy()).resolves.toBe("done");
    // Assigned by the awaited clipboard.write callback; TS cannot follow that async side effect.
    const captured = written as unknown as FakeClipboardItem;
    const types = captured.types;
    expect(types).toContain("text/plain");
    expect(types).toContain("text/html");
    expect(types).toContain(`web ${SHEETWRITE_CLIPBOARD_MIME}`);

    h.select(2, 0);
    await expect(h.controller.paste()).resolves.toBe("done");
    expect(h.store.getFormula({ sheet: "s1", row: 2, col: 0 })).toBe("=B3");
    expect(h.store.getCell({ sheet: "s1", row: 2, col: 0 }).style).toEqual({
      bold: true,
      backgroundColor: "#abcdef",
    });
  });

  it("exports safe colors and both text decorations in copied HTML", async () => {
    h.store.seed(0, 0, { kind: "literal", value: "styled" }, "styled", {
      underline: true,
      strikethrough: true,
      color: "red;background-image:url(https://example.test/pixel)",
      backgroundColor: "#123456",
    });
    h.select(0, 0);
    await h.controller.copy();
    const [copied] = await navigator.clipboard.read();
    if (!copied) throw new Error("copied clipboard entry missing");
    const html = await (await copied.getType("text/html")).text();

    expect(html).not.toContain("background-image");
    expect(html).toContain("background-color:#123456");
    expect(html).toContain("text-decoration:underline line-through");
  });
  it("hardens every dangerous prefix in plain and preferred HTML while trusted private cells stay exact", async () => {
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: FakeClipboardItem,
    });
    let written: FakeClipboardItem | null = null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: (items: FakeClipboardItem[]) => {
          written = items[0] ?? null;
          return Promise.resolve();
        },
        read: () => Promise.resolve(written ? [written] : []),
        writeText: () => Promise.reject(new Error("text fallback should not run")),
        readText: () => Promise.reject(new Error("text fallback should not run")),
      },
    });
    const originals = [
      ["=cmd", "+1", "-1"],
      ["@x", "\tx", "\rx"],
    ];
    for (let row = 0; row < originals.length; row++) {
      for (let column = 0; column < originals[row]!.length; column++) {
        const value = originals[row]![column]!;
        h.store.seed(row, column, { kind: "literal", value }, value);
      }
    }
    h.select(0, 0);
    h.selection.extendTo(1, 2);

    await expect(h.controller.copy()).resolves.toBe("done");
    const captured = written as unknown as FakeClipboardItem;
    const expected = originals.map((row) => row.map((value) => `'${value}`));
    const plain = await (await captured.getType("text/plain")).text();
    expect(parseTsv(plain)).toEqual(expected);

    const html = await (await captured.getType("text/html")).text();
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(Array.from(document.querySelectorAll("td"), (cell) => cell.textContent)).toEqual(
      expected.flat(),
    );
    expect(document.querySelector("[data-sheetwrite-formula]")).toBeNull();

    const privateType = `web ${SHEETWRITE_CLIPBOARD_MIME}`;
    const envelope = JSON.parse(await (await captured.getType(privateType)).text()) as {
      cells: Array<Array<{ value: { kind: string; value?: CellScalar } }>>;
    };
    expect(envelope.cells.map((row) => row.map((cell) => cell.value.value))).toEqual(originals);

    h.select(10, 0);
    await expect(h.controller.paste()).resolves.toBe("done");
    for (let row = 0; row < originals.length; row++) {
      for (let column = 0; column < originals[row]!.length; column++) {
        expect(h.store.getCell({ sheet: "s1", row: row + 10, col: column }).resolved).toBe(
          originals[row]![column]!,
        );
      }
    }
  });

  it("falls back from an unavailable web custom format to safe HTML plus text", async () => {
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: FakeClipboardItem,
    });
    const writes: FakeClipboardItem[] = [];
    let textWrites = 0;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: ([item]: FakeClipboardItem[]) => {
          writes.push(item!);
          return item!.types.some((type) => type.startsWith("web "))
            ? Promise.reject(new Error("custom format unavailable"))
            : Promise.resolve();
        },
        writeText: () => {
          textWrites++;
          return Promise.resolve();
        },
      },
    });
    h.store.seed(0, 0, { kind: "literal", value: "<safe>" }, "<safe>");
    h.select(0, 0);

    await expect(h.controller.copy()).resolves.toBe("done");
    expect(writes).toHaveLength(2);
    expect(writes[1]!.types.sort()).toEqual(["text/html", "text/plain"]);
    expect(textWrites).toBe(0);
  });

  it("pastes every external HTML formula as inert text, including nested dangerous calls", async () => {
    const html =
      '<table><tbody><tr><td data-formula="=A1+1" style="font-weight:bold;color:#123456">2</td>' +
      '<td data-formula="=IF(1,WEBSERVICE(&quot;https://example.test&quot;),0)">' +
      '<img src=x onerror="globalThis.__clipboardExecuted=true">formula</td></tr></tbody></table>';
    const item = new FakeClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        read: () => Promise.resolve([item]),
        readText: () => Promise.reject(new Error("HTML should be handled first")),
      },
    });
    h.select(1, 0);

    await expect(h.controller.paste()).resolves.toBe("done");
    expect(h.store.getFormula({ sheet: "s1", row: 1, col: 0 })).toBeNull();
    expect(h.store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe("'=A1+1");
    expect(h.store.getCell({ sheet: "s1", row: 1, col: 0 }).style).toMatchObject({
      bold: true,
      color: "#123456",
    });
    expect(h.store.getFormula({ sheet: "s1", row: 1, col: 1 })).toBeNull();
    expect(h.store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toStartWith(
      "'=IF(1,WEBSERVICE",
    );
    expect((globalThis as Record<string, unknown>).__clipboardExecuted).toBeUndefined();
  });

  it("keeps the cells Excel's HTML marks as text as text in general columns, as Excel does", async () => {
    for (const column of h.sheet.columns) column.type = "general";
    // Excel marks a cell in its Text format with mso-number-format:"\@", in a
    // class of the page's style sheet or in the cell's style, and writes x:str
    // on a cell whose value is a string.
    const html =
      '<html><head><style><!--\n.xl65\n\t{mso-style-parent:style0;\n\tmso-number-format:"\\@";}\n--></style></head><body><table>' +
      "<tr><td class=xl65>007</td><td style='mso-number-format:\"\\@\"'>1/15/2026</td><td x:str>15%</td></tr>" +
      "<tr><td>007</td><td>1/15/2026</td><td>15%</td></tr>" +
      "</table></body></html>";
    const item = new FakeClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob(["007\t1/15/2026\t15%\r\n007\t1/15/2026\t15%\r\n"], {
        type: "text/plain",
      }),
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { read: () => Promise.resolve([item]) },
    });
    const cell = (row: number, col: number) => h.store.getCell({ sheet: "s1", row, col });

    h.select(1, 0);
    await expect(h.controller.paste()).resolves.toBe("done");
    expect([0, 1, 2].map((col) => cell(1, col).resolved)).toEqual(["007", "1/15/2026", "15%"]);
    expect([0, 1, 2].map((col) => cell(1, col).style.numberFormat)).toEqual(["@", "@", "@"]);
    // Cells without the mark still read as General reads a typed entry.
    expect([0, 1, 2].map((col) => cell(2, col).resolved)).toEqual([7, 46037, 0.15]);

    // Paste Values keeps the text and leaves the format.
    h.select(5, 0);
    await expect(h.controller.pasteValues()).resolves.toBe("done");
    expect([0, 1, 2].map((col) => cell(5, col).resolved)).toEqual(["007", "1/15/2026", "15%"]);
    expect([0, 1, 2].map((col) => cell(5, col).style.numberFormat)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("parses signed HTML numbers into a number column before guarding formula text", async () => {
    const item = new FakeClipboardItem({
      "text/html": new Blob(["<table><tr><td>-5</td></tr><tr><td>+1</td></tr></table>"], {
        type: "text/html",
      }),
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { read: () => Promise.resolve([item]) },
    });
    // Column 1 is the number column.
    h.select(1, 1);

    await expect(h.controller.paste()).resolves.toBe("done");
    expect(h.store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBe(-5);
    expect(h.store.getCell({ sheet: "s1", row: 2, col: 1 }).resolved).toBe(1);
  });

  it("does not trust another controller's private clipboard token", async () => {
    let written: FakeClipboardItem | null = null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: ([item]: FakeClipboardItem[]) => {
          written = item ?? null;
          return Promise.resolve();
        },
      },
    });
    h.store.seed(0, 0, { kind: "formula", src: "=B1" }, 7);
    h.select(0, 0);
    await h.controller.copy();
    const captured = written as unknown as FakeClipboardItem;

    const other = makeHarness();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        read: () => Promise.resolve([captured]),
        readText: () => Promise.reject(new Error("custom payload should be handled first")),
      },
    });
    other.select(3, 0);
    await expect(other.controller.paste()).resolves.toBe("done");
    expect(other.store.getFormula({ sheet: "s1", row: 3, col: 0 })).toBeNull();
    expect(other.store.getCell({ sheet: "s1", row: 3, col: 0 }).resolved).toBe("'=B1");
  });

  it("uses resolved literals for pasteValues from an untrusted rich payload", async () => {
    const item = new FakeClipboardItem({
      [SHEETWRITE_CLIPBOARD_MIME]: new Blob(
        [
          JSON.stringify({
            version: 3,
            token: "untrusted-token-value",
            anchor: { row: 0, col: 0 },
            cells: [
              [
                {
                  value: { kind: "formula", src: "=A1+1" },
                  resolved: 7,
                  style: { italic: true },
                },
              ],
            ],
            hyperlinks: [],
            tsv: "7",
            cut: false,
          }),
        ],
        { type: SHEETWRITE_CLIPBOARD_MIME },
      ),
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        read: () => Promise.resolve([item]),
        readText: () => Promise.reject(new Error("custom payload should be handled first")),
      },
    });
    h.select(5, 0);

    await expect(h.controller.pasteValues()).resolves.toBe("done");
    expect(h.store.getCell({ sheet: "s1", row: 5, col: 0 }).resolved).toBe(7);
    expect(h.store.getFormula({ sheet: "s1", row: 5, col: 0 })).toBeNull();
    expect(h.store.getCell({ sheet: "s1", row: 5, col: 0 }).style).toEqual({});
  });

  describe("applies the pasted-text limits to HTML and another grid's payload", () => {
    const tooWide = 16_385;
    const offer = (type: string, text: string) => {
      const item = new FakeClipboardItem({ [type]: new Blob([text], { type }) });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          read: () => Promise.resolve([item]),
          readText: () => Promise.reject(new Error("the rich payload should be read first")),
        },
      });
    };
    const envelope = (cells: unknown[][]) =>
      JSON.stringify({
        version: 3,
        token: "untrusted-token-value",
        anchor: { row: 0, col: 0 },
        cells,
        hyperlinks: [],
        tsv: "",
        cut: false,
      });
    const literal = { value: { kind: "literal", value: "x" }, resolved: "x", style: {} };
    const padding = " ".repeat(32 * 1024 * 1024);
    const wide = "this paste has 16,385 columns, and a paste can have at most 16,384.";
    const large = "this paste has more than 32 MB of text, the most a paste can have.";

    it.each([
      [
        "HTML wider than a sheet",
        "text/html",
        `<table><tr>${"<td>x</td>".repeat(tooWide)}</tr></table>`,
        wide,
      ],
      [
        "HTML over the byte limit",
        "text/html",
        `<table><tr><td>x</td></tr></table>${padding}`,
        large,
      ],
      [
        "a payload wider than a sheet",
        SHEETWRITE_CLIPBOARD_MIME,
        envelope([Array(tooWide).fill(literal)]),
        wide,
      ],
      [
        "a payload over the byte limit",
        SHEETWRITE_CLIPBOARD_MIME,
        `${envelope([[literal]])}${padding}`,
        large,
      ],
    ])("refuses %s, as pasted text is refused", async (_name, type, text, reason) => {
      offer(type, text);
      h.select(1, 0);

      expect(await h.controller.paste()).toBe("rejected");
      expect(h.refusals).toEqual([reason]);
      expect(h.store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).not.toBe("x");
    });

    it("refuses an oversized payload in Paste Special too", async () => {
      offer(SHEETWRITE_CLIPBOARD_MIME, envelope([Array(tooWide).fill(literal)]));
      h.select(1, 0);

      expect(await h.controller.pasteSpecial({ paste: "values" })).toBe("rejected");
      expect(h.refusals).toEqual([wide]);
    });

    it("pastes the text beside HTML past the limits, as Excel's large HTML gives way to its text", async () => {
      const item = new FakeClipboardItem({
        "text/html": new Blob([`<table><tr>${"<td>x</td>".repeat(tooWide)}</tr></table>`], {
          type: "text/html",
        }),
        "text/plain": new Blob(["from text"], { type: "text/plain" }),
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { read: () => Promise.resolve([item]) },
      });
      h.select(1, 0);

      await expect(h.controller.paste()).resolves.toBe("done");
      expect(h.store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe("from text");
    });

    it("pastes this grid's own copy whatever the size of its payload", async () => {
      let written: FakeClipboardItem | undefined;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          write: ([item]: FakeClipboardItem[]) => {
            written = item;
            return Promise.resolve();
          },
        },
      });
      h.store.seed(0, 0, { kind: "formula", src: "=B1" }, 7);
      h.select(0, 0);
      await h.controller.copy();
      const type = `web ${SHEETWRITE_CLIPBOARD_MIME}`;
      // The write happens in a callback, which narrowing does not see.
      const captured = written as FakeClipboardItem | undefined;
      if (!captured) throw new Error("the copy wrote nothing");
      const json = await (await captured.getType(type)).text();
      offer(type, `${json}${padding}`);
      h.select(3, 0);

      await expect(h.controller.paste()).resolves.toBe("done");
      expect(h.store.getFormula({ sheet: "s1", row: 3, col: 0 })).toBe("=B4");
    });
  });
});

describe("spill clipboard commands", () => {
  function spillHarness() {
    const fake = makeHarness();
    fake.lifetime.close();
    const workbook = makeWorkbook(10);
    const sheet = workbook.sheets[0];
    if (sheet === undefined) throw new Error("Missing clipboard fixture sheet");
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 1, col: 1 },
          value: { kind: "formula", src: "=SEQUENCE(3)" },
        },
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
    const selection = new SelectionModel(10, 0, 2);
    const lifetime = new Scope();
    const clipboard = new ClipboardController({
      lifetime,
      store,
      selection: () => selection,
      activeSheet: () => "s1",
      sheet: () => sheet,
      colIndices: () => [0, 1, 2],
      readOnly: () => false,
      mergeAnchorAt: () => null,
      toDataRow: (row) => row,
      toViewRow: (row) => row,
      undo: () => {
        throw new Error("This harness has no undo history");
      },
      lastUndo: () => null,
      rowSpan: (first, last) => ({ first, last }),
      commit: (patches, reason) => {
        return document.commit(patches, reason);
      },
      onCutChange: () => {},
      loadPasteSpecial: () => import("../src/paste-special.js"),
      askPasteSpecial: async () => null,
      sheetName: () => "Sheet 1",
    });
    const stopListening = store.on("change", (event) => clipboard.storeChanged(event));
    return {
      store,
      document,
      clipboard,
      selection,
      close: () => {
        stopListening();
        lifetime.close();
        document.destroy();
        store.dispose();
      },
    };
  }

  it("does not cut or move a projected child without its anchor", async () => {
    const harness = spillHarness();
    try {
      harness.selection.selectCell(2, 1);
      expect(await harness.clipboard.cut()).toBe("empty");
      expect(harness.document.canUndo).toBe(false);
      expect(harness.store.getCell({ sheet: "s1", row: 2, col: 1 }).resolved).toBe(2);
      harness.selection.selectCell(6, 1);
      expect(await harness.clipboard.paste()).toBe("empty");
      expect(harness.store.getCell({ sheet: "s1", row: 6, col: 1 }).resolved).toBeNull();
    } finally {
      harness.close();
    }
  });

  it("moves the anchor's formula on paste, with undo and redo", async () => {
    const harness = spillHarness();
    const anchor = { sheet: "s1", row: 1, col: 1 };
    const destination = { ...anchor, row: 6 };
    try {
      harness.selection.selectCell(1, 1);
      expect(await harness.clipboard.cut()).toBe("done");
      expect(harness.store.getCell({ ...anchor, row: 2 }).resolved).toBe(2);
      expect(harness.document.canUndo).toBe(false);
      harness.selection.selectCell(6, 1);
      expect(await harness.clipboard.paste()).toBe("done");
      expect(harness.store.getFormula(destination)).toBe("=SEQUENCE(3)");
      expect(harness.store.getCell({ ...destination, row: 8 }).resolved).toBe(3);
      expect(harness.store.getCell(anchor).resolved).toBeNull();
      harness.document.undo();
      expect(harness.store.getCell(destination).resolved).toBeNull();
      expect(harness.store.getCell({ ...anchor, row: 2 }).resolved).toBe(2);
      harness.document.redo();
      expect(harness.store.getCell({ ...destination, row: 8 }).resolved).toBe(3);
    } finally {
      harness.close();
    }
  });

  it("pastes clipboard values into projected children and restores the spill on undo", async () => {
    const harness = spillHarness();
    const source = { sheet: "s1", row: 0, col: 0 };
    const child = { sheet: "s1", row: 2, col: 1 };
    try {
      harness.store.applyTransaction({
        patches: [{ op: "set", addr: source, value: { kind: "literal", value: 99 } }],
      });
      harness.selection.selectCell(0, 0);
      expect(await harness.clipboard.copy()).toBe("done");
      harness.selection.selectCell(2, 1);
      expect(await harness.clipboard.paste()).toBe("done");
      expect(harness.store.getCell(child).resolved).toBe(99);
      expect(harness.store.getCell({ ...child, row: 1 }).resolved).toBe("#SPILL!");
      harness.document.undo();
      expect(harness.store.getCell(child).resolved).toBe(2);
      harness.document.redo();
      expect(harness.store.getCell(child).resolved).toBe(99);
    } finally {
      harness.close();
    }
  });
});

describe("SheetwriteStore clipboard bulk reads", () => {
  it("returns discontiguous sorted rows with formulas, refs, and base styles", () => {
    const store = new SheetwriteStore(makeWorkbook(10), makeColumnarData(10));
    try {
      store.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: "s1", row: 0, col: 1 },
            value: { kind: "formula", src: "=1+1" },
            style: { bold: true },
          },
          {
            op: "set",
            addr: { sheet: "s1", row: 1, col: 1 },
            value: { kind: "ref", target: { sheet: "s1", row: 0, col: 1 } },
            style: { italic: true },
          },
        ],
      });
      const rich = store.getClipboardWindow("s1", { start: 0, end: 2 }, [1]);
      expect(rich.formulas).toEqual([{ offset: 0, source: "=1+1" }]);
      expect(rich.refs).toEqual([{ offset: 1, target: { sheet: "s1", row: 0, col: 1 } }]);
      expect(rich.styles[rich.styleIds[0]!]).toMatchObject({ bold: true });
      expect(rich.styles[rich.styleIds[1]!]).toMatchObject({ italic: true });

      store.setViewSort("s1", [{ col: 1, ascending: false }]);
      const sorted = store.getClipboardWindow("s1", { start: 0, end: 10 }, [1]);
      expect(sorted.values).toHaveLength(10);
      const amounts = Array.from(sorted.values, Number);
      expect(amounts).toEqual([...amounts].sort((left, right) => right - left));
      expect(sorted.ffiCalls).toBe(4);
      const sortedRows = Array.from(sorted.dataRows);
      expect(sorted.formulas).toEqual([{ offset: sortedRows.indexOf(0), source: "=1+1" }]);
      expect(sorted.refs).toEqual([
        {
          offset: sortedRows.indexOf(1),
          target: { sheet: "s1", row: 0, col: 1 },
        },
      ]);
    } finally {
      store.dispose();
    }
  });
});
