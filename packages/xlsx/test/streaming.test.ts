import { heapStats } from "bun:jsc";
import { beforeAll, describe, expect, it, spyOn } from "bun:test";

import {
  fromXlsxWorkbook,
  fromXlsxWorkbookFile,
  initSheetwrite,
  SheetwriteStore,
  toXlsxTable,
  toXlsxTableStream,
  toXlsxWorkbook,
  toXlsxWorkbookStream,
  type CellValue,
  type Workbook,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { deflateSync, strToU8, unzipSync } from "fflate";

import { registerXlsxBackends } from "../src/index.js";
import { createCodecContext } from "../src/resources.js";
import { validateStoredEntry, writeZip, ZipReader } from "../src/zip.js";
import { rawXlsx, rawZip, worksheet } from "./raw-opc.js";

beforeAll(async () => {
  await initSheetwrite();
  registerXlsxBackends();
});

function largeSnapshot(rows: number): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "s" },
    sheets: [
      {
        id: "s",
        name: "Data",
        order: 0,
        rowCount: rows,
        columns: [
          { key: "a", header: "A", width: 80, type: "text" },
          { key: "b", header: "B", width: 80, type: "number" },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: rows,
            colCount: 2,
            cells: Array.from({ length: rows * 2 }, (_unused, index) => ({
              rowOffset: Math.floor(index / 2),
              colOffset: index % 2,
              value: {
                kind: "literal" as const,
                value: index % 2 === 0 ? `text-${index}-${Math.sin(index)}` : index,
              },
            })),
          },
        ],
      },
    ],
  };
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (let next = await reader.read(); !next.done; next = await reader.read())
    chunks.push(next.value);
  return chunks;
}

