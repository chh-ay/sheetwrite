import { boundedJsonByteLength, JsonByteLengthError } from "./json-bytes.js";
import { preparedHistoryBlock } from "./transaction-preparation.js";
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

const atomic_batches = new WeakSet<readonly DocumentOp[]>();

/**
 * Mark an engine-built operation array as one atomic batch. Only internal undo,
 * redo, durable replay, and assembled remote batches create marked arrays, so a
 * host transaction can never claim the larger ceilings.
 */
export function markAtomicBatch<T extends readonly DocumentOp[]>(operations: T): T {
  atomic_batches.add(operations);
  return operations;
}

export function isAtomicBatch(operations: readonly DocumentOp[]): boolean {
  return atomic_batches.has(operations);
}

/**
 * Whether `counts` splits `operationCount` operations into the versions of
 * one atomic batch: an array of 2 to `maxVersions` own entries, each a
 * positive safe integer, that sum to `operationCount`.
 */
export function validVersionOperationCounts(
  counts: unknown,
  operationCount: number,
  maxVersions: number = MAX_ATOMIC_BATCH_VERSIONS,
): counts is number[] {
  if (!Array.isArray(counts) || counts.length < 2 || counts.length > maxVersions) return false;

  let total = 0;
  for (let index = 0; index < counts.length; index++) {
    const count: unknown = Object.hasOwn(counts, index) ? counts[index] : undefined;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count <= 0) return false;

    total += count;
  }
  return total === operationCount;
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
    const operation = operations[index];
    // Undo blocks are measured once when the engine builds them; walking their
    // million-value arrays again here would repeat the dominant undo cost.
    const history =
      operation?.op === "setBlock" ? preparedHistoryBlock(operation.block) : undefined;
    if (history) {
      sizes[index] = history.operationBytes;
      total += separator + history.operationBytes;
      continue;
    }

    try {
      sizes[index] = boundedJsonByteLength(operations[index], limit - total - separator, {
        omitUndefinedProperties: true,
      });
    } catch (error) {
      if (error instanceof JsonByteLengthError && error.code === "payload-limit") {
        const actual = total + separator + (error.actual ?? 0);
        throw new JsonByteLengthError(
          "payload-limit",
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
      "payload-limit",
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

  for (const operation_bytes of sizes) {
    if (ARRAY_ENVELOPE_BYTES + operation_bytes > maxEncodedBytes) return null;

    if (count > 0 && (count === maxOperations || bytes + 1 + operation_bytes > maxEncodedBytes)) {
      counts.push(count);
      count = 0;
      bytes = ARRAY_ENVELOPE_BYTES;
    }

    bytes += (count > 0 ? 1 : 0) + operation_bytes;
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
  const piece_limits: PieceLimits = {
    pieceBytes: Math.max(1, Math.floor(limits.maxEncodedBytes / PIECES_PER_VERSION)),
    versionBytes: limits.maxEncodedBytes - ARRAY_ENVELOPE_BYTES,
  };
  const pieces: DocumentOp[] = [];
  const sizes: number[] = [];
  for (const operation of operations) {
    if (operation.op === "setBlock") {
      const bytes = measure_operation(operation, piece_limits.pieceBytes);
      if (bytes !== null) {
        pieces.push(operation);
        sizes.push(bytes);
      } else if (!split_block(operation, piece_limits, pieces, sizes)) {
        return null;
      }
      continue;
    }
    const bytes = measure_operation(operation, piece_limits.versionBytes);
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
function split_block(
  operation: SetBlockOperation,
  limits: PieceLimits,
  pieces: DocumentOp[],
  sizes: number[],
): boolean {
  const { block } = operation;
  const along_rows = block.rowCount > 1;
  const length = along_rows ? block.rowCount : block.colCount;
  const line_cells = along_rows ? block.colCount : 1;
  let band_length = Math.max(
    1,
    Math.floor(limits.pieceBytes / (FIRST_BAND_CELL_BYTES * line_cells)),
  );

  for (let start = 0; start < length;) {
    const lines = Math.min(band_length, length - start);
    const band = along_rows
      ? slice_block(operation, start, lines, 0, block.colCount)
      : slice_block(operation, 0, 1, start, lines);
    const bytes = measure_operation(band, limits.pieceBytes);

    if (bytes !== null) {
      pieces.push(band);
      sizes.push(bytes);
      start += lines;
      // Size the next band from the measured bytes per line of this one.
      band_length = Math.max(
        1,
        Math.floor((lines * limits.pieceBytes * BAND_FILL_RATIO) / Math.max(1, bytes)),
      );
      continue;
    }

    if (lines > 1) {
      band_length = Math.max(1, lines >> 1);
      continue;
    }

    if (along_rows && block.colCount > 1) {
      if (!split_block(band, limits, pieces, sizes)) return false;
    } else {
      const cell_bytes = measure_operation(band, limits.versionBytes);
      if (cell_bytes === null) return false;
      pieces.push(band);
      sizes.push(cell_bytes);
    }

    start += 1;
  }

  return true;
}

function slice_block(
  operation: SetBlockOperation,
  row_offset: number,
  row_count: number,
  col_offset: number,
  col_count: number,
): SetBlockOperation {
  const { block, range } = operation;
  const start_row = Math.min(range.start.row, range.end.row) + row_offset;
  const start_col = Math.min(range.start.col, range.end.col) + col_offset;
  const values: PackedCellBlock["values"] = new Array(row_count * col_count);
  const source_styles = block.styleIds;
  const style_ids: number[] | undefined = source_styles
    ? new Array(row_count * col_count)
    : undefined;
  const style_table: CellStyle[] = [];
  const style_index = new Map<number, number>();
  for (let row = 0; row < row_count; row++) {
    const source_row = (row_offset + row) * block.colCount + col_offset;
    for (let col = 0; col < col_count; col++) {
      const target = row * col_count + col;
      values[target] = block.values[source_row + col] ?? null;
      if (!source_styles || !style_ids) continue;
      const source_style = source_styles[source_row + col] ?? 0;
      let style = style_index.get(source_style);
      if (style === undefined) {
        style = style_table.length;
        style_index.set(source_style, style);
        style_table.push(block.styleTable?.[source_style] ?? {});
      }

      style_ids[target] = style;
    }
  }

  const in_band = (offset: number): number | null => {
    const row = Math.floor(offset / block.colCount) - row_offset;
    const col = (offset % block.colCount) - col_offset;
    return row >= 0 && row < row_count && col >= 0 && col < col_count
      ? row * col_count + col
      : null;
  };

  const formulas: Array<[number, string]> = [];
  for (const [offset, source] of block.formulas ?? []) {
    const target = in_band(offset);
    if (target !== null) formulas.push([target, source]);
  }

  const refs: Array<[number, CellAddress]> = [];
  for (const [offset, address] of block.refs ?? []) {
    const target = in_band(offset);
    if (target !== null) refs.push([target, address]);
  }

  const band_range: Range = {
    sheet: range.sheet,
    start: { row: start_row, col: start_col },
    end: { row: start_row + row_count - 1, col: start_col + col_count - 1 },
  };

  return {
    op: "setBlock",
    range: band_range,
    block: {
      rowCount: row_count,
      colCount: col_count,
      values,
      ...(formulas.length > 0 ? { formulas } : {}),
      ...(refs.length > 0 ? { refs } : {}),
      ...(style_ids ? { styleTable: style_table, styleIds: style_ids } : {}),
    },
  };
}

/** Exact JSON bytes of one operation, or `null` above `limit`. */
function measure_operation(operation: DocumentOp, limit: number): number | null {
  try {
    return boundedJsonByteLength(operation, limit, { omitUndefinedProperties: true });
  } catch (error) {
    if (error instanceof JsonByteLengthError && error.code === "payload-limit") return null;
    throw error;
  }
}
