import { afterEach, beforeAll, describe, expect, it } from "bun:test";

import { ClipboardController, SHEETWRITE_CLIPBOARD_MIME } from "../src/clipboard-controller.js";
import { parseTsv, rowsToTsv } from "../src/clipboard.js";
import { DocumentController } from "../src/document-controller.js";
import { validateDocumentOperationShape } from "../src/document-protocol.js";
import { initSheetwrite } from "../src/grid.js";
import { rebaseDocumentOperations } from "../src/rebase.js";
import { encodeRowOrder } from "../src/row-order.js";
import { Scope } from "../src/scope.js";
import { SelectionModel, type SelRect } from "../src/selection.js";
import { SheetwriteStore } from "../src/store.js";
import type {
  CellAddress,
  CellFormat,
  CellStyle,
  DocumentOp,
  PasteSpecialOptions,
  Range,
  Store,
} from "../src/types.js";
import { makeColumnarData, makeWorkbook, range, sheet } from "./fixtures.js";

// Excel, "Move or copy cells and cell contents" and "Paste options":
// https://support.microsoft.com/en-us/office/move-or-copy-cells-and-cell-contents-803d65eb-6a3e-4534-8c6f-ff12d1c4139e
// https://support.microsoft.com/en-us/excel/paste-options

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

/** Replace the browser clipboard with `value`. */
function use_clipboard(value: object): void {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value });
}

/** A clipboard item that holds `text` as `type`. */
function item(type: string, text: string): FakeClipboardItem {
  return new FakeClipboardItem({ [type]: new Blob([text], { type }) });
}

const ROWS = 30;
const harnesses: Array<{ close: () => void }> = [];
afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.close();
});

/**
 * A grid's clipboard over a real store with sheets `s1` ("Data") and `s2`
 * ("Summary"), both 30 rows by A:D of `columnType` (number by default). With
 * `nativeFormatsOnly`, the clipboard takes only plain text and HTML, as
 * Firefox's and Safari's do: a write with another format fails.
 */
