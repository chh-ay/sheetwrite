import { validateWorkbookSnapshot } from "../document-protocol.js";
import type { SheetSnapshot, SnapshotCell, WorkbookSnapshot } from "../types/document.js";
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

/**
 * Cell page size. A one-cell edit changes one page, so a later checkpoint
 * stores about 1 KiB for it and refers to every other page by ID. Pages of 64
 * cells keep the per-page overhead (ID, header, index entry) under the page
 * payload for typical sheets.
 */
const PAGE_ROWS = 16;
const PAGE_COLS = 4;

/** Large metadata arrays (names, notes, rules) split into blocks, so one change stores one block. */
const METADATA_ENTRIES_PER_BLOCK = 128;

/** Metadata entries one field can hold after its blocks are joined; matches the snapshot ceiling. */
const MAX_METADATA_ENTRIES = 1_000_000;

/** Sheets in one checkpoint; matches the snapshot ceiling. */
const MAX_SHEETS = 256;

/**
 * Working-set bytes per encoded snapshot byte while a checkpoint is built or
 * read: the snapshot objects, the validated copy and the page JSON.
 */
const SNAPSHOT_RESERVATION_MULTIPLIER = 8;

const CHECKPOINT_SCHEMA_VERSION = 1;

const WORKBOOK_FIELDS: readonly string[] = [
  "activeSheet",
  "namedRanges",
  "xlsxSource",
  "calculation",
];

/** Keys that must never be written onto a decoded sheet object. */
const FORBIDDEN_SHEET_FIELDS: readonly string[] = [
  "__proto__",
  "constructor",
  "prototype",
  "cells",
];

/** The records of one checkpoint, children before owners, and the ID of its root record. */
export interface CheckpointWrite {
  records: HistoryStoredRecord[];
  checkpoint: string;
}

/** Fetch one verified record by ID. */
export type HistoryRecordReader = (id: string) => Promise<HistoryStoredRecord>;

function reserveSnapshot(input: unknown, limits: Readonly<HistoryLimits>): void {
  const encoded = historyJsonSize(input, limits.maxSnapshotBytes);

  if (encoded * SNAPSHOT_RESERVATION_MULTIPLIER > limits.maxWorkingBytes) {
    throw new HistoryError("capacity", "History snapshot exceeds its working-set reservation");
  }
}

/** Store one metadata value; a large array becomes a list of block records. */
async function writeMetadata(
  value: unknown,
  records: HistoryStoredRecord[],
  limits: Readonly<HistoryLimits>,
): Promise<string> {
  if (!Array.isArray(value) || value.length <= METADATA_ENTRIES_PER_BLOCK) {
    const record = await encodeRecord("metadata", { value }, [], limits.maxSnapshotBytes);
    records.push(record);

    return record.id;
  }

  const pieces: string[] = [];
  for (let at = 0; at < value.length; at += METADATA_ENTRIES_PER_BLOCK) {
    const slice = value.slice(at, at + METADATA_ENTRIES_PER_BLOCK);
    const piece = await encodeRecord("metadata", { value: slice }, [], limits.maxSnapshotBytes);

    records.push(piece);
    pieces.push(piece.id);
  }

  const list = await encodeRecord(
    "metadata",
    { pieces },
    [...new Set(pieces)],
    limits.maxSnapshotBytes,
  );
  records.push(list);

  return list.id;
}

/** Group a sheet's cells into fixed pages keyed by their top-left data coordinates. */
function cellPages(sheet: SheetSnapshot): Array<[row: number, col: number, cells: SnapshotCell[]]> {
  const pages = new Map<string, [number, number, SnapshotCell[]]>();

  for (const block of sheet.cells) {
    for (const cell of block.cells) {
      const row = block.startRow + cell.rowOffset;
      const col = block.startCol + cell.colOffset;
      const pageRow = Math.floor(row / PAGE_ROWS) * PAGE_ROWS;
      const pageCol = Math.floor(col / PAGE_COLS) * PAGE_COLS;
      const key = `${pageRow}:${pageCol}`;

      let page = pages.get(key);
      if (!page) {
        page = [pageRow, pageCol, []];
        pages.set(key, page);
      }

      page[2].push({ ...cell, rowOffset: row - pageRow, colOffset: col - pageCol });
    }
  }

  // A canonical order gives equal pages equal bytes, so equal content gets one ID.
  const ordered = [...pages.values()].sort(
    ([leftRow, leftCol], [rightRow, rightCol]) => leftRow - rightRow || leftCol - rightCol,
  );

  for (const [, , cells] of ordered) {
    cells.sort(
      (left, right) => left.rowOffset - right.rowOffset || left.colOffset - right.colOffset,
    );
  }

  return ordered;
}

