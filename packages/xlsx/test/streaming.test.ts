import { heapStats } from "bun:jsc";
import { beforeAll, describe, expect, it, spyOn } from "bun:test";

import {
  type CellValue,
  fromXlsxWorkbook,
  fromXlsxWorkbookFile,
  initSheetwrite,
  SheetwriteStore,
  toXlsxTable,
  toXlsxTableStream,
  toXlsxWorkbook,
  toXlsxWorkbookStream,
  type Workbook,
} from "@sheetwrite/core";
import { deflateSync, strToU8, unzipSync } from "fflate";

import { xlsxAddon } from "../src/index.js";
import { createCodecContext } from "../src/resources.js";
import { sheetwriteWorkbookBackend } from "../src/workbook.js";
import { validateStoredEntry, writeZip, ZipReader } from "../src/zip.js";
import { rawXlsx, rawZip, worksheet } from "./raw-opc.js";
import { book, cellsOf, patchEntries, sheet, sheetAt } from "./workbook-fixtures.js";

beforeAll(async () => {
  await initSheetwrite({ addons: [xlsxAddon()] });
});

const largeSnapshot = (rows: number) =>
  book([
    sheet(
      "s",
      "Data",
      Array.from({ length: rows }, (_, row) => [`text-${row}-${Math.sin(row)}`, row]),
    ),
  ]);

/** A store over one table sheet of `rowCount` rows holding `columns`. */
function tableStore(
  rowCount: number,
  columns: Record<string, (string | number)[]>,
  extra: Partial<Workbook["sheets"][number]> = {},
) {
  const workbook: Workbook = {
    activeSheet: "s",
    sheets: [
      {
        id: "s",
        name: "Table",
        rowCount,
        columns: Object.keys(columns).map((key) => ({
          key,
          header: key.toUpperCase(),
          width: 80,
          type: "text",
        })),
        ...extra,
      },
    ],
  };
  return new SheetwriteStore(workbook, { rowCount, columns });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (let next = await reader.read(); !next.done; next = await reader.read())
    chunks.push(next.value);
  return chunks;
}

const failureOf = (stream: ReadableStream<Uint8Array>) =>
  collect(stream).then(
    () => {
      throw new Error("expected the stream to fail");
    },
    (error: unknown) => error,
  );

/** Stored entries reach the worksheet reader in 8 KiB inflater chunks. */
const CHUNK_BYTES = 8 * 1024;
const storedWorkbook = (sheetXml: string) =>
  new Blob([new Uint8Array(rawXlsx({ sheets: [{ xml: sheetXml }], compressionLevel: 0 }))]);

/** A snapshot cell and its value object: the representation import must return. */
const OUTPUT_OBJECTS_PER_CELL = 2;
const PER_CELL_SLACK = 0.25;
const FIXED_OBJECT_SLACK = 20_000;

function liveObjects(): number {
  Bun.gc(true);
  return heapStats().objectCount;
}