async function failureOf(stream: ReadableStream<Uint8Array>): Promise<unknown> {
  try {
    await collect(stream);
  } catch (error) {
    return error;
  }
  throw new Error("expected the stream to fail");
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
    const store = new SheetwriteStore(
      {
        activeSheet: "s",
        sheets: [
          {
            id: "s",
            name: "T",
            rowCount,
            columns: [{ key: "a", header: "A", width: 80, type: "text" }],
          },
        ],
      },
      {
        rowCount,
        columns: {
          a: Array.from({ length: rowCount }, (_unused, row) => `value-${row}-${Math.sin(row)}`),
        },
      },
    );
    let windowReads = 0;
    const readWindow = store.getVisibleWindow.bind(store);
    store.getVisibleWindow = ((sheet, rows, columns) => {
      windowReads++;
      return readWindow(sheet, rows, columns);
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
    controller.abort();
    expect(
      await failureOf(toXlsxWorkbookStream(largeSnapshot(10), { signal: controller.signal })),
    ).toMatchObject({
      code: "aborted",
    });
  });

  it("streams the store-backed table export with the same entries as the buffered export", async () => {
    const rowCount = 10_000;
    const workbook: Workbook = {
      activeSheet: "s",
      sheets: [
        {
          id: "s",
          name: "Table",
          rowCount,
          columns: [
            { key: "a", header: "A", width: 80, type: "text" },
            { key: "b", header: "B", width: 80, type: "number" },
          ],
          merges: [{ r0: 0, c0: 0, r1: 1, c1: 1 }],
        },
      ],
    };
    const store = new SheetwriteStore(workbook, {
      rowCount,
      columns: {
        a: Array.from({ length: rowCount }, (_unused, row) => `r${row}`),
        b: Array.from({ length: rowCount }, (_unused, row) => row),
      },
    });
    const streamed = Buffer.concat(await collect(toXlsxTableStream(store.getWorkbook(), store)));
    expect(unzipSync(streamed)).toEqual(unzipSync(await toXlsxTable(store.getWorkbook(), store)));
    const imported = await fromXlsxWorkbook(streamed);
    expect(imported.sheets[0]?.merges).toEqual([{ r0: 1, c0: 0, r1: 2, c1: 1 }]);
    expect(imported.sheets[0]?.rowCount).toBe(rowCount + 1);
    store.dispose();
  });

  it("fails instead of mixing table states when the store changes mid-stream", async () => {
    const rowCount = 20_000;
    const store = new SheetwriteStore(
      {
        activeSheet: "s",
        sheets: [
          {
            id: "s",
            name: "T",
            rowCount,
            columns: [{ key: "a", header: "A", width: 80, type: "text" }],
          },
        ],
      },
      {
        rowCount,
        columns: {
          a: Array.from({ length: rowCount }, (_unused, row) => `value-${row}-${Math.sin(row)}`),
        },
      },
    );
    const reader = toXlsxTableStream(store.getWorkbook(), store).getReader();
    await reader.read();
    store.applyTransaction({ patches: [{ op: "addRows", sheet: "s", at: 0, count: 1 }] });
    let failure: unknown;
    try {
      while (!(await reader.read()).done);
    } catch (error) {
      failure = error;
    }
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

  // Stored entries reach the worksheet reader in 8 KiB inflater chunks, so sweeping the padding
  // before the rows moves that boundary across every byte of the repeated row markup.
  it("imports worksheet rows identically wherever an inflater chunk boundary falls", async () => {
    const rowXml = (row: number) =>
      `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>x&amp;y&#x1F600;é€😀<![CDATA[<c&>]]>z</t></is></c><!-- é --><c r="B${row}"><f>IF(A${row}="&lt;","&amp;",1)</f></c><c r="C${row}"><v>12.5</v></c></row>`;
    const rows = Array.from({ length: 60 }, (_unused, index) => 10 + index);
    const unitBytes = new TextEncoder().encode(rowXml(10)).byteLength;
    const expected: [number, number, CellValue][] = rows.flatMap(
      (row): [number, number, CellValue][] => [
        [row - 1, 0, { kind: "literal", value: "x&y😀é€😀<c&>z" }],
        [row - 1, 1, { kind: "formula", src: `=IF(A${row}="<","&",1)` }],
        [row - 1, 2, { kind: "literal", value: 12.5 }],
      ],
    );
    for (let pad = 0; pad < unitBytes; pad++) {
      const xml = worksheet(
        `<!--${"p".repeat(pad)}--><sheetData>${rows.map(rowXml).join("")}</sheetData>`,
      );
      const imported = await fromXlsxWorkbookFile(storedWorkbook(xml));
      const cells = (imported.sheets[0]?.cells ?? []).flatMap((block) =>
        block.cells.map((cell) => [
          block.startRow + cell.rowOffset,
          block.startCol + cell.colOffset,
          cell.value,
        ]),
      );
      expect(cells, `padding ${pad}`).toEqual(expected);
    }
  });

  it("rejects a DTD split across inflater chunks", async () => {
    const chunkBytes = 8 * 1024;
    const declaration = "<!DOCTYPE worksheet>";
    const declarationOffset = worksheet(`<!---->${declaration}`).indexOf(declaration);
    for (let split = 1; split < "<!DOCTYPE".length; split++) {
      const pad = chunkBytes - split - declarationOffset;
      const xml = worksheet(`<!--${"p".repeat(pad)}-->${declaration}<sheetData/>`);
      expect(xml.indexOf("<!DOCTYPE")).toBe(chunkBytes - split);
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
    const chunkBytes = 8 * 1024;
    for (const [reference, accepted] of [
      [`&#${"0".repeat(27)}65;`, true],
      [`&#${"0".repeat(40)}65;`, false],
    ] as const) {
      const cell = `<c r="A1" t="inlineStr"><is><t>${reference}</t></is></c>`;
      const body = `<sheetData><row r="1">${cell}</row></sheetData>`;
      const offset = worksheet(`<!---->${body}`).indexOf(reference);
      for (const split of [0, 1, Math.floor(reference.length / 2), reference.length - 1]) {
        const pad = chunkBytes - split - offset;
        const xml = worksheet(`<!--${"p".repeat(pad)}-->${body}`);
        expect(xml.indexOf(reference), `split ${split}`).toBe(chunkBytes - split);
        const result = fromXlsxWorkbookFile(storedWorkbook(xml));
        if (accepted) {
          const imported = await result;
          expect(imported.sheets[0]?.cells[0]?.cells[0]?.value, `split ${split}`).toEqual({
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
    const quoted = "a>b'".repeat(40_000);
    const xml = worksheet(
      `<dimension ref="A1" note="${quoted}"/><sheetData><row r="1"><c r="A1"><v>7</v></c></row></sheetData>`,
    );
    const imported = await fromXlsxWorkbookFile(storedWorkbook(xml));
    expect(imported.sheets[0]?.cells[0]?.cells.map((cell) => cell.value)).toEqual([
      { kind: "literal", value: 7 },
    ]);
  });

  it("keeps one object representation per cell when the worksheet ends", async () => {
    const rowCount = 20_000;
    const columns = ["A", "B", "C", "D"];
    const rows = Array.from(
      { length: rowCount },
      (_unused, row) =>
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

    expect(imported.sheets[0]?.cells[0]?.cells).toHaveLength(cells);
    expect(atWorksheetEnd).toBeGreaterThan(before);
    // Each output cell is two objects, a cell and its value. A second per-cell
    // record or a retained row tree adds at least one more object per cell.
    expect(atWorksheetEnd - before).toBeLessThan(
      cells * (OUTPUT_OBJECTS_PER_CELL + PER_CELL_SLACK) + FIXED_OBJECT_SLACK,
    );
  });
});

function storedWorkbook(sheetXml: string): Blob {
  return new Blob([new Uint8Array(rawXlsx({ sheets: [{ xml: sheetXml }], compressionLevel: 0 }))]);
}

/** A snapshot cell and its value object: the representation import must return. */
const OUTPUT_OBJECTS_PER_CELL = 2;
const PER_CELL_SLACK = 0.25;
const FIXED_OBJECT_SLACK = 20_000;

function liveObjects(): number {
  Bun.gc(true);
  return heapStats().objectCount;
}

describe("ZIP raw entries", () => {
  it("copies validated compressed entries without inflating into the output archive", async () => {
    const context = createCodecContext("export");
    const payload = strToU8("<custom>preserved</custom>".repeat(100));
    const archive = writeZip(new Map([["custom/item.xml", payload]]), context);
    const reader = await ZipReader.open(archive, createCodecContext("import"));
    const stored = await reader.stored("custom/item.xml");
    expect(stored.method).toBe(8);
    expect(stored.compressedSize).toBeLessThan(payload.byteLength);
    const copied = writeZip([{ name: "custom/item.xml", stored }], context);
    expect(unzipSync(copied)["custom/item.xml"]).toEqual(payload);
  });

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

  it("reports ZIP64 size sentinels as unsupported instead of as resource limits", async () => {
    const archive = patchEntries(rawZip({ "a.xml": "<a/>" }, 0), (view, central) => {
      view.setUint32(central + CENTRAL_UNCOMPRESSED_SIZE, ZIP64_SENTINEL, true);
    });
    await expect(ZipReader.open(archive, createCodecContext("import"))).rejects.toThrow(
      "ZIP64 entry is unsupported",
    );
  });

  it("rejects a declared over-ratio entry before it reads any local header", async () => {
    const archive = patchEntries(
      rawZip({ "a.xml": "<a/>", "b.xml": `<b>${"b".repeat(4_096)}</b>` }),
      (view, _central, local, index) => {
        // The first local header is corrupt, and only a later entry is over the ratio.
        if (index === 0) view.setUint32(local, 0, true);
      },
    );
    await expect(
      ZipReader.open(
        archive,
        createCodecContext("import", { resourceLimits: { maxCompressionRatio: 2 } }),
      ),
    ).rejects.toMatchObject({ resource: "maxCompressionRatio" });
  });
});

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_BYTES = 22;
const CENTRAL_HEADER_BYTES = 46;
const CENTRAL_UNCOMPRESSED_SIZE = 24;
const CENTRAL_LOCAL_OFFSET = 42;
const LOCAL_UNCOMPRESSED_SIZE = 22;
const ZIP64_SENTINEL = 0xffffffff;
const ONE_STEP_PARSE_BYTES = 64 * 1024;
const LETTER_COUNT = 26;
const LOWERCASE_A = 97;

/** Deterministic lowercase text that deflate cannot shrink much. */
function letters(length: number): string {
  let seed = 1;
  let text = "";
  for (let index = 0; index < length; index++) {
    seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;
    text += String.fromCharCode(LOWERCASE_A + ((seed >>> 16) % LETTER_COUNT));
  }
  return text;
}

/** Set the uncompressed size in the central and local headers. */
function declareSize(size: number): (view: DataView, central: number, local: number) => void {
  return (view, central, local) => {
    view.setUint32(central + CENTRAL_UNCOMPRESSED_SIZE, size, true);
    view.setUint32(local + LOCAL_UNCOMPRESSED_SIZE, size, true);
  };
}

const SHEET_PART = "xl/worksheets/sheet1.xml";
const CENTRAL_NAME_LENGTH = 28;
const SMALL_SHEET_DATA =
  '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>hello</t></is></c><c r="B1"><v>42</v></c></row></sheetData>';

/** A worksheet of exactly `size` bytes; a comment of varied text fills the remaining space. */
function sizedWorksheet(size: number, body: string): string {
  const unpadded = worksheet(`${body}<!---->`);
  const xml = worksheet(`${body}<!--${letters(size - unpadded.length)}-->`);
  expect(xml.length).toBe(size);
  return xml;
}

/** Change the header fields of one named part. */
function patchPart(
  source: Uint8Array,
  name: string,
  patch: (view: DataView, central: number, local: number) => void,
): Uint8Array {
  const nameBytes = strToU8(name);
  return patchEntries(source, (view, central, local) => {
    const length = view.getUint16(central + CENTRAL_NAME_LENGTH, true);
    const entryName = new Uint8Array(view.buffer, central + CENTRAL_HEADER_BYTES, length);
    if (Buffer.compare(entryName, nameBytes) === 0) patch(view, central, local);
  });
}

// Worksheets of 64 KiB or less, by the size that the archive declares, are parsed in one step.
// The archive controls that size, so each limit must hold on both sides of the boundary.
describe("worksheet one-step parse boundary", () => {
  for (const size of [ONE_STEP_PARSE_BYTES, ONE_STEP_PARSE_BYTES + 1]) {
    describe(`at a declared worksheet size of ${size} bytes`, () => {
      it("reads the cells on the path that the size selects", async () => {
        const archive = rawXlsx({ sheets: [{ xml: sizedWorksheet(size, SMALL_SHEET_DATA) }] });
        const buffered = spyOn(ZipReader.prototype, "read");
        try {
          const snapshot = await fromXlsxWorkbook(archive);
          const cells = JSON.stringify(snapshot.sheets[0]?.cells);
          expect(cells).toContain('"hello"');
          expect(cells).toContain("42");
          const sheetReads = buffered.mock.calls.filter(([part]) => part === SHEET_PART);
          expect(sheetReads.length).toBe(size > ONE_STEP_PARSE_BYTES ? 0 : 1);
        } finally {
          buffered.mockRestore();
        }
      });

      it("rejects XML deeper than the limit", async () => {
        const depth = createCodecContext("import").limits.maxXmlDepth + 1;
        const body = `${SMALL_SHEET_DATA}${"<a>".repeat(depth)}${"</a>".repeat(depth)}`;
        const archive = rawXlsx({ sheets: [{ xml: sizedWorksheet(size, body) }] });
        await expect(fromXlsxWorkbook(archive)).rejects.toMatchObject({ resource: "maxXmlDepth" });
      });

      it("rejects cell text over the limit", async () => {
        const textBytes = 2_000;
        const body = `<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${letters(textBytes)}</t></is></c></row></sheetData>`;
        const archive = rawXlsx({ sheets: [{ xml: sizedWorksheet(size, body) }] });
        await expect(
          fromXlsxWorkbook(archive, { resourceLimits: { maxXmlTextBytes: textBytes - 1 } }),
        ).rejects.toMatchObject({ resource: "maxXmlTextBytes" });
      });

      it("rejects more elements than the limit", async () => {
        const rowCount = 100;
        const rows = Array.from(
          { length: rowCount },
          (_, index) => `<row r="${index + 1}"><c r="A${index + 1}"><v>1</v></c></row>`,
        ).join("");
        const body = `<sheetData>${rows}</sheetData>`;
        const archive = rawXlsx({ sheets: [{ xml: sizedWorksheet(size, body) }] });
        // The other parts of this package have far fewer elements than the limit.
        await expect(
          fromXlsxWorkbook(archive, { resourceLimits: { maxXmlElements: rowCount } }),
        ).rejects.toMatchObject({ resource: "maxXmlElements" });
      });

      it("rejects a worksheet over the entry size limit", async () => {
        const archive = rawXlsx({ sheets: [{ xml: sizedWorksheet(size, SMALL_SHEET_DATA) }] });
        await expect(
          fromXlsxWorkbook(archive, { resourceLimits: { maxEntryUncompressedBytes: size - 1 } }),
        ).rejects.toMatchObject({ resource: "maxEntryUncompressedBytes" });
      });

      it("rejects worksheet data longer or shorter than the declared size", async () => {
        for (const actual of [size + 1, size - 1]) {
          const archive = patchPart(
            rawXlsx({ sheets: [{ xml: sizedWorksheet(actual, SMALL_SHEET_DATA) }] }),
            SHEET_PART,
            declareSize(size),
          );
          await expect(fromXlsxWorkbook(archive)).rejects.toThrow(
            actual > size
              ? `inflated size exceeds declaration for ${SHEET_PART}`
              : `inflated size mismatch for ${SHEET_PART}`,
          );
        }
      });
    });
  }
});

/** Copy an archive and change the header fields of each entry in central-directory order. */
function patchEntries(
  source: Uint8Array,
  patch: (view: DataView, central: number, local: number, index: number) => void,
): Uint8Array {
  const bytes = source.slice();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.byteLength - EOCD_BYTES;
  while (view.getUint32(eocd, true) !== EOCD_SIGNATURE) eocd--;
  const count = view.getUint16(eocd + 10, true);
  let central = view.getUint32(eocd + 16, true);

  for (let index = 0; index < count; index++) {
    patch(view, central, view.getUint32(central + CENTRAL_LOCAL_OFFSET, true), index);
    central +=
      CENTRAL_HEADER_BYTES +
      view.getUint16(central + 28, true) +
      view.getUint16(central + 30, true) +
      view.getUint16(central + 32, true);
  }
  return bytes;
}