async function writeSheet(
  sheet: SheetSnapshot,
  records: HistoryStoredRecord[],
  limits: Readonly<HistoryLimits>,
): Promise<string> {
  const metadata: Array<[field: string, id: string]> = [];
  for (const [field, value] of Object.entries(sheet)) {
    if (field !== "cells" && value !== undefined) {
      metadata.push([field, await writeMetadata(value, records, limits)]);
    }
  }

  const pages: Array<[row: number, col: number, id: string]> = [];
  for (const [row, col, cells] of cellPages(sheet)) {
    const page = await encodeRecord("cells", cells, [], limits.maxSnapshotBytes);

    records.push(page);
    pages.push([row, col, page.id]);
  }

  const references = new Set([...metadata.map(([, id]) => id), ...pages.map(([, , id]) => id)]);
  const record = await encodeRecord(
    "sheet",
    { metadata, pages },
    [...references],
    limits.maxSnapshotBytes,
  );
  records.push(record);

  return record.id;
}

/**
 * Store a validated committed snapshot as content-addressed chunks. Chunks
 * whose content did not change since an earlier checkpoint get the same ID, so
 * the adapter keeps one copy. `transactions` are the log entries since the
 * previous checkpoint: the checkpoint refers to them, so who made each change
 * stays retained as long as the checkpoint is.
 */
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

  if (!checked.ok) {
    throw new HistoryError(
      "invalid-history",
      "History checkpoint is not a valid workbook snapshot",
    );
  }

  const snapshot = checked.value;
  if (snapshot.documentId !== documentId || (snapshot.version ?? 0) !== revision) {
    throw new HistoryError(
      "invalid-history",
      "History checkpoint does not describe the committed document revision",
    );
  }

  const records: HistoryStoredRecord[] = [];

  const fields: Array<[field: string, id: string]> = [];
  for (const [field, value] of Object.entries(snapshot.workbook)) {
    if (value !== undefined) {
      fields.push([field, await writeMetadata(value, records, limits)]);
    }
  }

  const workbook = await encodeRecord(
    "metadata",
    { fields },
    [...new Set(fields.map(([, id]) => id))],
    limits.maxSnapshotBytes,
  );
  records.push(workbook);

  const sheets: string[] = [];
  for (const sheet of snapshot.sheets) {
    sheets.push(await writeSheet(sheet, records, limits));
  }

  const root = await encodeRecord(
    "checkpoint",
    {
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      documentId,
      revision,
      workbook: workbook.id,
      sheets,
      transactions,
    },
    [...new Set([workbook.id, ...sheets, ...transactions])],
    limits.maxSnapshotBytes,
  );
  records.push(root);

  // Equal values (for example two empty rule lists) share one record inside a checkpoint too.
  const unique = new Map(records.map((record) => [record.id, record]));

  return { checkpoint: root.id, records: [...unique.values()] };
}

async function readMetadata(
  id: string,
  read: HistoryRecordReader,
  limits: Readonly<HistoryLimits>,
): Promise<unknown> {
  const record = await read(id);
  if (record.kind !== "metadata") {
    throw new HistoryError("integrity", "Expected history metadata block");
  }

  const decoded = await decodeRecord(record, limits);
  if (!object(decoded)) {
    throw new HistoryError("integrity", "Invalid history metadata block");
  }

  if (Object.hasOwn(decoded, "value")) {
    return decoded.value;
  }

  const pieces = decoded.pieces;
  if (!strings(pieces) || pieces.length * METADATA_ENTRIES_PER_BLOCK > MAX_METADATA_ENTRIES) {
    throw new HistoryError("integrity", "Invalid metadata block list");
  }

  const combined: unknown[] = [];
  for (const pieceId of pieces) {
    if (!record.references.includes(pieceId)) {
      throw new HistoryError("integrity", "Unowned history metadata block");
    }

    const pieceRecord = await read(pieceId);
    const piece = await decodeRecord(pieceRecord, limits);
    if (pieceRecord.kind !== "metadata" || !object(piece) || !Array.isArray(piece.value)) {
      throw new HistoryError("integrity", "Invalid history metadata slice");
    }

    combined.push(...piece.value);
  }

  return combined;
}

/** A `[field, id]` pair whose ID the owning record refers to. */
function fieldReference(
  field: unknown,
  owner: HistoryStoredRecord,
): field is [field: string, id: string] {
  return (
    Array.isArray(field) &&
    field.length === 2 &&
    typeof field[0] === "string" &&
    typeof field[1] === "string" &&
    owner.references.includes(field[1])
  );
}

async function readWorkbook(
  id: string,
  read: HistoryRecordReader,
  limits: Readonly<HistoryLimits>,
): Promise<Record<string, unknown>> {
  const record = await read(id);
  const source = await decodeRecord(record, limits);
  if (record.kind !== "metadata" || !object(source) || !Array.isArray(source.fields)) {
    throw new HistoryError("integrity", "Invalid historical workbook metadata");
  }

  const workbook: Record<string, unknown> = {};
  for (const field of source.fields) {
    if (!fieldReference(field, record) || !WORKBOOK_FIELDS.includes(field[0])) {
      throw new HistoryError("integrity", "Invalid historical workbook metadata reference");
    }

    workbook[field[0]] = await readMetadata(field[1], read, limits);
  }

  return workbook;
}