describe("XLSX streaming", () => {
  it("emits bounded workbook chunks with the same entries as the buffered export", async () => {
    const source = largeSnapshot(20_000);
    const chunks = await collect(toXlsxWorkbookStream(source));
    expect(chunks.length).toBeGreaterThan(2);
    expect(Math.max(...chunks.map((chunk) => chunk.byteLength))).toBeLessThanOrEqual(64 * 1024);
    // Streams emit worksheets before the parts that depend on them, so compare entries, not order.
    expect(unzipSync(Buffer.concat(chunks))).toEqual(unzipSync(await toXlsxWorkbook(source)));
  });

  it("stops producing on cancel and surfaces output ceilings as stream errors", async () => {
    const rowCount = 50_000;
    const store = tableStore(rowCount, {
      a: Array.from({ length: rowCount }, (_, row) => `value-${row}-${Math.sin(row)}`),
    });
    let windowReads = 0;
    const readWindow = store.getVisibleWindow.bind(store);
    store.getVisibleWindow = ((sheetId, rows, columns) => {
      windowReads++;
      return readWindow(sheetId, rows, columns);
    }) as typeof store.getVisibleWindow;
    const reader = toXlsxTableStream(store.getWorkbook(), store).getReader();
    expect((await reader.read()).done).toBe(false);
    await reader.cancel();
    const readsAtCancel = windowReads;
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    expect(windowReads).toBe(readsAtCancel);
    expect(readsAtCancel).toBeLessThan(Math.ceil(rowCount / 4096));
    store.dispose();
    expect(
      await failureOf(
        toXlsxWorkbookStream(largeSnapshot(2_000), { resourceLimits: { maxOutputBytes: 1024 } }),
      ),
    ).toMatchObject({ code: "xlsx-resource-limit" });
    const controller = new AbortController();
    controller.abort(new Error("cancelled workbook stream"));
    expect(
      await failureOf(toXlsxWorkbookStream(largeSnapshot(10), { signal: controller.signal })),
    ).toBe(controller.signal.reason);
  });

  it("streams the store-backed table export with the same entries as the buffered export", async () => {
    const rowCount = 10_000;
    const store = tableStore(
      rowCount,
      {
        a: Array.from({ length: rowCount }, (_, row) => `r${row}`),
        b: Array.from({ length: rowCount }, (_, row) => row),
      },
      { merges: [{ r0: 0, c0: 0, r1: 1, c1: 1 }] },
    );
    const streamed = Buffer.concat(await collect(toXlsxTableStream(store.getWorkbook(), store)));
    expect(unzipSync(streamed)).toEqual(unzipSync(await toXlsxTable(store.getWorkbook(), store)));
    const imported = sheetAt(await fromXlsxWorkbook(streamed));
    expect(imported.merges).toEqual([{ r0: 1, c0: 0, r1: 2, c1: 1 }]);
    expect(imported.rowCount).toBe(rowCount + 1);
    store.dispose();
  });

  it("fails instead of mixing table states when the store changes mid-stream", async () => {
    const rowCount = 20_000;
    const store = tableStore(rowCount, {
      a: Array.from({ length: rowCount }, (_, row) => `value-${row}-${Math.sin(row)}`),
    });
    const reader = toXlsxTableStream(store.getWorkbook(), store).getReader();
    await reader.read();
    store.applyTransaction({ patches: [{ op: "addRows", sheet: "s", at: 0, count: 1 }] });
    const failure = await (async () => {
      while (!(await reader.read()).done);
    })().then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({
      code: "export-failed",
      message: expect.stringMatching(/changed during/),
    });
    store.dispose();
  });

  it("imports a seekable Blob with the same result as buffered bytes", async () => {
    const bytes = await toXlsxWorkbook(largeSnapshot(500));
    const fromBlob = await fromXlsxWorkbookFile(new Blob([new Uint8Array(bytes)]));
    expect(fromBlob).toEqual(await fromXlsxWorkbook(bytes));
  });

  // Sweeping the padding before the rows moves the chunk boundary across every byte of the row markup.
  it("imports worksheet rows identically wherever an inflater chunk boundary falls", async () => {
    const rowXml = (row: number) =>
      `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>x&amp;y&#x1F600;é€😀<![CDATA[<c&>]]>z</t></is></c><!-- é --><c r="B${row}"><f>IF(A${row}="&lt;","&amp;",1)</f></c><c r="C${row}"><v>12.5</v></c></row>`;
    const rows = Array.from({ length: 60 }, (_, index) => 10 + index);
    const unitBytes = new TextEncoder().encode(rowXml(10)).byteLength;
    const expected = rows.flatMap((row): [number, number, CellValue][] => [
      [row - 1, 0, { kind: "literal", value: "x&y😀é€😀<c&>z" }],
      [row - 1, 1, { kind: "formula", src: `=IF(A${row}="<","&",1)` }],
      [row - 1, 2, { kind: "literal", value: 12.5 }],
    ]);
    for (let pad = 0; pad < unitBytes; pad++) {
      const xml = worksheet(
        `<!--${"p".repeat(pad)}--><sheetData>${rows.map(rowXml).join("")}</sheetData>`,
      );
      const imported = await fromXlsxWorkbookFile(storedWorkbook(xml));
      expect(
        cellsOf(imported).map((cell) => [cell.row, cell.col, cell.value]),
        `padding ${pad}`,
      ).toEqual(expected);
    }
  });

  it("rejects a DTD split across inflater chunks", async () => {
    const declaration = "<!DOCTYPE worksheet>";
    const declarationOffset = worksheet(`<!---->${declaration}`).indexOf(declaration);
    for (let split = 1; split < "<!DOCTYPE".length; split++) {
      const xml = worksheet(
        `<!--${"p".repeat(CHUNK_BYTES - split - declarationOffset)}-->${declaration}<sheetData/>`,
      );
      expect(xml.indexOf("<!DOCTYPE")).toBe(CHUNK_BYTES - split);
      await expect(
        fromXlsxWorkbookFile(storedWorkbook(xml)),
        `split ${split}`,
      ).rejects.toMatchObject({
        code: "xlsx-import-failed",
        message: expect.stringMatching(/DTDs and entities are forbidden/),
      });
    }
  });

  it("accepts or rejects a long character reference the same way at every chunk split", async () => {
    for (const [reference, accepted] of [
      [`&#${"0".repeat(27)}65;`, true],
      [`&#${"0".repeat(40)}65;`, false],
    ] as const) {
      const body = `<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${reference}</t></is></c></row></sheetData>`;
      const offset = worksheet(`<!---->${body}`).indexOf(reference);
      for (const split of [0, 1, Math.floor(reference.length / 2), reference.length - 1]) {
        const xml = worksheet(`<!--${"p".repeat(CHUNK_BYTES - split - offset)}-->${body}`);
        expect(xml.indexOf(reference), `split ${split}`).toBe(CHUNK_BYTES - split);
        const result = fromXlsxWorkbookFile(storedWorkbook(xml));
        if (accepted) {
          expect(sheetAt(await result).cells[0]?.cells[0]?.value, `split ${split}`).toEqual({
            kind: "literal",
            value: "A",
          });
        } else {
          await expect(result, `split ${split}`).rejects.toMatchObject({
            code: "xlsx-import-failed",
          });
        }
      }
    }
  });

  it("keeps quoted '>' inside a tag that spans many inflater chunks", async () => {
    const xml = worksheet(
      `<dimension ref="A1" note="${"a>b'".repeat(40_000)}"/><sheetData><row r="1"><c r="A1"><v>7</v></c></row></sheetData>`,
    );
    const imported = await fromXlsxWorkbookFile(storedWorkbook(xml));
    expect(sheetAt(imported).cells[0]?.cells.map((cell) => cell.value)).toEqual([
      { kind: "literal", value: 7 },
    ]);
  });

  it("keeps one object representation per cell when the worksheet ends", async () => {
    const rowCount = 20_000;
    const columns = ["A", "B", "C", "D"];
    const rows = Array.from(
      { length: rowCount },
      (_, row) =>
        `<row r="${row + 1}">${columns.map((column, col) => `<c r="${column}${row + 1}"><v>${row * columns.length + col}</v></c>`).join("")}</row>`,
    ).join("");
    // The zoom warning is sent after the last row is read and before the snapshot is built.
    const bytes = rawXlsx({
      sheets: [
        {
          xml: worksheet(
            `<sheetViews><sheetView workbookViewId="0" zoomScale="80"/></sheetViews><sheetData>${rows}</sheetData>`,
          ),
        },
      ],
    });
    const cells = rowCount * columns.length;
    const before = liveObjects();
    let atWorksheetEnd = 0;
    const imported = await fromXlsxWorkbook(bytes, {
      onWarning: (warning) => {
        if (warning.message.includes("zoom")) atWorksheetEnd = liveObjects();
      },
    });

    expect(sheetAt(imported).cells[0]?.cells).toHaveLength(cells);
    expect(atWorksheetEnd).toBeGreaterThan(before);
    // Each output cell is two objects, a cell and its value. A second per-cell
    // record or a retained row tree adds at least one more object per cell.
    expect(atWorksheetEnd - before).toBeLessThan(
      cells * (OUTPUT_OBJECTS_PER_CELL + PER_CELL_SLACK) + FIXED_OBJECT_SLACK,
    );
  });
});

