import type {
  CellBlock,
  CellValue,
  Column,
  SheetSnapshot,
  SnapshotCell,
  WorkbookSnapshot,
  XlsxWorkbookWarning,
} from "@sheetwrite/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { FIXED_ZIP_TIME } from "./raw-opc.js";

/** A grid cell: a primitive is a literal, a `CellValue` is used as is, `undefined` or `null` is empty. */
export type GridCell = string | number | boolean | null | undefined | CellValue;

function cellValue(cell: Exclude<GridCell, null | undefined>): CellValue {
  return typeof cell === "object" ? cell : { kind: "literal", value: cell };
}

export const formula = (src: string): CellValue => ({ kind: "formula", src });

/** One sparse block holding the non-empty cells of `rows`, placed at `startRow`, `startCol`. */
export function block(
  rows: readonly (readonly GridCell[])[],
  startRow = 0,
  startCol = 0,
): CellBlock {
  const cells: SnapshotCell[] = rows.flatMap((row, rowOffset) =>
    row.flatMap((cell, colOffset) =>
      cell === undefined || cell === null ? [] : [{ rowOffset, colOffset, value: cellValue(cell) }],
    ),
  );
  return {
    startRow,
    startCol,
    rowCount: rows.length,
    colCount: Math.max(0, ...rows.map((row) => row.length)),
    cells,
  };
}

export function columns(count: number, type: Column["type"] = "text"): Column[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `c${index}`,
    header: `C${index}`,
    width: 80,
    type,
  }));
}

/** A worksheet holding `rows` from A1, with one text column per grid column. */
export function sheet(
  id: string,
  name: string,
  rows: readonly (readonly GridCell[])[] = [],
  extra: Partial<SheetSnapshot> = {},
): SheetSnapshot {
  const width = Math.max(1, ...rows.map((row) => row.length));
  return {
    id,
    name,
    order: 0,
    rowCount: Math.max(1, rows.length),
    columns: columns(width),
    cells: rows.length > 0 ? [block(rows)] : [],
    ...extra,
  };
}

/** A workbook of `sheets` in order; the first sheet is active unless `workbook` says otherwise. */
export function book(
  sheets: readonly SheetSnapshot[],
  workbook: Partial<WorkbookSnapshot["workbook"]> = {},
): WorkbookSnapshot {
  const first = sheets[0];
  if (!first) throw new Error("a workbook needs a sheet");
  return {
    schemaVersion: 1,
    workbook: { activeSheet: first.id, ...workbook },
    sheets: sheets.map((entry, order) => ({ ...entry, order })),
  };
}

export function range(sheetId: string, r0: number, c0: number, r1 = r0, c1 = c0) {
  return { sheet: sheetId, start: { row: r0, col: c0 }, end: { row: r1, col: c1 } };
}

export function sheetAt(snapshot: WorkbookSnapshot, index = 0): SheetSnapshot {
  const found = snapshot.sheets[index];
  if (!found) throw new Error(`the workbook has no sheet ${index}`);
  return found;
}

export function sheetNamed(snapshot: WorkbookSnapshot, name: string): SheetSnapshot {
  const found = snapshot.sheets.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`the workbook has no sheet ${name}`);
  return found;
}

/** The cells of one sheet in row-major order, with absolute positions. */
export function cellsOf(
  snapshot: WorkbookSnapshot,
  index = 0,
): (SnapshotCell & { row: number; col: number })[] {
  return sheetAt(snapshot, index)
    .cells.flatMap((entry) =>
      entry.cells.map((cell) => ({
        ...cell,
        row: entry.startRow + cell.rowOffset,
        col: entry.startCol + cell.colOffset,
      })),
    )
    .sort((left, right) => left.row - right.row || left.col - right.col);
}

export function valuesOf(snapshot: WorkbookSnapshot, index = 0): CellValue[] {
  return cellsOf(snapshot, index).map((cell) => cell.value);
}

export function styleAt(snapshot: WorkbookSnapshot, row: number, col: number) {
  return cellsOf(snapshot).find((cell) => cell.row === row && cell.col === col)?.style;
}

