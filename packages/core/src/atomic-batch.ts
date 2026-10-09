import { boundedJsonByteLength, JsonByteLengthError } from "./errors.js";
import type { CellStyle } from "./types/cell.js";
import type { CellAddress, Range } from "./types/coordinates.js";
import type { DocumentOp, PackedCellBlock } from "./types/document.js";
import type { TransactionResourceLimits } from "./types/transaction.js";

/**
 * An atomic batch is one store commit, one history step, and one `change`
 * event whose operations are too large for one transaction or server version.
 * Each member version still fits the ordinary limits; these ceilings bound the
 * whole batch.
 */
export const MAX_ATOMIC_BATCH_VERSIONS = 16;
export const MAX_ATOMIC_BATCH_ENCODED_BYTES = 64 * 1024 * 1024;

/** Bytes of the `[` and `]` that enclose the operation array of one version. */
const ARRAY_ENVELOPE_BYTES = 2;
/**
 * A split block piece targets this fraction of the version limit, so packing
 * whole pieces into versions leaves at most one eighth of each version unused.
 */
const PIECES_PER_VERSION = 8;
/**
 * Initial guess of the encoded bytes of one block cell. It sizes the first
 * band only; later bands use the measured bytes of the previous band.
 */
const FIRST_BAND_CELL_BYTES = 32;
/**
 * Later bands aim below the piece target so that small differences between
 * lines rarely push a band over it, which would cost a second measurement.
 */
const BAND_FILL_RATIO = 7 / 8;

type SetBlockOperation = Extract<DocumentOp, { op: "setBlock" }>;

const atomicBatches = new WeakSet<readonly DocumentOp[]>();

/**
 * Mark an engine-built operation array as one atomic batch. Only internal undo,
 * redo, durable replay, and assembled remote batches create marked arrays, so a
 * host transaction can never claim the larger ceilings.
 */
export function markAtomicBatch<T extends readonly DocumentOp[]>(operations: T): T {
  atomicBatches.add(operations);
  return operations;
}

export function isAtomicBatch(operations: readonly DocumentOp[]): boolean {
  return atomicBatches.has(operations);
}

/** Aggregate ceilings for a marked batch whose versions each fit `limits`. */
export function atomicBatchLimits(
  limits: Readonly<TransactionResourceLimits>,
): Readonly<TransactionResourceLimits> {
  return {
    maxOperations: Math.min(
      Number.MAX_SAFE_INTEGER,
      limits.maxOperations * MAX_ATOMIC_BATCH_VERSIONS,
    ),
    maxEncodedBytes: Math.min(
      MAX_ATOMIC_BATCH_ENCODED_BYTES,
      limits.maxEncodedBytes * MAX_ATOMIC_BATCH_VERSIONS,
    ),
  };
}

/**
 * Exact JSON bytes of each operation, in one walk. The operation array encodes
 * as `operationArrayBytes(sizes)` bytes. Throws a `JsonByteLengthError` with
 * code `limit` and the bytes observed so far when that total exceeds `limit`.
 */
export function measureOperationBytes(operations: readonly DocumentOp[], limit: number): number[] {
  const sizes: number[] = new Array(operations.length);
  let total = ARRAY_ENVELOPE_BYTES;
  for (let index = 0; index < operations.length; index++) {
    const separator = index > 0 ? 1 : 0;
    try {
      sizes[index] = boundedJsonByteLength(operations[index], limit - total - separator, {
        omitUndefinedProperties: true,
      });
    } catch (error) {
      if (error instanceof JsonByteLengthError && error.code === "limit") {
        const actual = total + separator + (error.actual ?? 0);
        throw new JsonByteLengthError(
          "limit",
          `Encoded JSON exceeds the ${limit} byte limit`,
          actual,
          limit,
        );
      }
      throw error;
    }
    total += separator + (sizes[index] ?? 0);
  }
  if (total > limit) {
    throw new JsonByteLengthError(
      "limit",
      `Encoded JSON exceeds the ${limit} byte limit`,
      total,
      limit,
    );
  }
  return sizes;
}