/** Running count of decoded cell-page bytes, checked against the reconstruction reservation. */
interface DecodedBudget {
  bytes: number;
}

async function readSheet(
  id: string,
  read: HistoryRecordReader,
  limits: Readonly<HistoryLimits>,
  budget: DecodedBudget,
): Promise<Record<string, unknown>> {
  const record = await read(id);
  const source = await decodeRecord(record, limits);
  if (record.kind !== "sheet" || !object(source)) {
    throw new HistoryError("integrity", "Invalid history sheet manifest");
  }

  const metadataFields = source.metadata;
  const pageReferences = source.pages;
  if (!Array.isArray(metadataFields) || !Array.isArray(pageReferences)) {
    throw new HistoryError("integrity", "Invalid history sheet manifest");
  }

  const sheet: Record<string, unknown> = {};
  for (const field of metadataFields) {
    if (!fieldReference(field, record) || FORBIDDEN_SHEET_FIELDS.includes(field[0])) {
      throw new HistoryError("integrity", "Invalid history sheet metadata reference");
    }

    sheet[field[0]] = await readMetadata(field[1], read, limits);
  }

  const rowCount = sheet.rowCount;
  const columns = sheet.columns;
  if (!integer(rowCount) || !Array.isArray(columns)) {
    throw new HistoryError("integrity", "Invalid historical sheet dimensions");
  }

  const cells: unknown[] = [];
  for (const page of pageReferences) {
    const validPage =
      Array.isArray(page) &&
      page.length === 3 &&
      integer(page[0]) &&
      integer(page[1]) &&
      typeof page[2] === "string" &&
      record.references.includes(page[2]);

    if (!validPage) {
      throw new HistoryError("integrity", "Invalid history cell page reference");
    }

    const pageRecord = await read(page[2]);
    budget.bytes += pageRecord.decodedBytes;

    const overBudget =
      budget.bytes * SNAPSHOT_RESERVATION_MULTIPLIER > limits.maxWorkingBytes ||
      budget.bytes > limits.maxSnapshotBytes;

    if (overBudget) {
      throw new HistoryError("capacity", "Historical cells exceed the reconstruction reservation");
    }

    const values = await decodeRecord(pageRecord, limits);
    if (
      pageRecord.kind !== "cells" ||
      !Array.isArray(values) ||
      values.length > PAGE_ROWS * PAGE_COLS
    ) {
      throw new HistoryError("integrity", "Invalid history cell page");
    }

    // Page bounds outside the sheet fail the snapshot validation below.
    cells.push({
      startRow: page[0],
      startCol: page[1],
      rowCount: Math.min(PAGE_ROWS, rowCount - page[0]),
      colCount: Math.min(PAGE_COLS, columns.length - page[1]),
      cells: values,
    });
  }

  sheet.cells = cells;

  return sheet;
}

/**
 * Rebuild a checkpoint into a validated snapshot. Every reference is checked
 * against its owner, and decoded bytes are counted against the working-set
 * reservation before the next page is read.
 */
export async function readCheckpoint(
  id: string,
  read: HistoryRecordReader,
  limits: Readonly<HistoryLimits>,
): Promise<WorkbookSnapshot> {
  const record = await read(id);
  const root = await decodeRecord(record, limits);
  if (record.kind !== "checkpoint" || !object(root)) {
    throw new HistoryError("integrity", "Invalid history checkpoint manifest");
  }

  const documentId = root.documentId;
  const revision = root.revision;
  const workbookId = root.workbook;
  const sheetIds = root.sheets;
  const validRoot =
    root.schemaVersion === CHECKPOINT_SCHEMA_VERSION &&
    typeof documentId === "string" &&
    integer(revision) &&
    typeof workbookId === "string" &&
    strings(sheetIds) &&
    sheetIds.length <= MAX_SHEETS;

  if (!validRoot) {
    throw new HistoryError("integrity", "Invalid history checkpoint manifest");
  }

  if (!record.references.includes(workbookId)) {
    throw new HistoryError("integrity", "Unowned workbook metadata");
  }

  const workbook = await readWorkbook(workbookId, read, limits);

  const budget: DecodedBudget = { bytes: record.decodedBytes };
  const sheets: unknown[] = [];
  for (const sheetId of sheetIds) {
    if (!record.references.includes(sheetId)) {
      throw new HistoryError("integrity", "Unowned history sheet");
    }

    sheets.push(await readSheet(sheetId, read, limits, budget));
  }

  const input = {
    schemaVersion: 1,
    documentId,
    version: revision,
    workbook,
    sheets,
  };

  reserveSnapshot(input, limits);

  const checked = validateWorkbookSnapshot(input, {
    storage: "paged",
    resourceLimits: { maxSerializedBytes: limits.maxSnapshotBytes },
  });

  if (!checked.ok) {
    throw new HistoryError("integrity", "Reconstructed history snapshot is invalid");
  }

  return checked.value;
}