const CENTRAL_UNCOMPRESSED_SIZE = 24;
const LOCAL_UNCOMPRESSED_SIZE = 22;
const ZIP64_SENTINEL = 0xffffffff;

describe("ZIP raw entries", () => {
  it("rejects forged retained metadata before emitting archive bytes", () => {
    const context = createCodecContext("export");
    const data = deflateSync(strToU8("hello"));
    const forged = {
      method: 8 as const,
      crc32: 1,
      compressedSize: data.byteLength,
      uncompressedSize: 5,
      data,
    };
    expect(() => validateStoredEntry(forged, context)).toThrow(/CRC/);
    expect(() =>
      writeZip([{ name: "x.bin", stored: { ...forged, uncompressedSize: 4 } }], context),
    ).toThrow(/size/);
  });

  it("reports ZIP64 size sentinels as unsupported and checks declared ratios before any local header", async () => {
    const zip64 = patchEntries(rawZip({ "a.xml": "<a/>" }, 0), ({ view, central }) => {
      view.setUint32(central + CENTRAL_UNCOMPRESSED_SIZE, ZIP64_SENTINEL, true);
    });
    await expect(ZipReader.open(zip64, createCodecContext("import"))).rejects.toThrow(
      "ZIP64 entry is unsupported",
    );

    // The first local header is corrupt, and only a later entry is over the ratio.
    const overRatio = patchEntries(
      rawZip({ "a.xml": "<a/>", "b.xml": `<b>${"b".repeat(4_096)}</b>` }),
      ({ view, local, index }) => {
        if (index === 0) view.setUint32(local, 0, true);
      },
    );
    await expect(
      ZipReader.open(
        overRatio,
        createCodecContext("import", { resourceLimits: { maxCompressionRatio: 2 } }),
      ),
    ).rejects.toMatchObject({ resource: "maxCompressionRatio" });
  });
});

