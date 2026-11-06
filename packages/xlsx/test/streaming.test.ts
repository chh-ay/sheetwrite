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

function large_snapshot(rows: number): WorkbookSnapshot {
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

async function failure_of(stream: ReadableStream<Uint8Array>): Promise<unknown> {
  try {
    await collect(stream);
  } catch (error) {
    return error;
  }
  throw new Error("expected the stream to fail");
}

describe("XLSX streaming", () => {
  it("emits bounded workbook chunks with the same entries as the buffered export", async () => {
    const source = large_snapshot(20_000);
    const chunks = await collect(toXlsxWorkbookStream(source));
    expect(chunks.length).toBeGreaterThan(2);
    expect(Math.max(...chunks.map((chunk) => chunk.byteLength))).toBeLessThanOrEqual(64 * 1024);
    // Streams emit worksheets before the parts that depend on them, so compare entries, not order.
    expect(unzipSync(Buffer.concat(chunks))).toEqual(unzipSync(await toXlsxWorkbook(source)));
  });

  it("stops producing on cancel and surfaces output ceilings as stream errors", async () => {
    const row_count = 50_000;
    const store = new SheetwriteStore(
      {
        activeSheet: "s",
        sheets: [
          {
            id: "s",
            name: "T",
            rowCount: row_count,
            columns: [{ key: "a", header: "A", width: 80, type: "text" }],
          },
        ],
      },
      {
        rowCount: row_count,
        columns: {
          a: Array.from({ length: row_count }, (_unused, row) => `value-${row}-${Math.sin(row)}`),
        },
      },
    );
    let window_reads = 0;
    const read_window = store.getVisibleWindow.bind(store);
    store.getVisibleWindow = ((sheet, rows, columns) => {
      window_reads++;
      return read_window(sheet, rows, columns);
    }) as typeof store.getVisibleWindow;
    const reader = toXlsxTableStream(store.getWorkbook(), store).getReader();
    expect((await reader.read()).done).toBe(false);
    await reader.cancel();
    const reads_at_cancel = window_reads;
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    expect(window_reads).toBe(reads_at_cancel);
    expect(reads_at_cancel).toBeLessThan(Math.ceil(row_count / 4096));
    store.dispose();
    expect(
      await failure_of(
        toXlsxWorkbookStream(large_snapshot(2_000), { resourceLimits: { maxOutputBytes: 1024 } }),
      ),
    ).toMatchObject({ code: "xlsx-resource-limit" });
    const controller = new AbortController();
    controller.abort(new Error("cancelled workbook stream"));
    expect(
      await failure_of(toXlsxWorkbookStream(large_snapshot(10), { signal: controller.signal })),
    ).toBe(controller.signal.reason);
  });

  it("streams the store-backed table export with the same entries as the buffered export", async () => {
    const row_count = 10_000;
    const workbook: Workbook = {
      activeSheet: "s",
      sheets: [
        {
          id: "s",
          name: "Table",
          rowCount: row_count,
          columns: [
            { key: "a", header: "A", width: 80, type: "text" },
            { key: "b", header: "B", width: 80, type: "number" },
          ],
          merges: [{ r0: 0, c0: 0, r1: 1, c1: 1 }],
        },
      ],
    };
    const store = new SheetwriteStore(workbook, {
      rowCount: row_count,
      columns: {
        a: Array.from({ length: row_count }, (_unused, row) => `r${row}`),
        b: Array.from({ length: row_count }, (_unused, row) => row),
      },
    });
    const streamed = Buffer.concat(await collect(toXlsxTableStream(store.getWorkbook(), store)));
    expect(unzipSync(streamed)).toEqual(unzipSync(await toXlsxTable(store.getWorkbook(), store)));
    const imported = await fromXlsxWorkbook(streamed);
    expect(imported.sheets[0]?.merges).toEqual([{ r0: 1, c0: 0, r1: 2, c1: 1 }]);
    expect(imported.sheets[0]?.rowCount).toBe(row_count + 1);
    store.dispose();
  });

  it("fails instead of mixing table states when the store changes mid-stream", async () => {
    const row_count = 20_000;
    const store = new SheetwriteStore(
      {
        activeSheet: "s",
        sheets: [
          {
            id: "s",
            name: "T",
            rowCount: row_count,
            columns: [{ key: "a", header: "A", width: 80, type: "text" }],
          },
        ],
      },
      {
        rowCount: row_count,
        columns: {
          a: Array.from({ length: row_count }, (_unused, row) => `value-${row}-${Math.sin(row)}`),
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
    const bytes = await toXlsxWorkbook(large_snapshot(500));
    const from_blob = await fromXlsxWorkbookFile(new Blob([new Uint8Array(bytes)]));
    expect(from_blob).toEqual(await fromXlsxWorkbook(bytes));
  });

  // Stored entries reach the worksheet reader in 8 KiB inflater chunks, so sweeping the padding
  // before the rows moves that boundary across every byte of the repeated row markup.
  it("imports worksheet rows identically wherever an inflater chunk boundary falls", async () => {
    const row_xml = (row: number) =>
      `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>x&amp;y&#x1F600;é€😀<![CDATA[<c&>]]>z</t></is></c><!-- é --><c r="B${row}"><f>IF(A${row}="&lt;","&amp;",1)</f></c><c r="C${row}"><v>12.5</v></c></row>`;
    const rows = Array.from({ length: 60 }, (_unused, index) => 10 + index);
    const unit_bytes = new TextEncoder().encode(row_xml(10)).byteLength;
    const expected: [number, number, CellValue][] = rows.flatMap(
      (row): [number, number, CellValue][] => [
        [row - 1, 0, { kind: "literal", value: "x&y😀é€😀<c&>z" }],
        [row - 1, 1, { kind: "formula", src: `=IF(A${row}="<","&",1)` }],
        [row - 1, 2, { kind: "literal", value: 12.5 }],
      ],
    );
    for (let pad = 0; pad < unit_bytes; pad++) {
      const xml = worksheet(
        `<!--${"p".repeat(pad)}--><sheetData>${rows.map(row_xml).join("")}</sheetData>`,
      );
      const imported = await fromXlsxWorkbookFile(stored_workbook(xml));
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
    const chunk_bytes = 8 * 1024;
    const declaration = "<!DOCTYPE worksheet>";
    const declaration_offset = worksheet(`<!---->${declaration}`).indexOf(declaration);
    for (let split = 1; split < "<!DOCTYPE".length; split++) {
      const pad = chunk_bytes - split - declaration_offset;
      const xml = worksheet(`<!--${"p".repeat(pad)}-->${declaration}<sheetData/>`);
      expect(xml.indexOf("<!DOCTYPE")).toBe(chunk_bytes - split);
      await expect(
        fromXlsxWorkbookFile(stored_workbook(xml)),
        `split ${split}`,
      ).rejects.toMatchObject({
        code: "xlsx-import-failed",
        message: expect.stringMatching(/DTDs and entities are forbidden/),
      });
    }
  });

  it("accepts or rejects a long character reference the same way at every chunk split", async () => {
    const chunk_bytes = 8 * 1024;
    for (const [reference, accepted] of [
      [`&#${"0".repeat(27)}65;`, true],
      [`&#${"0".repeat(40)}65;`, false],
    ] as const) {
      const cell = `<c r="A1" t="inlineStr"><is><t>${reference}</t></is></c>`;
      const body = `<sheetData><row r="1">${cell}</row></sheetData>`;
      const offset = worksheet(`<!---->${body}`).indexOf(reference);
      for (const split of [0, 1, Math.floor(reference.length / 2), reference.length - 1]) {
        const pad = chunk_bytes - split - offset;
        const xml = worksheet(`<!--${"p".repeat(pad)}-->${body}`);
        expect(xml.indexOf(reference), `split ${split}`).toBe(chunk_bytes - split);
        const result = fromXlsxWorkbookFile(stored_workbook(xml));
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
    const imported = await fromXlsxWorkbookFile(stored_workbook(xml));
    expect(imported.sheets[0]?.cells[0]?.cells.map((cell) => cell.value)).toEqual([
      { kind: "literal", value: 7 },
    ]);
  });

  it("keeps one object representation per cell when the worksheet ends", async () => {
    const row_count = 20_000;
    const columns = ["A", "B", "C", "D"];
    const rows = Array.from(
      { length: row_count },
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
    const cells = row_count * columns.length;
    const before = live_objects();
    let at_worksheet_end = 0;
    const imported = await fromXlsxWorkbook(bytes, {
      onWarning: (warning) => {
        if (warning.message.includes("zoom")) at_worksheet_end = live_objects();
      },
    });

    expect(imported.sheets[0]?.cells[0]?.cells).toHaveLength(cells);
    expect(at_worksheet_end).toBeGreaterThan(before);
    // Each output cell is two objects, a cell and its value. A second per-cell
    // record or a retained row tree adds at least one more object per cell.
    expect(at_worksheet_end - before).toBeLessThan(
      cells * (OUTPUT_OBJECTS_PER_CELL + PER_CELL_SLACK) + FIXED_OBJECT_SLACK,
    );
  });
});

function stored_workbook(sheet_xml: string): Blob {
  return new Blob([new Uint8Array(rawXlsx({ sheets: [{ xml: sheet_xml }], compressionLevel: 0 }))]);
}

/** A snapshot cell and its value object: the representation import must return. */
const OUTPUT_OBJECTS_PER_CELL = 2;
const PER_CELL_SLACK = 0.25;
const FIXED_OBJECT_SLACK = 20_000;

function live_objects(): number {
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
    const archive = patch_entries(rawZip({ "a.xml": "<a/>" }, 0), (view, central) => {
      view.setUint32(central + CENTRAL_UNCOMPRESSED_SIZE, ZIP64_SENTINEL, true);
    });
    await expect(ZipReader.open(archive, createCodecContext("import"))).rejects.toThrow(
      "ZIP64 entry is unsupported",
    );
  });

  it("rejects a declared over-ratio entry before it reads any local header", async () => {
    const archive = patch_entries(
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
function declare_size(size: number): (view: DataView, central: number, local: number) => void {
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
function sized_worksheet(size: number, body: string): string {
  const unpadded = worksheet(`${body}<!---->`);
  const xml = worksheet(`${body}<!--${letters(size - unpadded.length)}-->`);
  expect(xml.length).toBe(size);
  return xml;
}

/** Change the header fields of one named part. */
function patch_part(
  source: Uint8Array,
  name: string,
  patch: (view: DataView, central: number, local: number) => void,
): Uint8Array {
  const name_bytes = strToU8(name);
  return patch_entries(source, (view, central, local) => {
    const length = view.getUint16(central + CENTRAL_NAME_LENGTH, true);
    const entry_name = new Uint8Array(view.buffer, central + CENTRAL_HEADER_BYTES, length);
    if (Buffer.compare(entry_name, name_bytes) === 0) patch(view, central, local);
  });
}

// Worksheets of 64 KiB or less, by the size that the archive declares, are parsed in one step.
// The archive controls that size, so each limit must hold on both sides of the boundary.
describe("worksheet one-step parse boundary", () => {
  for (const size of [ONE_STEP_PARSE_BYTES, ONE_STEP_PARSE_BYTES + 1]) {
    describe(`at a declared worksheet size of ${size} bytes`, () => {
      it("reads the cells on the path that the size selects", async () => {
        const archive = rawXlsx({ sheets: [{ xml: sized_worksheet(size, SMALL_SHEET_DATA) }] });
        const buffered = spyOn(ZipReader.prototype, "read");
        try {
          const snapshot = await fromXlsxWorkbook(archive);
          const cells = JSON.stringify(snapshot.sheets[0]?.cells);
          expect(cells).toContain('"hello"');
          expect(cells).toContain("42");
          const sheet_reads = buffered.mock.calls.filter(([part]) => part === SHEET_PART);
          expect(sheet_reads.length).toBe(size > ONE_STEP_PARSE_BYTES ? 0 : 1);
        } finally {
          buffered.mockRestore();
        }
      });

      it("rejects XML deeper than the limit", async () => {
        const depth = createCodecContext("import").limits.maxXmlDepth + 1;
        const body = `${SMALL_SHEET_DATA}${"<a>".repeat(depth)}${"</a>".repeat(depth)}`;
        const archive = rawXlsx({ sheets: [{ xml: sized_worksheet(size, body) }] });
        await expect(fromXlsxWorkbook(archive)).rejects.toMatchObject({ resource: "maxXmlDepth" });
      });

      it("rejects cell text over the limit", async () => {
        const text_bytes = 2_000;
        const body = `<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${letters(text_bytes)}</t></is></c></row></sheetData>`;
        const archive = rawXlsx({ sheets: [{ xml: sized_worksheet(size, body) }] });
        await expect(
          fromXlsxWorkbook(archive, { resourceLimits: { maxXmlTextBytes: text_bytes - 1 } }),
        ).rejects.toMatchObject({ resource: "maxXmlTextBytes" });
      });

      it("rejects more elements than the limit", async () => {
        const row_count = 100;
        const rows = Array.from(
          { length: row_count },
          (_, index) => `<row r="${index + 1}"><c r="A${index + 1}"><v>1</v></c></row>`,
        ).join("");
        const body = `<sheetData>${rows}</sheetData>`;
        const archive = rawXlsx({ sheets: [{ xml: sized_worksheet(size, body) }] });
        // The other parts of this package have far fewer elements than the limit.
        await expect(
          fromXlsxWorkbook(archive, { resourceLimits: { maxXmlElements: row_count } }),
        ).rejects.toMatchObject({ resource: "maxXmlElements" });
      });

      it("rejects a worksheet over the entry size limit", async () => {
        const archive = rawXlsx({ sheets: [{ xml: sized_worksheet(size, SMALL_SHEET_DATA) }] });
        await expect(
          fromXlsxWorkbook(archive, { resourceLimits: { maxEntryUncompressedBytes: size - 1 } }),
        ).rejects.toMatchObject({ resource: "maxEntryUncompressedBytes" });
      });

      it("rejects worksheet data longer or shorter than the declared size", async () => {
        for (const actual of [size + 1, size - 1]) {
          const archive = patch_part(
            rawXlsx({ sheets: [{ xml: sized_worksheet(actual, SMALL_SHEET_DATA) }] }),
            SHEET_PART,
            declare_size(size),
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
function patch_entries(
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