/** JSON bytes of an operation array whose operations encode as `sizes`. */
export function operationArrayBytes(sizes: readonly number[]): number {
  let total = ARRAY_ENVELOPE_BYTES + Math.max(0, sizes.length - 1);
  for (const size of sizes) total += size;
  return total;
}

/**
 * Greedily pack consecutive operations, whose JSON bytes are `sizes`, into
 * versions that each hold at most `maxOperations` operations and
 * `maxEncodedBytes` bytes of JSON operation array. Returns the operation count
 * of each version, or `null` when one operation alone is larger than a version.
 */
export function partitionVersionOperations(
  sizes: readonly number[],
  maxOperations: number,
  maxEncodedBytes: number,
): number[] | null {
  const counts: number[] = [];
  let count = 0;
  let bytes = ARRAY_ENVELOPE_BYTES;
  for (const operationBytes of sizes) {
    if (ARRAY_ENVELOPE_BYTES + operationBytes > maxEncodedBytes) return null;
    if (count > 0 && (count === maxOperations || bytes + 1 + operationBytes > maxEncodedBytes)) {
      counts.push(count);
      count = 0;
      bytes = ARRAY_ENVELOPE_BYTES;
    }
    // A comma separates every operation after the first.
    bytes += (count > 0 ? 1 : 0) + operationBytes;
    count += 1;
  }
  if (count > 0) counts.push(count);
  return counts;
}

interface PieceLimits {
  /** Target bytes of one split block piece. */
  pieceBytes: number;
  /** Largest operation that still fits one version on its own. */
  versionBytes: number;
}

/**
 * Replace each `setBlock` that is larger than a fraction of one version with
 * row bands (or column bands of a single row) that restore the same cells.
 * Returns the operations with their exact encoded array bytes, or `null` when
 * an operation cannot become small enough to fit one version of `limits`.
 */
export function splitOversizedBlocks(
  operations: readonly DocumentOp[],
  limits: Readonly<TransactionResourceLimits>,
): { operations: DocumentOp[]; encodedBytes: number } | null {
  const pieceLimits: PieceLimits = {
    pieceBytes: Math.max(1, Math.floor(limits.maxEncodedBytes / PIECES_PER_VERSION)),
    versionBytes: limits.maxEncodedBytes - ARRAY_ENVELOPE_BYTES,
  };
  const pieces: DocumentOp[] = [];
  const sizes: number[] = [];
  for (const operation of operations) {
    if (operation.op === "setBlock") {
      const bytes = measureOperation(operation, pieceLimits.pieceBytes);
      if (bytes !== null) {
        pieces.push(operation);
        sizes.push(bytes);
      } else if (!splitBlock(operation, pieceLimits, pieces, sizes)) {
        return null;
      }
      continue;
    }
    const bytes = measureOperation(operation, pieceLimits.versionBytes);
    if (bytes === null) return null;
    pieces.push(operation);
    sizes.push(bytes);
  }
  return { operations: pieces, encodedBytes: operationArrayBytes(sizes) };
}

/**
 * Cut a block into consecutive bands of whole lines. Each band is measured
 * once against the piece target; a band above the target is retried with
 * half the lines, and a single line above it is cut into column bands.
 */
