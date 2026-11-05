import { validateWorkbookSnapshot } from "../document-protocol.js";
import type { SnapshotCell, WorkbookSnapshot } from "../types/document.js";
import {
  decodeRecord,
  encodeRecord,
  HistoryError,
  historyJsonSize,
  integer,
  object,
  strings,
} from "./codec.js";
import type { HistoryLimits, HistoryStoredRecord } from "./types.js";

const PAGE_ROWS = 16;
const PAGE_COLS = 4;
const METADATA_ENTRIES_PER_BLOCK = 128;
const JS_SNAPSHOT_RESERVATION_MULTIPLIER = 8;

export interface CheckpointWrite {
  records: HistoryStoredRecord[];
  checkpoint: string;
}

export type HistoryRecordReader = (id: string) => Promise<HistoryStoredRecord>;

function reserveSnapshot(input: unknown, limits: Readonly<HistoryLimits>): void {
  const encoded = historyJsonSize(input, limits.maxSnapshotBytes);
  if (encoded * JS_SNAPSHOT_RESERVATION_MULTIPLIER > limits.maxWorkingBytes) {
    throw new HistoryError("capacity", "History snapshot exceeds its working-set reservation");
  }
}

async function metadataRecord(
  value: unknown,
  records: HistoryStoredRecord[],
  limits: Readonly<HistoryLimits>,
): Promise<string> {
  let root: HistoryStoredRecord;
  if (Array.isArray(value) && value.length > METADATA_ENTRIES_PER_BLOCK) {
    const pieces: string[] = [];
    for (let at = 0; at < value.length; at += METADATA_ENTRIES_PER_BLOCK) {
      const piece = await encodeRecord(
        "metadata",
        { value: value.slice(at, at + METADATA_ENTRIES_PER_BLOCK) },
        [],
        limits.maxSnapshotBytes,
      );
      records.push(piece);
      pieces.push(piece.id);
    }
    root = await encodeRecord(
      "metadata",
      { pieces },
      [...new Set(pieces)],
      limits.maxSnapshotBytes,
    );
  } else {
    root = await encodeRecord("metadata", { value }, [], limits.maxSnapshotBytes);
  }
  records.push(root);
  return root.id;
}