function clipboard_harness(
  options: {
    nativeFormatsOnly?: boolean;
    maxRowsPerSheet?: number;
    columnType?: CellFormat;
    mergeAnchorAt?: (row: number, col: number) => SelRect | null;
    /** Give the controller a store without the packed read, as a custom store may be. */
    perCellReads?: boolean;
  } = {},
) {
  const clip: { items: FakeClipboardItem[]; text: string } = { items: [], text: "" };
  Object.defineProperty(globalThis, "ClipboardItem", {
    configurable: true,
    value: FakeClipboardItem,
  });
  use_clipboard({
    write: (items: FakeClipboardItem[]) => {
      const native = ["text/plain", "text/html"];
      if (
        options.nativeFormatsOnly &&
        items.some((written) => written.types.some((type) => !native.includes(type)))
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
  });

  const typed = (id: string, name: string) => {
    const base = sheet(id, ROWS);
    const columns = base.columns.map((column) => ({
      ...column,
      type: options.columnType ?? column.type,
    }));
    return { ...base, name, columns };
  };
  const store = new SheetwriteStore(
    { activeSheet: "s1", sheets: [typed("s1", "Data"), typed("s2", "Summary")] },
    undefined,
    options.maxRowsPerSheet === undefined
      ? {}
      : { snapshotResourceLimits: { maxRowsPerSheet: options.maxRowsPerSheet } },
  );
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
  let active_sheet = "s1";
  const marks: Array<Range | null> = [];
  const refusals: string[] = [];
  const asked: boolean[] = [];
  const sheet_of = (id: string) =>
    store.getWorkbook().sheets.find((candidate) => candidate.id === id)!;
  const reads = options.perCellReads
    ? (new Proxy(store, {
        get: (target, key) => {
          if (key === "getClipboardWindow") return undefined;
          const value: unknown = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as Store)
    : store;
  const clipboard = new ClipboardController({
    lifetime,
    store: reads,
    selection: () => selection,
    activeSheet: () => active_sheet,
    sheet: () => sheet_of(active_sheet),
    colIndices: () => [0, 1, 2, 3],
    readOnly: () => false,
    mergeAnchorAt: options.mergeAnchorAt ?? (() => null),
    toDataRow: (row) => row,
    toViewRow: (row) => row,
    undo: () => {
      throw new Error("This harness has no undo history");
    },
    lastUndo: () => null,
    rowSpan: (first, last) => ({ first, last }),
    commit: (patches, reason) => document.commit(patches, reason),
    onCutChange: (cut) => marks.push(cut),
    loadPasteSpecial: () => import("../src/paste-special.js"),
    askPasteSpecial: async (own_copy) => {
      asked.push(own_copy);
      return null;
    },
    sheetName: (id) => sheet_of(id)?.name,
    onPasteRefused: (reason) => refusals.push(reason),
  });
  const stop_listening = store.on("change", (event) => clipboard.storeChanged(event));

  const at = (row: number, col: number, sheet_id = "s1"): CellAddress => ({
    sheet: sheet_id,
    row,
    col,
  });
  const select = (r0: number, c0: number, r1 = r0, c1 = c0) => {
    selection.selectCell(r0, c0);
    if (r1 !== r0 || c1 !== c0) selection.extendTo(r1, c1);
  };
  const harness = {
    store,
    document,
    clipboard,
    lifetime,
    marks,
    refusals,
    asked,
    clip,
    at,
    select,
    sheetOf: sheet_of,
    value: (row: number, col: number, sheet_id?: string) =>
      store.getCell(at(row, col, sheet_id)).resolved,
    formula: (row: number, col: number, sheet_id?: string) =>
      store.getFormula(at(row, col, sheet_id)),
    style: (row: number, col: number) => store.getCell(at(row, col)).style,
    apply: (patches: DocumentOp[]) => document.commit(patches, "api"),
    /** Set a cell of `s1`; a string that starts with `=` is a formula. */
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
    copy: async (r0: number, c0: number, r1 = r0, c1 = c0) => {
      select(r0, c0, r1, c1);
      expect(await clipboard.copy()).toBe("done");
    },
    paste: (row: number, col: number) => {
      select(row, col);
      return clipboard.paste();
    },
    pasteSpecial: (options: PasteSpecialOptions, row: number, col: number) => {
      select(row, col);
      return clipboard.pasteSpecial(options);
    },
    showSheet: (id: string) => {
      active_sheet = id;
    },
    close: () => {
      stop_listening();
      lifetime.close();
      document.destroy();
      store.dispose();
    },
  };
  harnesses.push(harness);
  return harness;
}

describe("ClipboardController", () => {
  it("repeats a copied cell over a larger selection, shifting each copy, as Excel does", async () => {
    const h = clipboard_harness();
    h.set(1, 1, "=A2+B$2");
    await h.copy(1, 1);

    h.select(3, 1, 5, 2);
    await h.clipboard.paste();

    // Relative A2 shifts with each copy; absolute-row B$2 keeps its row.
    expect([h.formula(3, 1), h.formula(5, 1), h.formula(4, 2)]).toEqual([
      "=A4+B$2",
      "=A6+B$2",
      "=B5+C$2",
    ]);
  });

  it("marks the captured source when selection changes during the clipboard write", async () => {
    const h = clipboard_harness();
    const { promise: pending_write, resolve: finish_write } = Promise.withResolvers<void>();
    use_clipboard({ writeText: () => pending_write, readText: () => Promise.resolve("") });
    h.set(1, 1, "=A1+B$2");
    h.set(3, 1, "keep");
    h.select(1, 1);

    const cut = h.clipboard.cut();
    h.select(3, 1);
    finish_write();
    await cut;

    expect(h.marks).toEqual([range("s1", 1, 1, 1, 1)]);
    expect(h.formula(1, 1)).toBe("=A1+B$2");
    expect(h.value(3, 1)).toBe("keep");
  });

  it("lets a newer paste stop an older one that is still reading", async () => {
    const h = clipboard_harness();
    const reads: Array<(text: string) => void> = [];
    use_clipboard({
      readText: () => {
        const read = Promise.withResolvers<string>();
        reads.push(read.resolve);
        return read.promise;
      },
    });

    const older = h.paste(3, 1);
    const newer = h.paste(5, 1);
    reads[1]?.("new");
    reads[0]?.("old");

    expect(await older).toBe("empty");
    expect(await newer).toBe("done");
    expect([h.value(3, 1), h.value(5, 1)]).toEqual([null, "new"]);
  });

  it("copies bounded hyperlink metadata with a new stable identity and translated range", async () => {
    const h = clipboard_harness();
    const link = {
      target: { kind: "external" as const, url: "https://example.com/report" },
      display: "Report",
      style: { color: "#123456", underline: true },
    };
    h.apply([
      {
        op: "setHyperlink",
        sheet: "s1",
        hyperlink: { id: "source-link", range: range("s1", 0, 0, 0, 0), ...link },
      },
    ]);
    await h.copy(0, 0);
    await h.paste(2, 0);

    const links = h.sheetOf("s1").hyperlinks ?? [];
    expect(links).toHaveLength(2);
    expect(links[1]).toMatchObject({ range: range("s1", 2, 0, 2, 0), ...link });
    expect(links[1]!.id).not.toBe("source-link");
  });

  it("preserves signed numbers from external paste", async () => {
    const h = clipboard_harness();
    h.clip.text = "text\t-1\r\ntext\t+1";
    await h.paste(0, 0);

    expect([h.value(0, 1), h.value(1, 1)]).toEqual([-1, 1]);
  });

  it("serializes covered merge cells as blanks", async () => {
    const h = clipboard_harness({
      mergeAnchorAt: (row, col) => (row === 0 && col <= 1 ? { r0: 0, c0: 0, r1: 0, c1: 1 } : null),
    });
    h.set(0, 0, "anchor");
    h.set(0, 1, "covered");
    await h.copy(0, 0, 0, 1);
    await h.paste(2, 0);

    expect([h.value(2, 0), h.value(2, 1)]).toEqual(["anchor", null]);
  });

  it("keeps a cut source when the grid closes before the clipboard accepts it", async () => {
    const h = clipboard_harness();
    const { promise: pending_write, resolve: finish_write } = Promise.withResolvers<void>();
    use_clipboard({ writeText: () => pending_write, readText: () => Promise.resolve("") });
    h.set(1, 1, "=A1+B$2");
    h.select(1, 1);

    const cut = h.clipboard.cut();
    h.lifetime.close();
    finish_write();

    expect(await cut).toBe("empty");
  });

  it("pasteValues writes the resolved literal and no formula", async () => {
    const h = clipboard_harness();
    h.set(0, 2, "=5*3");
    await h.copy(0, 2);

    h.select(2, 2);
    await h.clipboard.pasteValues();

    expect([h.value(2, 2), h.formula(2, 2)]).toEqual([15, null]);
  });

  it("neutralizes injection prefixes in external text, never producing a formula", async () => {
    const h = clipboard_harness();
    h.clip.text = "=SUM(A1)\tsafe";
    await h.paste(0, 0);

    expect([h.value(0, 0), h.formula(0, 0)]).toEqual(["'=SUM(A1)", null]);
  });

  it("resolves 'blocked' on a rejected readText and leaves the store unchanged", async () => {
    const h = clipboard_harness();
    h.set(1, 1, "keep");
    use_clipboard({ readText: () => Promise.reject(new Error("read denied")) });

    await expect(h.paste(1, 1)).resolves.toBe("blocked");
    expect(h.value(1, 1)).toBe("keep");
  });

  it.each([false, true])(
    "round-trips formulas, refs and styles through the browser custom clipboard format (per-cell reads: %p)",
    async (per_cell_reads) => {
      const h = clipboard_harness({ perCellReads: per_cell_reads });
      h.set(0, 0, "=B1", { bold: true, backgroundColor: "#abcdef" });
      h.apply([
        {
          op: "set",
          addr: h.at(0, 1),
          value: { kind: "ref", target: h.at(1, 1) },
          style: { italic: true },
        },
      ]);
      await h.copy(0, 0, 0, 1);

      expect(h.clip.items[0]?.types.sort()).toEqual([
        "text/html",
        "text/plain",
        `web ${SHEETWRITE_CLIPBOARD_MIME}`,
      ]);
      await expect(h.paste(2, 0)).resolves.toBe("done");
      expect(h.formula(2, 0)).toBe("=B3");
      expect(h.style(2, 0)).toEqual({ bold: true, backgroundColor: "#abcdef" });
      expect(h.store.getRefTarget(h.at(2, 1))).toEqual(h.at(1, 1));
      expect(h.style(2, 1)).toEqual({ italic: true });
    },
  );

  it("exports safe colors and both text decorations in copied HTML", async () => {
    const h = clipboard_harness();
    h.set(0, 0, "styled", {
      underline: true,
      strikethrough: true,
      color: "red;background-image:url(https://example.test/pixel)",
      backgroundColor: "#123456",
    });
    await h.copy(0, 0);
    const html = await (await h.clip.items[0]!.getType("text/html")).text();

    expect(html).not.toContain("background-image");
    expect(html).toContain("background-color:#123456");
    expect(html).toContain("text-decoration:underline line-through");
  });

  it("hardens every dangerous prefix in plain and preferred HTML while trusted private cells stay exact", async () => {
    const h = clipboard_harness();
    const originals = [
      ["=cmd", "+1", "-1"],
      ["@x", "\tx", "\rx"],
    ];
    h.apply(
      originals.flatMap((row, r) =>
        row.map((value, c): DocumentOp => ({
          op: "set",
          addr: h.at(r, c),
          value: { kind: "literal", value },
        })),
      ),
    );
    await h.copy(0, 0, 1, 2);

    const copied = h.clip.items[0]!;
    const expected = originals.map((row) => row.map((value) => `'${value}`));
    expect(parseTsv(await (await copied.getType("text/plain")).text())).toEqual(expected);
    const html = await (await copied.getType("text/html")).text();
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(Array.from(document.querySelectorAll("td"), (cell) => cell.textContent)).toEqual(
      expected.flat(),
    );
    expect(document.querySelector("[data-sheetwrite-formula]")).toBeNull();
    // Another grid reads the exact cells from the private format.
    const envelope = JSON.parse(
      await (await copied.getType(`web ${SHEETWRITE_CLIPBOARD_MIME}`)).text(),
    ) as { cells: Array<Array<{ value: { value?: unknown } }>> };
    expect(envelope.cells.map((row) => row.map((cell) => cell.value.value))).toEqual(originals);

    await expect(h.paste(10, 0)).resolves.toBe("done");
    expect(originals.map((row, r) => row.map((_, c) => h.value(r + 10, c)))).toEqual(originals);
  });

  it("pastes every external HTML formula as inert text, including nested dangerous calls", async () => {
    const h = clipboard_harness();
    const html =
      '<table><tbody><tr><td data-formula="=A1+1" style="font-weight:bold;color:#123456">2</td>' +
      '<td data-formula="=IF(1,WEBSERVICE(&quot;https://example.test&quot;),0)">' +
      '<img src=x onerror="globalThis.__clipboardExecuted=true">formula</td></tr></tbody></table>';
    h.clip.items = [item("text/html", html)];

    await expect(h.paste(1, 0)).resolves.toBe("done");
    expect([h.formula(1, 0), h.value(1, 0)]).toEqual([null, "'=A1+1"]);
    expect(h.style(1, 0)).toMatchObject({ bold: true, color: "#123456" });
    expect(h.formula(1, 1)).toBeNull();
    expect(h.value(1, 1)).toStartWith("'=IF(1,WEBSERVICE");
    expect((globalThis as Record<string, unknown>).__clipboardExecuted).toBeUndefined();
  });

  it("keeps the cells Excel's HTML marks as text as text in general columns, as Excel does", async () => {
    const h = clipboard_harness({ columnType: "general" });
    // Excel marks a cell in its Text format with mso-number-format:"\@", in a
    // class of the page's style sheet or in the cell's style, and writes x:str
    // on a cell whose value is a string.
    const html =
      '<html><head><style><!--\n.xl65\n\t{mso-style-parent:style0;\n\tmso-number-format:"\\@";}\n--></style></head><body><table>' +
      "<tr><td class=xl65>007</td><td style='mso-number-format:\"\\@\"'>1/15/2026</td><td x:str>15%</td></tr>" +
      "<tr><td>007</td><td>1/15/2026</td><td>15%</td></tr>" +
      "</table></body></html>";
    h.clip.items = [
      new FakeClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob(["007\t1/15/2026\t15%\r\n007\t1/15/2026\t15%\r\n"], {
          type: "text/plain",
        }),
      }),
    ];
    const row = (r: number) => [0, 1, 2].map((col) => h.value(r, col));
    const formats = (r: number) => [0, 1, 2].map((col) => h.style(r, col).numberFormat);

    await expect(h.paste(1, 0)).resolves.toBe("done");
    expect(row(1)).toEqual(["007", "1/15/2026", "15%"]);
    expect(formats(1)).toEqual(["@", "@", "@"]);
    // Cells without the mark still read as General reads a typed entry.
    expect(row(2)).toEqual([7, 46037, 0.15]);

    // Paste Values keeps the text and leaves the format.
    h.select(5, 0);
    await expect(h.clipboard.pasteValues()).resolves.toBe("done");
    expect(row(5)).toEqual(["007", "1/15/2026", "15%"]);
    expect(formats(5)).toEqual([undefined, undefined, undefined]);
  });

  it("parses signed HTML numbers into a number column before guarding formula text", async () => {
    const h = clipboard_harness();
    h.clip.items = [item("text/html", "<table><tr><td>-5</td></tr><tr><td>+1</td></tr></table>")];

    await expect(h.paste(1, 1)).resolves.toBe("done");
    expect([h.value(1, 1), h.value(2, 1)]).toEqual([-5, 1]);
  });

  it("does not trust another controller's private clipboard token", async () => {
    const h = clipboard_harness();
    h.set(0, 0, "=B1");
    await h.copy(0, 0);

    const other = clipboard_harness();
    other.clip.items = h.clip.items;
    await expect(other.paste(3, 0)).resolves.toBe("done");
    expect([other.formula(3, 0), other.value(3, 0)]).toEqual([null, "'=B1"]);
  });

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

  it("uses resolved literals for pasteValues from an untrusted rich payload", async () => {
    const h = clipboard_harness();
    const cell = { value: { kind: "formula", src: "=A1+1" }, resolved: 7, style: { italic: true } };
    h.clip.items = [item(SHEETWRITE_CLIPBOARD_MIME, envelope([[cell]]))];
    h.select(5, 0);

    await expect(h.clipboard.pasteValues()).resolves.toBe("done");
    expect([h.value(5, 0), h.formula(5, 0), h.style(5, 0)]).toEqual([7, null, {}]);
  });

  describe("applies the pasted-text limits to HTML and another grid's payload", () => {
    const too_wide = 16_385;
    const literal = { value: { kind: "literal", value: "x" }, resolved: "x", style: {} };
    const padding = " ".repeat(32 * 1024 * 1024);
    const wide = "this paste has 16,385 columns, and a paste can have at most 16,384.";
    const large = "this paste has more than 32 MB of text, the most a paste can have.";
    const wide_html = `<table><tr>${"<td>x</td>".repeat(too_wide)}</tr></table>`;

    it.each([
      ["HTML wider than a sheet", "text/html", wide_html, wide],
      [
        "HTML over the byte limit",
        "text/html",
        `<table><tr><td>x</td></tr></table>${padding}`,
        large,
      ],
      [
        "a payload wider than a sheet",
        SHEETWRITE_CLIPBOARD_MIME,
        envelope([Array(too_wide).fill(literal)]),
        wide,
      ],
      [
        "a payload over the byte limit",
        SHEETWRITE_CLIPBOARD_MIME,
        `${envelope([[literal]])}${padding}`,
        large,
      ],
    ])("refuses %s, as pasted text is refused", async (_name, type, text, reason) => {
      const h = clipboard_harness();
      h.clip.items = [item(type, text)];

      expect(await h.paste(1, 0)).toBe("rejected");
      expect(h.refusals).toEqual([reason]);
      expect(h.value(1, 0)).not.toBe("x");
    });

    it("refuses an oversized payload in Paste Special too", async () => {
      const h = clipboard_harness();
      h.clip.items = [item(SHEETWRITE_CLIPBOARD_MIME, envelope([Array(too_wide).fill(literal)]))];

      expect(await h.pasteSpecial({ paste: "values" }, 1, 0)).toBe("rejected");
      expect(h.refusals).toEqual([wide]);
    });

    it("pastes the text beside HTML past the limits, as Excel's large HTML gives way to its text", async () => {
      const h = clipboard_harness();
      h.clip.items = [
        new FakeClipboardItem({
          "text/html": new Blob([wide_html], { type: "text/html" }),
          "text/plain": new Blob(["from text"], { type: "text/plain" }),
        }),
      ];

      await expect(h.paste(1, 0)).resolves.toBe("done");
      expect(h.value(1, 0)).toBe("from text");
    });

    it("pastes this grid's own copy whatever the size of its payload", async () => {
      const h = clipboard_harness();
      h.set(0, 0, "=B1");
      await h.copy(0, 0);
      const type = `web ${SHEETWRITE_CLIPBOARD_MIME}`;
      const json = await (await h.clip.items[0]!.getType(type)).text();
      h.clip.items = [item(type, `${json}${padding}`)];

      await expect(h.paste(3, 0)).resolves.toBe("done");
      expect(h.formula(3, 0)).toBe("=B4");
    });
  });
});

describe("spill clipboard commands", () => {
  /** B2 holds =SEQUENCE(3), which spills into B3:B4. */
  function spill_harness() {
    const h = clipboard_harness();
    h.set(1, 1, "=SEQUENCE(3)");
    return h;
  }

  it("does not cut or move a projected child without its anchor", async () => {
    const h = spill_harness();
    h.select(2, 1);
    expect(await h.clipboard.cut()).toBe("empty");
    expect(h.value(2, 1)).toBe(2);
    expect(await h.paste(6, 1)).toBe("empty");
    expect(h.value(6, 1)).toBeNull();
  });

  it("moves the anchor's formula on paste, with undo and redo", async () => {
    const h = spill_harness();
    h.select(1, 1);
    expect(await h.clipboard.cut()).toBe("done");
    expect(h.value(2, 1)).toBe(2);
    expect(await h.paste(6, 1)).toBe("done");
    expect([h.formula(6, 1), h.value(8, 1), h.value(1, 1)]).toEqual(["=SEQUENCE(3)", 3, null]);
    h.document.undo();
    expect([h.value(6, 1), h.value(2, 1)]).toEqual([null, 2]);
    h.document.redo();
    expect(h.value(8, 1)).toBe(3);
  });

  it("pastes clipboard values into projected children and restores the spill on undo", async () => {
    const h = spill_harness();
    h.set(0, 0, 99);
    await h.copy(0, 0);
    expect(await h.paste(2, 1)).toBe("done");
    expect([h.value(2, 1), h.value(1, 1)]).toEqual([99, "#SPILL!"]);
    h.document.undo();
    expect(h.value(2, 1)).toBe(2);
    h.document.redo();
    expect(h.value(2, 1)).toBe(99);
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
      const sorted_rows = Array.from(sorted.dataRows);
      expect(sorted.formulas).toEqual([{ offset: sorted_rows.indexOf(0), source: "=1+1" }]);
      expect(sorted.refs).toEqual([
        {
          offset: sorted_rows.indexOf(1),
          target: { sheet: "s1", row: 0, col: 1 },
        },
      ]);
    } finally {
      store.dispose();
    }
  });
});

describe("cut and paste", () => {
  it("marks the cells on cut and moves them, with every reference, on paste (#756)", async () => {
    const h = clipboard_harness();
    h.set(0, 0, 1);
    h.set(1, 0, 2);
    h.set(0, 1, "=A1*10");
    h.set(5, 3, "=A1+A2");

    h.select(0, 0, 1, 0);
    expect(await h.clipboard.cut()).toBe("done");
    // Nothing changes until the paste.
    expect([h.value(0, 0), h.value(1, 0)]).toEqual([1, 2]);
    expect(h.marks).toEqual([range("s1", 0, 0, 1, 0)]);

    expect(await h.paste(19, 0)).toBe("done");
    expect([h.value(19, 0), h.value(20, 0), h.value(0, 0), h.value(1, 0)]).toEqual([
      1,
      2,
      null,
      null,
    ]);
    expect([h.formula(0, 1), h.formula(5, 3), h.value(5, 3)]).toEqual(["=A20*10", "=A20+A21", 3]);
    expect(h.marks.at(-1)).toBeNull();

    // One undo step puts everything back, and redo moves it again.
    h.document.undo();
    expect([h.value(0, 0), h.value(1, 0), h.value(19, 0)]).toEqual([1, 2, null]);
    expect([h.formula(0, 1), h.formula(5, 3)]).toEqual(["=A1*10", "=A1+A2"]);
    h.document.redo();
    expect([h.formula(5, 3), h.value(20, 0)]).toEqual(["=A20+A21", 2]);

    // The pasted cut is used up, as in Excel.
    expect(await h.paste(25, 0)).toBe("empty");
  });

  it("keeps a moved formula pointing at the same cells", async () => {
    const h = clipboard_harness();
    h.set(0, 0, 4);
    h.set(0, 2, 5);
    h.set(0, 1, "=A1+C1");

    h.select(0, 0, 0, 1);
    await h.clipboard.cut();
    await h.paste(9, 2);

    expect([h.formula(9, 3), h.value(9, 3)]).toEqual(["=C10+C1", 9]);
  });

  it("moves a block onto part of itself", async () => {
    const h = clipboard_harness();
    h.set(0, 0, 1);
    h.set(1, 0, 2);
    h.set(2, 0, 3);
    h.set(0, 3, "=SUM(A1:A3)");

    h.select(0, 0, 2, 0);
    await h.clipboard.cut();
    await h.paste(1, 0);

    expect([h.value(0, 0), h.value(1, 0), h.value(2, 0), h.value(3, 0)]).toEqual([null, 1, 2, 3]);
    expect(h.formula(0, 3)).toBe("=SUM(A2:A4)");
  });

  it("replaces the cells it lands on, and undo brings them back", async () => {
    const h = clipboard_harness();
    h.set(0, 0, 1);
    h.set(2, 2, 5);
    h.set(4, 1, "=C3");

    h.select(0, 0);
    await h.clipboard.cut();
    await h.paste(2, 2);
    expect([h.value(2, 2), h.formula(4, 1)]).toEqual([1, "=#REF!"]);

    h.document.undo();
    expect([h.value(0, 0), h.value(2, 2), h.formula(4, 1), h.value(4, 1)]).toEqual([
      1,
      5,
      "=C3",
      5,
    ]);
  });

  it("moves cells, notes and hyperlinks to another sheet", async () => {
    const h = clipboard_harness();
    h.set(0, 0, 3);
    h.set(1, 0, "=A1*2");
    h.set(0, 3, "=A2+1");
    h.apply([
      { op: "setNote", addr: h.at(0, 0), text: "checked" },
      {
        op: "setHyperlink",
        sheet: "s1",
        hyperlink: {
          id: "link",
          range: range("s1", 1, 0, 1, 0),
          target: { kind: "external", url: "https://example.com/" },
        },
      },
    ]);

    h.select(0, 0, 1, 0);
    await h.clipboard.cut();
    h.showSheet("s2");
    expect(await h.paste(4, 1)).toBe("done");

    expect(h.value(0, 0)).toBeNull();
    expect([h.formula(5, 1, "s2"), h.value(5, 1, "s2")]).toEqual(["=B5*2", 6]);
    expect(h.formula(0, 3)).toBe("=Summary!B6+1");
    expect(h.sheetOf("s1").notes ?? []).toEqual([]);
    expect(h.sheetOf("s2").notes).toEqual([{ addr: h.at(4, 1, "s2"), text: "checked" }]);
    expect(h.sheetOf("s1").hyperlinks ?? []).toEqual([]);
    expect(h.sheetOf("s2").hyperlinks?.map((link) => link.range)).toEqual([
      range("s2", 5, 1, 5, 1),
    ]);
  });

  it("ends the cut on Esc, a new copy or another edit, and the ended cut does not paste", async () => {
    const h = clipboard_harness();
    h.set(0, 0, 1);

    h.select(0, 0);
    await h.clipboard.cut();
    expect(h.clipboard.cancelCut()).toBe(true);
    expect(h.clipboard.cancelCut()).toBe(false);
    expect(h.marks).toEqual([expect.anything(), null]);
    expect(await h.paste(5, 0)).toBe("empty");
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
    expect(await h.paste(5, 0)).toBe("done");
    expect([h.value(0, 0), h.value(5, 0)]).toEqual([1, 1]);
  });

  it.each<[string, DocumentOp]>([
    [
      "sort",
      {
        op: "permuteRows",
        range: range("s1", 0, 0, 2, 3),
        encoding: "u32le-base64-v1",
        order: encodeRowOrder(new Uint32Array([2, 0, 1])),
      },
    ],
    [
      "edit",
      { op: "set", addr: { sheet: "s1", row: 1, col: 0 }, value: { kind: "literal", value: 9 } },
    ],
    ["clear", { op: "clearRange", range: range("s1", 0, 0, 2, 3) }],
    ["format", { op: "setRangeStyle", range: range("s1", 0, 0, 2, 3), style: { bold: true } }],
    ["note", { op: "setNote", addr: { sheet: "s1", row: 0, col: 0 }, text: "peer" }],
  ])(
    "ends the cut when a peer's %s reaches its cells, and not for other cells (#1074)",
    async (_name, change) => {
      const h = clipboard_harness();
      for (const row of [0, 1, 2]) h.set(row, 0, row + 1);
      h.select(0, 0, 1, 0);
      await h.clipboard.cut();

      // A peer's edit beside the cut, or on another sheet, leaves it waiting.
      h.store.applyTransaction(
        { patches: [{ op: "set", addr: h.at(5, 2), value: { kind: "literal", value: 1 } }] },
        { source: "remote" },
      );
      h.store.applyTransaction(
        { patches: [{ op: "set", addr: h.at(0, 0, "s2"), value: { kind: "literal", value: 1 } }] },
        { source: "remote" },
      );
      expect(h.marks).toHaveLength(1);

      expect(h.store.applyTransaction({ patches: [change] }, { source: "remote" }).status).toBe(
        "applied",
      );
      expect(h.marks.at(-1)).toBeNull();
      const before = [h.value(0, 0), h.value(1, 0), h.value(10, 0)];
      h.select(10, 0);
      expect(await h.clipboard.paste()).toBe("empty");
      expect([h.value(0, 0), h.value(1, 0), h.value(10, 0)]).toEqual(before);
    },
  );

  it("pastes another app's clipboard as a plain paste and ends the cut", async () => {
    const h = clipboard_harness();
    h.set(0, 0, 1);

    h.select(0, 0);
    await h.clipboard.cut();
    h.clip.items = [item("text/plain", "42")];
    expect(await h.paste(5, 0)).toBe("done");

    expect([h.value(0, 0), h.value(5, 0)]).toEqual([1, 42]);
    expect(h.marks.at(-1)).toBeNull();
  });

  it("moves validation and conditional-format rules inside the block, and undo puts them back", async () => {
    const h = clipboard_harness();
    h.set(0, 0, 4);
    h.set(0, 1, 1);
    const format = {
      range: range("s1", 0, 0, 2, 0),
      when: { kind: "formula" as const, source: "=A1>B1" },
      style: { bold: true },
    };
    const rule = (id: string, at: Range, values: number[]): DocumentOp => ({
      op: "setValidationRule",
      sheet: "s1",
      rule: { id, range: at, condition: { kind: "list", values }, policy: "warn" },
    });
    h.apply([
      rule("moved", range("s1", 0, 0, 2, 0), [1, 2, 3, 4]),
      rule("replaced", range("s1", 9, 2, 9, 2), [5]),
      { op: "setSheetMeta", sheet: "s1", patch: { conditionalFormats: [format] } },
    ]);

    // A1:B5 lands on C10:D14.
    h.select(0, 0, 4, 1);
    await h.clipboard.cut();
    expect(await h.paste(9, 2)).toBe("done");

    const moved = h.sheetOf("s1");
    expect(moved.validationRules?.map((rule) => [rule.id, rule.range])).toEqual([
      ["moved", range("s1", 9, 2, 11, 2)],
    ]);
    expect(moved.conditionalFormats).toEqual([
      { ...format, range: range("s1", 9, 2, 11, 2), when: { kind: "formula", source: "=C10>D10" } },
    ]);

    h.document.undo();
    const restored = h.sheetOf("s1");
    expect(
      [...(restored.validationRules ?? [])]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((rule) => [rule.id, rule.range]),
    ).toEqual([
      ["moved", range("s1", 0, 0, 2, 0)],
      ["replaced", range("s1", 9, 2, 9, 2)],
    ]);
    expect(restored.conditionalFormats).toEqual([format]);
  });

  it("does not paste values after a cut, as Excel greys out Paste Special", async () => {
    const h = clipboard_harness();
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

  it("moves the cut cells and keeps a copy's formulas in browsers without custom formats (#921)", async () => {
    const h = clipboard_harness({ nativeFormatsOnly: true });
    h.set(0, 0, "a");
    h.set(0, 1, 1);
    h.set(1, 0, "=B1*2");

    h.select(0, 0, 1, 1);
    expect(await h.clipboard.cut()).toBe("done");
    // The fallback writes plain text and HTML; writeText would replace them.
    expect(h.clip.text).toBe("");
    expect(await h.paste(0, 2)).toBe("done");
    expect([h.value(0, 0), h.value(0, 1), h.value(0, 2), h.value(0, 3)]).toEqual([
      null,
      null,
      "a",
      1,
    ]);
    expect(h.formula(1, 2)).toBe("=D1*2");

    await h.copy(0, 2, 1, 3);
    expect(await h.paste(10, 0)).toBe("done");
    expect(h.formula(11, 0)).toBe("=B11*2");
  });

  it("adds the rows a cut needs to move past the last row", async () => {
    const h = clipboard_harness();
    h.set(0, 0, 1);
    h.set(1, 0, 2);
    h.set(2, 0, 3);
    h.select(0, 0, 2, 0);
    await h.clipboard.cut();
    expect(await h.paste(ROWS - 1, 0)).toBe("done");
    expect(h.sheetOf("s1").rowCount).toBe(ROWS + 2);
    expect([h.value(ROWS - 1, 0), h.value(ROWS, 0), h.value(ROWS + 1, 0)]).toEqual([1, 2, 3]);
    expect(h.value(0, 0)).toBeNull();
  });

  it("is refused with the sheet's row limit, and changes nothing, when the sheet cannot grow", async () => {
    const h = clipboard_harness({ maxRowsPerSheet: 40 });
    h.clip.text = Array.from({ length: 20 }, (_, row) => `${row}`).join("\n");
    expect(await h.paste(25, 0)).toBe("rejected");
    expect([h.sheetOf("s1").rowCount, h.value(25, 0)]).toEqual([ROWS, null]);
    expect(h.refusals).toEqual(["Data cannot grow to 45 rows: the limit is 40."]);
  });
});

describe("moveCells operation", () => {
  const move: DocumentOp = {
    op: "moveCells",
    range: range("s1", 0, 0, 1, 0),
    to: { sheet: "s2", row: 4, col: 1 },
  };

  it("is a valid document operation", () => {
    expect(validateDocumentOperationShape(move)).toEqual([]);
    expect(validateDocumentOperationShape({ ...move, to: { sheet: "s2", row: -1 } })).not.toEqual(
      [],
    );
  });

  it("conflicts with concurrent work on either sheet, and not with other sheets", () => {
    const on_target: DocumentOp = {
      op: "set",
      addr: { sheet: "s2", row: 20, col: 3 },
      value: { kind: "literal", value: 1 },
    };
    const elsewhere: DocumentOp = { ...on_target, addr: { sheet: "s3", row: 0, col: 0 } };

    expect(rebaseDocumentOperations([on_target], [move]).status).toBe("conflict");
    expect(rebaseDocumentOperations([elsewhere], [move]).status).toBe("rebased");
  });
});

describe("Paste Special", () => {
  it("adds copied values to the target's numbers and keeps the target's formats, as one undo step", async () => {
    const h = clipboard_harness();
    h.set(0, 0, 10, { bold: true });
    h.set(1, 0, "=A1*2");
    h.set(0, 2, 1, { italic: true });
    h.set(1, 2, "=5");
    await h.copy(0, 0, 1, 0);

    expect(await h.pasteSpecial({ paste: "values", operation: "add" }, 0, 2)).toBe("done");
    expect([h.value(0, 2), h.value(1, 2)]).toEqual([11, 25]);
    // A number stays a number; a formula on either side becomes a formula.
    expect([h.formula(0, 2), h.formula(1, 2)]).toEqual([null, "=(5)+20"]);
    expect(h.style(0, 2)).toEqual({ italic: true });

    h.document.undo();
    expect([h.value(0, 2), h.formula(1, 2)]).toEqual([1, "=5"]);
  });

  it("transposes, skips blanks and shifts each formula by its own move", async () => {
    const h = clipboard_harness();
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
  });

  it("pastes formats, notes, column widths or validation alone", async () => {
    const h = clipboard_harness();
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
    const meta = () => h.sheetOf("s1");

    expect(await h.pasteSpecial({ paste: "formats" }, 3, 2)).toBe("done");
    expect([h.value(3, 2), h.style(3, 2)]).toEqual([3, { bold: true, numberFormat: "0.00" }]);
    expect(await h.pasteSpecial({ paste: "comments" }, 3, 2)).toBe("done");
    expect(meta().notes?.map((note) => [note.addr.row, note.addr.col, note.text])).toEqual([
      [0, 0, "Checked"],
      [3, 2, "Checked"],
    ]);
    expect(await h.pasteSpecial({ paste: "columnWidths" }, 3, 2)).toBe("done");
    expect(meta().columns[2]?.width).toBe(150);
    expect(await h.pasteSpecial({ paste: "validation" }, 3, 2)).toBe("done");
    expect(meta().validationRules?.map((rule) => rule.range)).toEqual([
      range("s1", 0, 0, 0, 0),
      range("s1", 3, 2, 3, 2),
    ]);
    expect(h.value(3, 2)).toBe(3);
  });

  it("links to the copied cells: absolute for one cell, with the sheet's name from another sheet", async () => {
    const h = clipboard_harness();
    h.set(0, 0, 5);
    h.set(1, 0, 6);
    await h.copy(0, 0);
    expect(await h.pasteSpecial({ link: true }, 0, 3)).toBe("done");
    expect(h.formula(0, 3)).toBe("=$A$1");

    await h.copy(0, 0, 1, 0);
    h.showSheet("s2");
    expect(await h.pasteSpecial({ link: true }, 2, 1)).toBe("done");
    expect([h.formula(2, 1, "s2"), h.formula(3, 1, "s2")]).toEqual(["=Data!A1", "=Data!A2"]);
    expect([h.value(2, 1, "s2"), h.value(3, 1, "s2")]).toEqual([5, 6]);
  });

  it("carries notes and conditional formats with Paste, as Excel's All, and merges them on request", async () => {
    const h = clipboard_harness();
    const rule = (r0: number, r1: number) => ({
      range: range("s1", r0, 0, r1, 0),
      when: { kind: "greaterThan" as const, value: 1 },
      style: { bold: true },
    });
    h.set(0, 0, 2);
    h.apply([
      { op: "setNote", addr: h.at(0, 0), text: "Source" },
      { op: "setNote", addr: h.at(10, 0), text: "Target" },
      { op: "setSheetMeta", sheet: "s1", patch: { conditionalFormats: [rule(0, 0), rule(9, 11)] } },
    ]);
    await h.copy(0, 0);
    const meta = () => h.sheetOf("s1");

    expect(await h.paste(10, 0)).toBe("done");
    expect(meta().notes?.find((note) => note.addr.row === 10)?.text).toBe("Source");
    // A10:A12's rule gives up A11, which takes the copied rule.
    expect(
      meta().conditionalFormats?.map((format) => [format.range.start.row, format.range.end.row]),
    ).toEqual([
      [0, 0],
      [9, 9],
      [11, 11],
      [10, 10],
    ]);

    expect(await h.pasteSpecial({ paste: "allMergingConditionalFormats" }, 9, 0)).toBe("done");
    expect(meta().conditionalFormats?.length).toBe(5);

    // With `ask`, the dialog chooses; Cancel pastes nothing.
    expect(await h.pasteSpecial({ ask: true }, 15, 0)).toBe("empty");
    expect(h.asked).toEqual([true]);
    expect(h.value(15, 0)).toBeNull();
  });
});