function splitBlock(
  operation: SetBlockOperation,
  limits: PieceLimits,
  pieces: DocumentOp[],
  sizes: number[],
): boolean {
  const { block } = operation;
  const alongRows = block.rowCount > 1;
  const length = alongRows ? block.rowCount : block.colCount;
  const lineCells = alongRows ? block.colCount : 1;
  let bandLength = Math.max(1, Math.floor(limits.pieceBytes / (FIRST_BAND_CELL_BYTES * lineCells)));
  for (let start = 0; start < length; ) {
    const lines = Math.min(bandLength, length - start);
    const band = alongRows
      ? sliceBlock(operation, start, lines, 0, block.colCount)
      : sliceBlock(operation, 0, 1, start, lines);
    const bytes = measureOperation(band, limits.pieceBytes);
    if (bytes !== null) {
      pieces.push(band);
      sizes.push(bytes);
      start += lines;
      // Size the next band from the measured bytes per line of this one.
      bandLength = Math.max(
        1,
        Math.floor((lines * limits.pieceBytes * BAND_FILL_RATIO) / Math.max(1, bytes)),
      );
      continue;
    }
    if (lines > 1) {
      bandLength = Math.max(1, lines >> 1);
      continue;
    }
    if (alongRows && block.colCount > 1) {
      if (!splitBlock(band, limits, pieces, sizes)) return false;
    } else {
      const cellBytes = measureOperation(band, limits.versionBytes);
      if (cellBytes === null) return false;
      pieces.push(band);
      sizes.push(cellBytes);
    }
    start += 1;
  }
  return true;
}

function sliceBlock(
  operation: SetBlockOperation,
  rowOffset: number,
  rowCount: number,
  colOffset: number,
  colCount: number,
): SetBlockOperation {
  const { block, range } = operation;
  const startRow = Math.min(range.start.row, range.end.row) + rowOffset;
  const startCol = Math.min(range.start.col, range.end.col) + colOffset;
  const values: PackedCellBlock["values"] = new Array(rowCount * colCount);
  const sourceStyles = block.styleIds;
  const styleIds: number[] | undefined = sourceStyles ? new Array(rowCount * colCount) : undefined;
  const styleTable: CellStyle[] = [];
  const styleIndex = new Map<number, number>();
  for (let row = 0; row < rowCount; row++) {
    const sourceRow = (rowOffset + row) * block.colCount + colOffset;
    for (let col = 0; col < colCount; col++) {
      const target = row * colCount + col;
      values[target] = block.values[sourceRow + col] ?? null;
      if (!sourceStyles || !styleIds) continue;
      const sourceStyle = sourceStyles[sourceRow + col] ?? 0;
      let style = styleIndex.get(sourceStyle);
      if (style === undefined) {
        style = styleTable.length;
        styleIndex.set(sourceStyle, style);
        styleTable.push(block.styleTable?.[sourceStyle] ?? {});
      }
      styleIds[target] = style;
    }
  }
  const inBand = (offset: number): number | null => {
    const row = Math.floor(offset / block.colCount) - rowOffset;
    const col = (offset % block.colCount) - colOffset;
    return row >= 0 && row < rowCount && col >= 0 && col < colCount ? row * colCount + col : null;
  };
  const formulas: Array<[number, string]> = [];
  for (const [offset, source] of block.formulas ?? []) {
    const target = inBand(offset);
    if (target !== null) formulas.push([target, source]);
  }
  const refs: Array<[number, CellAddress]> = [];
  for (const [offset, address] of block.refs ?? []) {
    const target = inBand(offset);
    if (target !== null) refs.push([target, address]);
  }
  const bandRange: Range = {
    sheet: range.sheet,
    start: { row: startRow, col: startCol },
    end: { row: startRow + rowCount - 1, col: startCol + colCount - 1 },
  };
  return {
    op: "setBlock",
    range: bandRange,
    block: {
      rowCount,
      colCount,
      values,
      ...(formulas.length > 0 ? { formulas } : {}),
      ...(refs.length > 0 ? { refs } : {}),
      ...(styleIds ? { styleTable, styleIds } : {}),
    },
  };
}

/** Exact JSON bytes of one operation, or `null` above `limit`. */
function measureOperation(operation: DocumentOp, limit: number): number | null {
  try {
    return boundedJsonByteLength(operation, limit, { omitUndefinedProperties: true });
  } catch (error) {
    if (error instanceof JsonByteLengthError && error.code === "limit") return null;
    throw error;
  }
}
