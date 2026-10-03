import { inflateSync } from "fflate";
import type { DocumentOp, PackedCellBlock } from "./types/document.js";

export const MAX_RESTORE_BLOCK_DECODED_BYTES = 64 * 1024 * 1024;
export const MAX_RESTORE_BLOCK_CELLS = 4_000_000;
type RestoreBlock = Extract<DocumentOp, { op: "restoreBlock" }>;

function invalid(): never {
  throw new Error("Invalid restore block");
}

/** Decode bounded JSON; callers must validate the packed cell fields before use. */
export function decodeRestoreBlockPayload(operation: RestoreBlock): PackedCellBlock {
  if (
    operation.encoding !== "deflate-json-v1" ||
    !Number.isSafeInteger(operation.decodedBytes) ||
    operation.decodedBytes <= 0 ||
    operation.decodedBytes > MAX_RESTORE_BLOCK_DECODED_BYTES ||
    typeof operation.data !== "string" ||
    operation.data.length === 0 ||
    operation.data.length > 4 * Math.ceil((MAX_RESTORE_BLOCK_DECODED_BYTES + 65536) / 3) ||
    operation.data.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(operation.data)
  )
    invalid();
  const binary = atob(operation.data);
  if (btoa(binary) !== operation.data) invalid();
  const compressed = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  // fflate's fixed output buffer does not report truncation. Independently walk
  // the stream first, checking its exact expansion without allocating output.
  inspectDeflate(compressed, operation.decodedBytes);
  const bytes = inflateSync(compressed, { out: new Uint8Array(operation.decodedBytes) });
  if (bytes.length !== operation.decodedBytes) invalid();
  const block = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  ) as PackedCellBlock;
  if (!block || typeof block !== "object") invalid();
  if (block.rowCount > Math.floor(MAX_RESTORE_BLOCK_CELLS / block.colCount)) {
    throw new RangeError("Restore block exceeds the cell limit");
  }
  if (
    block.rowCount !== Math.abs(operation.range.end.row - operation.range.start.row) + 1 ||
    block.colCount !== Math.abs(operation.range.end.col - operation.range.start.col) + 1 ||
    (block.styleIds !== undefined && block.styleTable === undefined)
  )
    invalid();
  return block;
}

type Huffman = { codes: Map<number, number>[]; max: number };
function huffman(lengths: readonly number[], allowSingleOrEmpty = false): Huffman {
  const counts = new Array<number>(16).fill(0);
  for (const length of lengths) {
    if (length < 0 || length > 15) invalid();
    if (length) counts[length] = (counts[length] ?? 0) + 1;
  }
  const next = new Array<number>(16).fill(0);
  let left = 1;
  for (let length = 1; length <= 15; length++) {
    left = left * 2 - (counts[length] ?? 0);
    if (left < 0) invalid();
    next[length] = ((next[length - 1] ?? 0) + (counts[length - 1] ?? 0)) * 2;
  }
  const codes = Array.from({ length: 16 }, () => new Map<number, number>());
  let max = 0;
  lengths.forEach((length, symbol) => {
    if (!length) return;
    max = Math.max(max, length);
    const level = codes[length];
    const code = next[length];
    if (!level || code === undefined) invalid();
    level.set(code, symbol);
    next[length] = code + 1;
  });
  if (left !== 0 && !(allowSingleOrEmpty && max <= 1)) invalid();
  return { codes, max };
}

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_BITS = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DISTANCE_BITS = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const CODE_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
const FIXED_LITERAL = huffman(
  Array.from({ length: 288 }, (_, i) => (i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8)),
);
const FIXED_DISTANCE = huffman(new Array<number>(32).fill(5));

// RFC 1951 Huffman symbols are read most-significant-bit first, whereas other
// fields are little-endian. Tracking output length validates back-reference
// distances without retaining decompressed bytes.
function inspectDeflate(data: Uint8Array, expected: number): void {
  let bit = 0;
  let output = 0;
  const bits = (count: number): number => {
    if (bit + count > data.length * 8) invalid();
    let value = 0;
    for (let i = 0; i < count; i++, bit++)
      value |= (((data[bit >>> 3] ?? 0) >>> (bit & 7)) & 1) << i;
    return value;
  };
  const symbol = (tree: Huffman): number => {
    let code = 0;
    for (let length = 1; length <= tree.max; length++) {
      code = code * 2 + bits(1);
      const result = tree.codes[length]?.get(code);
      if (result !== undefined) return result;
    }
    return invalid();
  };
  const add = (count: number): void => {
    output += count;
    if (output > expected || output > MAX_RESTORE_BLOCK_DECODED_BYTES) invalid();
  };
  let final = false;
  do {
    final = bits(1) === 1;
    const kind = bits(2);
    if (kind === 0) {
      bit = Math.ceil(bit / 8) * 8;
      const length = bits(16);
      if ((length ^ bits(16)) !== 65535) invalid();
      add(length);
      if (bit + length * 8 > data.length * 8) invalid();
      bit += length * 8;
      continue;
    }
    if (kind === 3) invalid();
    let literal = FIXED_LITERAL;
    let distance = FIXED_DISTANCE;
    if (kind === 2) {
      const literals = bits(5) + 257;
      const distances = bits(5) + 1;
      if (literals > 286) invalid();
      const count = bits(4) + 4;
      const lengths = new Array<number>(19).fill(0);
      for (let i = 0; i < count; i++) {
        const index = CODE_ORDER[i];
        if (index === undefined) invalid();
        lengths[index] = bits(3);
      }
      const tree = huffman(lengths);
      const all: number[] = [];
      while (all.length < literals + distances) {
        const value = symbol(tree);
        if (value < 16) all.push(value);
        else {
          if (value === 16 && all.length === 0) invalid();
          const repeat = value === 16 ? bits(2) + 3 : value === 17 ? bits(3) + 3 : bits(7) + 11;
          const length = value === 16 ? (all[all.length - 1] ?? invalid()) : 0;
          if (all.length + repeat > literals + distances) invalid();
          for (let i = 0; i < repeat; i++) all.push(length);
        }
      }
      if (all[256] === 0) invalid();
      literal = huffman(all.slice(0, literals), true);
      distance = huffman(all.slice(literals), true);
    }
    for (;;) {
      const value = symbol(literal);
      if (value < 256) add(1);
      else if (value === 256) break;
      else {
        if (value > 285) invalid();
        const index = value - 257;
        const length = (LENGTH_BASE[index] ?? invalid()) + bits(LENGTH_BITS[index] ?? invalid());
        const dist = symbol(distance);
        if (dist > 29) invalid();
        if ((DISTANCE_BASE[dist] ?? invalid()) + bits(DISTANCE_BITS[dist] ?? invalid()) > output)
          invalid();
        add(length);
      }
    }
  } while (!final);
  if (Math.ceil(bit / 8) !== data.length || output !== expected) invalid();
}