/** Store fixed coordinate pages and independent metadata blocks, reusing unchanged content IDs. */
export async function writeCheckpoint(
  input: WorkbookSnapshot,
  documentId: string,
  revision: number,
  limits: Readonly<HistoryLimits>,
  transactions: readonly string[] = [],
): Promise<CheckpointWrite> {
  reserveSnapshot(input, limits);
  const checked = validateWorkbookSnapshot(input, {
    storage: "paged",
    resourceLimits: { maxSerializedBytes: limits.maxSnapshotBytes },
  });
  if (!checked.ok)
    throw new HistoryError(
      "invalid-history",
      "History checkpoint is not a valid workbook snapshot",
    );
  const snapshot = checked.value;
  if (snapshot.documentId !== documentId || (snapshot.version ?? 0) !== revision) {
    throw new HistoryError(
      "invalid-history",
      "History checkpoint does not describe the committed document revision",
    );
  }
  const records: HistoryStoredRecord[] = [];
  const fields: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(snapshot.workbook)) {
    if (value !== undefined) fields.push([key, await metadataRecord(value, records, limits)]);
  }
  const workbookRecord = await encodeRecord(
    "metadata",
    { fields },
    [...new Set(fields.map(([, id]) => id))],
    limits.maxSnapshotBytes,
  );
  records.push(workbookRecord);
  const workbook = workbookRecord.id;
  const sheets: string[] = [];
  for (const sheet of snapshot.sheets) {
    const metadata: Array<[string, string]> = [];
    for (const [key, value] of Object.entries(sheet)) {
      if (key !== "cells" && value !== undefined)
        metadata.push([key, await metadataRecord(value, records, limits)]);
    }
    const pages = new Map<string, SnapshotCell[]>();
    for (const block of sheet.cells) {
      for (const cell of block.cells) {
        const row = block.startRow + cell.rowOffset;
        const col = block.startCol + cell.colOffset;
        const pageRow = Math.floor(row / PAGE_ROWS) * PAGE_ROWS;
        const pageCol = Math.floor(col / PAGE_COLS) * PAGE_COLS;
        const key = `${pageRow}:${pageCol}`;
        let page = pages.get(key);
        if (!page) {
          page = [];
          pages.set(key, page);
        }
        page.push({ ...cell, rowOffset: row - pageRow, colOffset: col - pageCol });
      }
    }
    const cellPages: Array<[number, number, string]> = [];
    const ordered = [...pages].sort(([left], [right]) => {
      const [leftRow = 0, leftCol = 0] = left.split(":").map(Number);
      const [rightRow = 0, rightCol = 0] = right.split(":").map(Number);
      return leftRow - rightRow || leftCol - rightCol;
    });
    for (const [key, cells] of ordered) {
      const [row = 0, col = 0] = key.split(":").map(Number);
      cells.sort(
        (left, right) => left.rowOffset - right.rowOffset || left.colOffset - right.colOffset,
      );
      const page = await encodeRecord("cells", cells, [], limits.maxSnapshotBytes);
      records.push(page);
      cellPages.push([row, col, page.id]);
    }
    const references = [
      ...new Set([...metadata.map(([, id]) => id), ...cellPages.map(([, , id]) => id)]),
    ];
    const sheetRecord = await encodeRecord(
      "sheet",
      { metadata, pages: cellPages },
      references,
      limits.maxSnapshotBytes,
    );
    records.push(sheetRecord);
    sheets.push(sheetRecord.id);
  }
  const root = await encodeRecord(
    "checkpoint",
    { schemaVersion: 1, documentId, revision, workbook, sheets, transactions },
    [...new Set([workbook, ...sheets, ...transactions])],
    limits.maxSnapshotBytes,
  );
  records.push(root);
  // Several identical metadata fields can share a content ID even within the same checkpoint.
  return {
    checkpoint: root.id,
    records: [...new Map(records.map((record) => [record.id, record])).values()],
  };
}

async function readMetadata(
  id: string,
  read: HistoryRecordReader,
  limits: Readonly<HistoryLimits>,
): Promise<unknown> {
  const record = await read(id);
  if (record.kind !== "metadata")
    throw new HistoryError("integrity", "Expected history metadata block");
  const decoded = await decodeRecord(record, limits);
  if (!object(decoded)) throw new HistoryError("integrity", "Invalid history metadata block");
  if (Object.hasOwn(decoded, "value")) return decoded.value;
  if (!strings(decoded.pieces) || decoded.pieces.length > 100_000)
    throw new HistoryError("integrity", "Invalid metadata block list");
  const combined: unknown[] = [];
  for (const pieceId of decoded.pieces) {
    if (!record.references.includes(pieceId))
      throw new HistoryError("integrity", "Unowned history metadata block");
    const pieceRecord = await read(pieceId);
    const piece = await decodeRecord(pieceRecord, limits);
    if (pieceRecord.kind !== "metadata" || !object(piece) || !Array.isArray(piece.value))
      throw new HistoryError("integrity", "Invalid history metadata slice");
    combined.push(...piece.value);
    if (combined.length > 1_000_000)
      throw new HistoryError("capacity", "History metadata exceeds its entry ceiling");
  }
  return combined;
}

