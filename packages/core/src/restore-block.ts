import { deflateSync } from "fflate";
import { validateDocumentOperationShape } from "./document-protocol.js";
import { boundedJsonByteLength, JsonByteLengthError } from "./errors.js";
import {
  decodeRestoreBlockPayload,
  MAX_RESTORE_BLOCK_CELLS,
  MAX_RESTORE_BLOCK_DECODED_BYTES,
} from "./restore-block-codec.js";
import type { Range } from "./types/coordinates.js";
import type { DocumentOp, PackedCellBlock } from "./types/document.js";

export { MAX_RESTORE_BLOCK_DECODED_BYTES };

type RestoreBlock = Extract<DocumentOp, { op: "restoreBlock" }>;

function invalid(): never {
  throw new Error("Invalid restore block");
}

function assertCellLimit(block: PackedCellBlock): void {
  if (block.rowCount > Math.floor(MAX_RESTORE_BLOCK_CELLS / block.colCount)) {
    throw new RangeError("Restore block exceeds the cell limit");
  }
}

function assertBlock(range: Range, block: PackedCellBlock): void {
  assertCellLimit(block);
  if (validateDocumentOperationShape({ op: "setBlock", range, block }).length) invalid();
  if (
    block.rowCount !== Math.abs(range.end.row - range.start.row) + 1 ||
    block.colCount !== Math.abs(range.end.col - range.start.col) + 1 ||
    (block.styleIds !== undefined && block.styleTable === undefined)
  )
    invalid();
}

export function encodeRestoreBlock(range: Range, block: PackedCellBlock): RestoreBlock {
  assertBlock(range, block);
  // Inspect before stringify so a rejected block cannot allocate an oversized JSON string.
  try {
    boundedJsonByteLength(block, MAX_RESTORE_BLOCK_DECODED_BYTES, {
      omitUndefinedProperties: true,
    });
  } catch (error) {
    if (error instanceof JsonByteLengthError && error.code === "limit") {
      throw new RangeError("Restore block exceeds the decoded byte limit");
    }
    throw new Error("Invalid restore block JSON", { cause: error });
  }
  const bytes = new TextEncoder().encode(JSON.stringify(block));
  if (bytes.length > MAX_RESTORE_BLOCK_DECODED_BYTES) {
    throw new RangeError("Restore block exceeds the decoded byte limit");
  }
  // The fastest level: undo data is mostly numbers and text that higher levels
  // shrink by under 5 percent at two to three times the cost.
  const compressed = deflateSync(bytes, { level: 1 });
  let binary = "";
  for (let at = 0; at < compressed.length; at += 8192) {
    binary += String.fromCharCode(...compressed.subarray(at, at + 8192));
  }
  return {
    op: "restoreBlock",
    range: { ...range, start: { ...range.start }, end: { ...range.end } },
    encoding: "deflate-json-v1",
    decodedBytes: bytes.length,
    data: btoa(binary),
  };
}

/** Cells compressed to estimate how well a whole block compresses. */
const ESTIMATE_SAMPLE_CELLS = 65_536;
/** Base64 writes 4 characters for every 3 bytes. */
const BASE64_EXPANSION = 4 / 3;

/**
 * Estimate the encoded bytes of `encodeRestoreBlock(range, block)` from its
 * leading rows, without encoding the whole block. Compression of a large block
 * costs about as much as applying it, so callers skip the attempt when the
 * estimate cannot fit their byte limit.
 */
export function estimateRestoreBlockBytes(block: PackedCellBlock): number {
  const sampleRows = Math.max(
    1,
    Math.min(block.rowCount, Math.floor(ESTIMATE_SAMPLE_CELLS / Math.max(1, block.colCount))),
  );
  const sampleCells = sampleRows * block.colCount;
  const sample = new TextEncoder().encode(
    JSON.stringify({
      rowCount: sampleRows,
      colCount: block.colCount,
      values: block.values.slice(0, sampleCells),
      styleTable: block.styleTable,
      styleIds: block.styleIds?.slice(0, sampleCells),
    }),
  );
  const compressed = deflateSync(sample, { level: 1 }).length;
  return Math.ceil(((compressed * block.rowCount) / sampleRows) * BASE64_EXPANSION);
}

export function decodeRestoreBlock(operation: RestoreBlock): PackedCellBlock {
  const block = decodeRestoreBlockPayload(operation);
  assertBlock(operation.range, block);
  return block;
}
