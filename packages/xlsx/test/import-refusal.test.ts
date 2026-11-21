import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import {
  createGrid,
  fromXlsxWorkbook,
  fromXlsxWorkbookFile,
  type Grid,
  initSheetwrite,
  type XlsxWorkbookOptions,
} from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";

import { xlsxAddon } from "../src/index.js";
import { rawXlsx, worksheet } from "./raw-opc.js";

const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** 200 rows of two numbers: small XML, a snapshot about twice its size. */
const NUMBER_ROWS = Array.from(
  { length: 200 },
  (_, row) =>
    `<row r="${row + 1}"><c r="A${row + 1}"><v>${row}</v></c><c r="B${row + 1}"><v>${row}</v></c></row>`,
).join("");

function numbersXlsx(workbookExtra?: string): Uint8Array {
  return rawXlsx({
    ...(workbookExtra ? { workbookExtra } : {}),
    sheets: [{ xml: worksheet(`<sheetData>${NUMBER_ROWS}</sheetData>`) }],
  });
}

/** The same package with the declared size of `part` one byte larger in both ZIP headers. */
function withWrongSize(bytes: Uint8Array, part: string): Uint8Array {
  const copy = bytes.slice();
  const view = new DataView(copy.buffer);
  const name = new TextEncoder().encode(part);
  const namedAt = (offset: number) => name.every((byte, index) => copy[offset + index] === byte);
  for (let offset = 0; offset + 46 < copy.length; offset++) {
    const signature = view.getUint32(offset, true);
    if (signature === LOCAL_SIGNATURE && namedAt(offset + 30)) {
      view.setUint32(offset + 22, view.getUint32(offset + 22, true) + 1, true);
    } else if (signature === CENTRAL_SIGNATURE && namedAt(offset + 46)) {
      view.setUint32(offset + 24, view.getUint32(offset + 24, true) + 1, true);
    }
  }
  return copy;
}

/** Malformed workbooks, each with the options to read it and the refusal it must give. */
const MALFORMED: readonly [string, Uint8Array, XlsxWorkbookOptions, RegExp][] = [
  [
    "a worksheet whose declared size is wrong",
    withWrongSize(numbersXlsx(), "xl/worksheets/sheet1.xml"),
    {},
    /inflated size mismatch/,
  ],
  [
    "a snapshot larger than the import size limit",
    numbersXlsx(),
    { resourceLimits: { maxTotalUncompressedBytes: 16_000 } },
    /imported invalid workbook snapshot: Snapshot maxSerializedBytes limit 16000 exceeded/,
  ],
  [
    "an invalid cell reference",
    rawXlsx({
      sheets: [
        { xml: worksheet('<sheetData><row r="1"><c r="A0"><v>1</v></c></row></sheetData>') },
      ],
    }),
    {},
    /cell reference A0 is invalid/,
  ],
  [
    "two defined names that differ only in case",
    numbersXlsx(
      '<definedNames><definedName name="total">Sheet1!$A$1</definedName><definedName name="TOTAL">Sheet1!$A$2</definedName></definedNames>',
    ),
    {},
    /imported invalid workbook snapshot: Named range names must be unique within their scope/,
  ],
];

beforeAll(async () => {
  await initSheetwrite({ addons: [xlsxAddon()] });
});

it.each(MALFORMED)("fromXlsxWorkbook refuses %s", async (_name, bytes, options, refusal) => {
  await expect(fromXlsxWorkbook(bytes, options)).rejects.toThrow(refusal);
});

let grid: Grid;
let host: HTMLDivElement;
let restoreCanvas: () => void;
beforeEach(() => {
  restoreCanvas = installCanvasTestStubs();
  host = document.createElement("div");
  document.body.append(host);
  grid = createGrid(host, {
    workbook: {
      activeSheet: "s1",
      sheets: [
        {
          id: "s1",
          name: "Kept",
          rowCount: 1,
          columns: [{ key: "a", header: "A", width: 80, type: "text" }],
        },
      ],
    },
    data: { rowCount: 1, columns: { a: ["kept"] } },
  });
});
afterEach(() => {
  grid.destroy();
  host.remove();
  restoreCanvas();
});

it.each(MALFORMED)(
  "a grid's workbook import refuses %s and keeps its document",
  async (_name, bytes, options, refusal) => {
    const file = new Blob([new Uint8Array(bytes)]);
    await expect(
      grid.importWorkbook((signal) => fromXlsxWorkbookFile(file, { ...options, signal })),
    ).rejects.toThrow(refusal);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("kept");
  },
);