/** Assemble a bounded canonical snapshot; all chunk references are verified before hydration. */
export async function readCheckpoint(
  id: string,
  read: HistoryRecordReader,
  limits: Readonly<HistoryLimits>,
): Promise<WorkbookSnapshot> {
  const record = await read(id);
  const root = await decodeRecord(record, limits);
  if (
    record.kind !== "checkpoint" ||
    !object(root) ||
    root.schemaVersion !== 1 ||
    typeof root.documentId !== "string" ||
    !integer(root.revision) ||
    typeof root.workbook !== "string" ||
    !strings(root.sheets) ||
    root.sheets.length > 256
  ) {
    throw new HistoryError("integrity", "Invalid history checkpoint manifest");
  }
  if (!record.references.includes(root.workbook))
    throw new HistoryError("integrity", "Unowned workbook metadata");
  const workbookRecord = await read(root.workbook);
  const workbookSource = await decodeRecord(workbookRecord, limits);
  if (
    workbookRecord.kind !== "metadata" ||
    !object(workbookSource) ||
    !Array.isArray(workbookSource.fields)
  )
    throw new HistoryError("integrity", "Invalid historical workbook metadata");
  const workbook: Record<string, unknown> = {};
  for (const field of workbookSource.fields) {
    if (
      !Array.isArray(field) ||
      field.length !== 2 ||
      typeof field[0] !== "string" ||
      typeof field[1] !== "string" ||
      !["activeSheet", "namedRanges", "xlsxSource", "calculation"].includes(field[0]) ||
      !workbookRecord.references.includes(field[1])
    )
      throw new HistoryError("integrity", "Invalid historical workbook metadata reference");
    workbook[field[0]] = await readMetadata(field[1], read, limits);
  }
  const sheets: unknown[] = [];
  let decodedBytes = record.decodedBytes;
  for (const sheetId of root.sheets) {
    if (!record.references.includes(sheetId))
      throw new HistoryError("integrity", "Unowned history sheet");
    const sheetRecord = await read(sheetId);
    const source = await decodeRecord(sheetRecord, limits);
    if (
      sheetRecord.kind !== "sheet" ||
      !object(source) ||
      !Array.isArray(source.metadata) ||
      !Array.isArray(source.pages)
    )
      throw new HistoryError("integrity", "Invalid history sheet manifest");
    const sheet: Record<string, unknown> = {};
    for (const field of source.metadata) {
      if (
        !Array.isArray(field) ||
        field.length !== 2 ||
        typeof field[0] !== "string" ||
        typeof field[1] !== "string" ||
        !sheetRecord.references.includes(field[1]) ||
        ["__proto__", "constructor", "prototype", "cells"].includes(field[0])
      )
        throw new HistoryError("integrity", "Invalid history sheet metadata reference");
      sheet[field[0]] = await readMetadata(field[1], read, limits);
    }
    if (!integer(sheet.rowCount) || !Array.isArray(sheet.columns))
      throw new HistoryError("integrity", "Invalid historical sheet dimensions");
    const cells: unknown[] = [];
    for (const page of source.pages) {
      if (
        !Array.isArray(page) ||
        page.length !== 3 ||
        !integer(page[0]) ||
        !integer(page[1]) ||
        typeof page[2] !== "string" ||
        !sheetRecord.references.includes(page[2])
      )
        throw new HistoryError("integrity", "Invalid history cell page reference");
      const pageRecord = await read(page[2]);
      decodedBytes += pageRecord.decodedBytes;
      if (
        decodedBytes * JS_SNAPSHOT_RESERVATION_MULTIPLIER > limits.maxWorkingBytes ||
        decodedBytes > limits.maxSnapshotBytes
      )
        throw new HistoryError(
          "capacity",
          "Historical cells exceed the reconstruction reservation",
        );
      const values = await decodeRecord(pageRecord, limits);
      if (
        pageRecord.kind !== "cells" ||
        !Array.isArray(values) ||
        values.length > PAGE_ROWS * PAGE_COLS
      )
        throw new HistoryError("integrity", "Invalid history cell page");
      cells.push({
        startRow: page[0],
        startCol: page[1],
        rowCount: Math.min(PAGE_ROWS, sheet.rowCount - page[0]),
        colCount: Math.min(PAGE_COLS, sheet.columns.length - page[1]),
        cells: values,
      });
    }
    sheet.cells = cells;
    sheets.push(sheet);
  }
  const input = {
    schemaVersion: 1,
    documentId: root.documentId,
    version: root.revision,
    workbook,
    sheets,
  };
  reserveSnapshot(input, limits);
  const checked = validateWorkbookSnapshot(input, {
    storage: "paged",
    resourceLimits: { maxSerializedBytes: limits.maxSnapshotBytes },
  });
  if (!checked.ok) throw new HistoryError("integrity", "Reconstructed history snapshot is invalid");
  return checked.value;
}