export function collectWarnings(): {
  warnings: XlsxWorkbookWarning[];
  onWarning: (warning: XlsxWorkbookWarning) => void;
} {
  const warnings: XlsxWorkbookWarning[] = [];
  return { warnings, onWarning: (warning) => warnings.push(warning) };
}

/** The text of one package part; a missing part fails the test. */
export function partText(bytes: Uint8Array, name: string): string {
  const part = unzipSync(bytes)[name];
  if (!part) throw new Error(`the package has no ${name}`);
  return strFromU8(part);
}

export function partNames(bytes: Uint8Array): string[] {
  return Object.keys(unzipSync(bytes));
}

/** Repackage `bytes` with edited parts: a string replaces a part, a function rewrites its text, `null` removes it. */
export function editParts(
  bytes: Uint8Array,
  edits: Readonly<Record<string, string | Uint8Array | null | ((xml: string) => string)>>,
): Uint8Array {
  const files = unzipSync(bytes);
  for (const [name, edit] of Object.entries(edits)) {
    if (edit === null) delete files[name];
    else if (typeof edit === "function")
      files[name] = strToU8(edit(strFromU8(files[name] ?? new Uint8Array())));
    else files[name] = typeof edit === "string" ? strToU8(edit) : new Uint8Array(edit);
  }
  return zipSync(files, { level: 6, mtime: FIXED_ZIP_TIME });
}

const SIDECAR_MARKER = "sheetwrite-workbook-metadata-v1";
const EMPTY_WORKSHEET =
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>';

/** `bytes` as another application would save them: without the Sheetwrite metadata sheet's content. */
export function withoutSidecar(bytes: Uint8Array): Uint8Array {
  const files = unzipSync(bytes);
  const edits: Record<string, string> = {};
  for (const [name, content] of Object.entries(files)) {
    if (name.startsWith("xl/worksheets/sheet") && strFromU8(content).includes(SIDECAR_MARKER)) {
      edits[name] = EMPTY_WORKSHEET;
    }
  }
  return editParts(bytes, edits);
}

const FIXTURES = new URL("./fixtures/", import.meta.url);

export async function fixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(new URL(name, FIXTURES)).arrayBuffer());
}

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_BYTES = 22;
const EOCD_ENTRY_COUNT = 10;
const EOCD_CENTRAL_OFFSET = 16;
const CENTRAL_HEADER_BYTES = 46;
const CENTRAL_NAME_LENGTH = 28;
const CENTRAL_EXTRA_LENGTH = 30;
const CENTRAL_COMMENT_LENGTH = 32;
const CENTRAL_LOCAL_OFFSET = 42;

export interface ZipEntryHeaders {
  readonly view: DataView;
  readonly central: number;
  readonly local: number;
  readonly index: number;
  readonly name: string;
}

/** Copy an archive and let `patch` change the header fields of each entry, in central-directory order. */
export function patchEntries(
  source: Uint8Array,
  patch: (entry: ZipEntryHeaders) => void,
): Uint8Array {
  const bytes = source.slice();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.byteLength - EOCD_BYTES;
  while (eocd >= 0 && view.getUint32(eocd, true) !== EOCD_SIGNATURE) eocd--;
  if (eocd < 0) throw new Error("the archive has no end of central directory");
  const count = view.getUint16(eocd + EOCD_ENTRY_COUNT, true);
  let central = view.getUint32(eocd + EOCD_CENTRAL_OFFSET, true);
  for (let index = 0; index < count; index++) {
    const nameLength = view.getUint16(central + CENTRAL_NAME_LENGTH, true);
    const nameStart = central + CENTRAL_HEADER_BYTES;
    const name = strFromU8(bytes.subarray(nameStart, nameStart + nameLength));
    patch({
      view,
      central,
      local: view.getUint32(central + CENTRAL_LOCAL_OFFSET, true),
      index,
      name,
    });
    central +=
      CENTRAL_HEADER_BYTES +
      nameLength +
      view.getUint16(central + CENTRAL_EXTRA_LENGTH, true) +
      view.getUint16(central + CENTRAL_COMMENT_LENGTH, true);
  }
  return bytes;
}