/** Worksheets of 64 KiB or less, by the size that the archive declares, are parsed in one step. */
const ONE_STEP_PARSE_BYTES = 64 * 1024;
const SHEET_PART = "xl/worksheets/sheet1.xml";
const SMALL_SHEET_DATA =
  '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>hello</t></is></c><c r="B1"><v>42</v></c></row></sheetData>';

/** Deterministic lowercase text that deflate cannot shrink much. */
function letters(length: number): string {
  let seed = 1;
  let text = "";
  for (let index = 0; index < length; index++) {
    seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;
    text += String.fromCharCode(97 + ((seed >>> 16) % 26));
  }
  return text;
}

/** A package whose worksheet is exactly `size` bytes; a comment of varied text fills the remaining space. */
function sizedPackage(size: number, body = SMALL_SHEET_DATA): Uint8Array {
  const padding = size - worksheet(`${body}<!---->`).length;
  const xml = worksheet(`${body}<!--${letters(padding)}-->`);
  expect(xml.length).toBe(size);
  return rawXlsx({ sheets: [{ xml }] });
}

// The archive controls the declared size, so each limit must hold on both sides of the boundary.
describe.each([ONE_STEP_PARSE_BYTES, ONE_STEP_PARSE_BYTES + 1])(
  "at a declared worksheet size of %d bytes",
  (size) => {
    it("reads the cells on the path that the size selects", async () => {
      const buffered = spyOn(ZipReader.prototype, "read");
      try {
        // This file's codec, directly: the spy watches this module's ZipReader, and the
        // installed add-on may come from another copy of the package in the test run.
        const cells = JSON.stringify(
          sheetAt(await sheetwriteWorkbookBackend.fromXlsxWorkbook(sizedPackage(size))).cells,
        );
        expect(cells).toContain('"hello"');
        expect(cells).toContain("42");
        const sheetReads = buffered.mock.calls.filter(([part]) => part === SHEET_PART);
        expect(sheetReads.length).toBe(size > ONE_STEP_PARSE_BYTES ? 0 : 1);
      } finally {
        buffered.mockRestore();
      }
    });

    it("enforces XML depth, text, element and entry size limits", async () => {
      const depth = createCodecContext("import").limits.maxXmlDepth + 1;
      const rows = Array.from(
        { length: 100 },
        (_, index) => `<row r="${index + 1}"><c r="A${index + 1}"><v>1</v></c></row>`,
      );
      const cases: [string, string, Record<string, number>][] = [
        ["maxXmlDepth", `${SMALL_SHEET_DATA}${"<a>".repeat(depth)}${"</a>".repeat(depth)}`, {}],
        [
          "maxXmlTextBytes",
          `<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${letters(2_000)}</t></is></c></row></sheetData>`,
          { maxXmlTextBytes: 1_999 },
        ],
        // The other parts of this package have far fewer elements than the limit.
        ["maxXmlElements", `<sheetData>${rows.join("")}</sheetData>`, { maxXmlElements: 100 }],
        ["maxEntryUncompressedBytes", SMALL_SHEET_DATA, { maxEntryUncompressedBytes: size - 1 }],
      ];
      for (const [resource, body, resourceLimits] of cases) {
        await expect(
          fromXlsxWorkbook(sizedPackage(size, body), { resourceLimits }),
          resource,
        ).rejects.toMatchObject({
          resource,
        });
      }
    });

    it("rejects worksheet data longer or shorter than the declared size", async () => {
      for (const actual of [size + 1, size - 1]) {
        const archive = patchEntries(sizedPackage(actual), ({ view, central, local, name }) => {
          if (name !== SHEET_PART) return;
          view.setUint32(central + CENTRAL_UNCOMPRESSED_SIZE, size, true);
          view.setUint32(local + LOCAL_UNCOMPRESSED_SIZE, size, true);
        });
        await expect(fromXlsxWorkbook(archive)).rejects.toThrow(
          actual > size
            ? `inflated size exceeds declaration for ${SHEET_PART}`
            : `inflated size mismatch for ${SHEET_PART}`,
        );
      }
    });
  },
);
