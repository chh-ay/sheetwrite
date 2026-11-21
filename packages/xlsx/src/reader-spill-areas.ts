import type { CellRect } from "./cell-reference.js";

/** One more than the last column an A1 reference names (`ZZZ`), which bounds the column index. */
const A1_COLUMNS = 18_278;
const WORD_BITS = 32;
const LAST_BIT = WORD_BITS - 1;

/** The highest set bit of `word` at or below bit `bit`, or -1. */
function highestBitAtOrBelow(word: number, bit: number): number {
  const masked = word & (0xffff_ffff >>> (LAST_BIT - bit));
  return masked === 0 ? -1 : LAST_BIT - Math.clz32(masked);
}

/** The highest set bit at or below `index` in the bitset `words`, scanning word by word, or -1. */
function previousBit(words: Uint32Array, index: number): number {
  let word = index >>> 5;
  let found = highestBitAtOrBelow(words[word] ?? 0, index & LAST_BIT);
  while (found < 0 && word > 0) {
    word -= 1;
    found = highestBitAtOrBelow(words[word] ?? 0, LAST_BIT);
  }
  return found < 0 ? -1 : word * WORD_BITS + found;
}

/**
 * The areas of the dynamic arrays a worksheet read has met that reach the
 * row being read, so the values Excel saved in their covered cells can be
 * dropped. Every area starts at its formula's cell and none overlap, so the
 * areas that reach one row have disjoint columns. Their first columns sit
 * in a two-level bitset, so a cell finds the area to its left, and an area
 * is added, in a bounded number of word reads; areas leave through a heap
 * on their last row. No file makes one cell's check scan the other areas.
 */
export class SpillAreas {
  /** Each active area, at its first column. */
  readonly #byStart: (CellRect | undefined)[] = [];
  /** Bit `c` is set when an active area starts at column `c`. */
  readonly #starts: Uint32Array;
  /** Bit `w` is set when word `w` of `#starts` is not zero. */
  readonly #words: Uint32Array;
  /** The last column `#starts` can hold. */
  readonly #lastColumn: number;
  /** Active areas as a binary min-heap on their last row. */
  readonly #ends: CellRect[] = [];

  /** Areas within `columns` columns. */
  constructor(columns: number) {
    const capacity = Math.min(columns, A1_COLUMNS);
    const words = Math.ceil(capacity / WORD_BITS);
    this.#starts = new Uint32Array(words);
    this.#words = new Uint32Array(Math.ceil(words / WORD_BITS));
    this.#lastColumn = capacity - 1;
  }

  /** Drop the areas that end above `row`. */
  expire(row: number): void {
    for (let top = this.#ends[0]; top !== undefined && top.r1 < row; top = this.#ends[0]) {
      this.#pop();
      if (this.#byStart[top.c0] === top) {
        this.#byStart[top.c0] = undefined;
        this.#clear(top.c0);
      }
    }
  }

  /** Whether an active area covers the cell at `row`, `col`, other than its formula's own cell. */
  covers(row: number, col: number): boolean {
    const area = this.#areaAtOrBefore(col);
    return (
      area !== undefined &&
      col <= area.c1 &&
      row >= area.r0 &&
      row <= area.r1 &&
      (row > area.r0 || col > area.c0)
    );
  }

  /**
   * Add the area of a formula in the row being read; it starts at the
   * formula's cell. False, and the area stays out, when it overlaps an
   * active area.
   */
  add(area: CellRect): boolean {
    const before = this.#areaAtOrBefore(area.c1);
    if (before !== undefined && before.c1 >= area.c0) return false;
    this.#byStart[area.c0] = area;
    this.#set(area.c0);
    this.#push(area);
    return true;
  }

  /** The active area that starts last at or before `col`. */
  #areaAtOrBefore(col: number): CellRect | undefined {
    const column = Math.min(col, this.#lastColumn);
    const word = column >>> 5;
    const own = highestBitAtOrBelow(this.#starts[word] ?? 0, column & LAST_BIT);
    if (own >= 0) return this.#byStart[word * WORD_BITS + own];
    const previous = word === 0 ? -1 : previousBit(this.#words, word - 1);
    if (previous < 0) return undefined;
    const bit = highestBitAtOrBelow(this.#starts[previous] ?? 0, LAST_BIT);
    return this.#byStart[previous * WORD_BITS + bit];
  }

  #set(col: number): void {
    const word = col >>> 5;
    this.#starts[word] = (this.#starts[word] ?? 0) | (1 << (col & LAST_BIT));
    const summary = word >>> 5;
    this.#words[summary] = (this.#words[summary] ?? 0) | (1 << (word & LAST_BIT));
  }

  #clear(col: number): void {
    const word = col >>> 5;
    const remaining = (this.#starts[word] ?? 0) & ~(1 << (col & LAST_BIT));
    this.#starts[word] = remaining;
    if (remaining !== 0) return;
    const summary = word >>> 5;
    this.#words[summary] = (this.#words[summary] ?? 0) & ~(1 << (word & LAST_BIT));
  }

  #push(area: CellRect): void {
    const ends = this.#ends;
    let index = ends.length;
    ends.push(area);
    while (index > 0) {
      const parent = (index - 1) >>> 1;
      const above = ends[parent];
      if (above === undefined || above.r1 <= area.r1) break;
      ends[index] = above;
      index = parent;
    }
    ends[index] = area;
  }

  /** Remove the area that ends first. */
  #pop(): void {
    const ends = this.#ends;
    const last = ends.pop();
    if (last === undefined || ends.length === 0) return;
    let index = 0;
    for (;;) {
      const left = ends[index * 2 + 1];
      const right = ends[index * 2 + 2];
      const childIndex = right !== undefined && left !== undefined && right.r1 < left.r1 ? 2 : 1;
      const child = ends[index * 2 + childIndex];
      if (child === undefined || child.r1 >= last.r1) break;
      ends[index] = child;
      index = index * 2 + childIndex;
    }
    ends[index] = last;
  }
}
