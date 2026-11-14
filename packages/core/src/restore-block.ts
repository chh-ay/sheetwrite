import { deflateSync } from "fflate";

import { validateDocumentOperationShape } from "./document-protocol.js";
import { boundedJsonByteLength, JsonByteLengthError } from "./json-bytes.js";
import {
  assertRestoreBlockCells,
  assertRestoreBlockFits,
  invalidRestoreBlock,
  MAX_RESTORE_BLOCK_DECODED_BYTES,
  restoreBlockLimit,
} from "./restore-block-codec.js";
import { preparedRestore } from "./transaction-preparation.js";
import type { Range } from "./types/coordinates.js";
import type { DocumentOp, PackedCellBlock } from "./types/document.js";

export { MAX_RESTORE_BLOCK_DECODED_BYTES };

type RestoreBlock = Extract<DocumentOp, { op: "restoreBlock" }>;

function assertBlock(range: Range, block: PackedCellBlock): void {
  assertRestoreBlockFits(range, block);
  if (validateDocumentOperationShape({ op: "setBlock", range, block }).length)
    invalidRestoreBlock();
}

export function encodeRestoreBlock(range: Range, block: PackedCellBlock): RestoreBlock {
  assertBlock(range, block);
  // Inspect before stringify so a rejected block cannot allocate an oversized JSON string.
  try {
    boundedJsonByteLength(block, MAX_RESTORE_BLOCK_DECODED_BYTES, {
      omitUndefinedProperties: true,
    });
  } catch (error) {
    if (error instanceof JsonByteLengthError && error.code === "payload-limit") {
      throw restoreBlockLimit("Restore block exceeds the decoded byte limit");
    }
    invalidRestoreBlock(error);
  }
  return encodeMeasuredRestoreBlock(range, block, undefined);
}

/** Internal engine path: the snapshot builder already measured its plain scalar arrays. */
export function encodeMeasuredRestoreBlock(
  range: Range,
  block: PackedCellBlock,
  decodedBytes: number | undefined,
): RestoreBlock {
  assertRestoreBlockCells(block);
  if (decodedBytes !== undefined && decodedBytes > MAX_RESTORE_BLOCK_DECODED_BYTES) {
    throw restoreBlockLimit("Restore block exceeds the decoded byte limit");
  }
  const bytes = new TextEncoder().encode(JSON.stringify(block));
  if (bytes.length > MAX_RESTORE_BLOCK_DECODED_BYTES) {
    throw restoreBlockLimit("Restore block exceeds the decoded byte limit");
  }
  // The fastest level: undo data is mostly numbers and text that higher levels
  // shrink by under 5 percent at two to three times the cost.
  const compressed = deflateSync(bytes, { level: 1 });
  return {
    op: "restoreBlock",
    range: { ...range, start: { ...range.start }, end: { ...range.end } },
    encoding: "deflate-json-v1",
    decodedBytes: bytes.length,
    data: base64(compressed),
  };
}

/** Bytes per `String.fromCharCode` call when the runtime has no native encoder. */
const BINARY_STRING_CHUNK = 8192;

function base64(bytes: Uint8Array): string {
  // Native since Chromium 140, Firefox 133 and Safari 18.2; older hosts build a binary string.
  if (typeof bytes.toBase64 === "function") return bytes.toBase64();
  let binary = "";
  for (let at = 0; at < bytes.length; at += BINARY_STRING_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + BINARY_STRING_CHUNK));
  }
  return btoa(binary);
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

export function restoreBlockFacts(operation: RestoreBlock) {
  const prepared = preparedRestore(operation, validateDocumentOperationShape);
  if (prepared.errors.length > 0) invalidRestoreBlock();
  const block = prepared.block;
  if (
    block.rowCount !== Math.abs(operation.range.end.row - operation.range.start.row) + 1 ||
    block.colCount !== Math.abs(operation.range.end.col - operation.range.start.col) + 1 ||
    (block.styleIds !== undefined && block.styleTable === undefined)
  )
    invalidRestoreBlock();
  return prepared;
}

/** Return a decoded block for codec consumers and privately owned rebase transforms. */
export function decodeRestoreBlock(operation: RestoreBlock): PackedCellBlock {
  return restoreBlockFacts(operation).block;
}
