// Row geometry keeps only the rows whose height differs from the default.
// The resized rows split the sheet into segments: a run of default rows that
// ends in one resized row, then a tail of default rows. A Fenwick tree over the
// segment heights gives offsets, row lookups and height changes of resized rows
// in O(log k), k being the resized rows. Resizing a default row, or giving a
// row the default height back, shifts the sorted arrays and rebuilds the tree
// in O(k). A sheet without resized rows allocates nothing.

const NO_ROWS = new Int32Array(0);
const NO_HEIGHTS = new Float64Array(0);
/** Smallest capacity the resized-row arrays grow to. */
const MIN_CAPACITY = 4;

export class OffsetIndex {
  private readonly n: number;
  private readonly defaultHeight: number;
  /** Resized rows in ascending order; the first `size` entries are in use. */
  private rows = NO_ROWS;
  /** Height of each resized row, parallel to `rows`. */
  private heights = NO_HEIGHTS;
  /** 1-indexed Fenwick tree of segment heights; segment `i` ends at `rows[i]`. */
  private tree = NO_HEIGHTS;
  private size = 0;
  private total: number;

  constructor(count: number, defaultHeight: number) {
    this.n = count;
    this.defaultHeight = defaultHeight;
    this.total = count * defaultHeight;
  }

  get count(): number {
    return this.n;
  }

  get totalHeight(): number {
    return this.total;
  }

  /** Bytes reserved by the resized-row arrays and their tree. */
  get backingStoreBytes(): number {
    return this.rows.byteLength + this.heights.byteLength + this.tree.byteLength;
  }

  heightOf(row: number): number {
    const index = this.lowerBound(row);
    return index < this.size && this.rows[index] === row
      ? (this.heights[index] ?? this.defaultHeight)
      : this.defaultHeight;
  }

  setHeight(row: number, h: number): void {
    if (!Number.isInteger(row) || row < 0 || row >= this.n) return;
    const index = this.lowerBound(row);
    const resized = index < this.size && this.rows[index] === row;
    const current = resized ? (this.heights[index] ?? this.defaultHeight) : this.defaultHeight;
    const delta = h - current;
    if (delta === 0) return;
    if (!resized) {
      this.insertAt(index, row, h);
    } else if (h === this.defaultHeight) {
      this.removeAt(index);
    } else {
      this.heights[index] = h;
      this.total += delta;
      for (let i = index + 1; i <= this.size; i += i & -i) {
        this.tree[i] = (this.tree[i] ?? 0) + delta;
      }
    }
  }

  /**
   * Set the heights of `rows` in one O(k + m) merge with the resized rows.
   * `rows` must be ascending, distinct and inside the index.
   */
  setHeights(rows: ArrayLike<number>, heights: ArrayLike<number>): void {
    const count = rows.length;
    if (count === 0) return;
    if (count === 1) {
      this.setHeight(rows[0] ?? -1, heights[0] ?? this.defaultHeight);
      return;
    }
    const capacity = this.size + count;
    const nextRows = new Int32Array(capacity);
    const nextHeights = new Float64Array(capacity);
    let size = 0;
    let kept = 0;
    for (let update = 0; update < count; update++) {
      const row = rows[update] ?? 0;
      while (kept < this.size && (this.rows[kept] ?? 0) < row) {
        nextRows[size] = this.rows[kept] ?? 0;
        nextHeights[size] = this.heights[kept] ?? 0;
        size++;
        kept++;
      }
      if (kept < this.size && this.rows[kept] === row) kept++;
      const height = heights[update] ?? this.defaultHeight;
      if (height !== this.defaultHeight) {
        nextRows[size] = row;
        nextHeights[size] = height;
        size++;
      }
    }
    for (; kept < this.size; kept++) {
      nextRows[size] = this.rows[kept] ?? 0;
      nextHeights[size] = this.heights[kept] ?? 0;
      size++;
    }
    if (size === 0) {
      this.release();
      return;
    }
    this.rows = nextRows;
    this.heights = nextHeights;
    this.tree = new Float64Array(capacity + 1);
    this.size = size;
    this.rebuildTree();
  }

  /** Sum of heights of rows [0, row); i.e. the top Y of `row`. */
  offsetOf(row: number): number {
    const r = Math.max(0, Math.min(row, this.n));
    if (this.size === 0) return r * this.defaultHeight;
    const index = this.lowerBound(r);
    return this.prefix(index) + (r - this.segmentStart(index)) * this.defaultHeight;
  }

  /**
   * Row whose band contains content-space `offset`, with that row's top Y.
   * Clamps to the last row when `offset` is past the end.
   */
  rowAtOffset(offset: number): { row: number; top: number } {
    if (this.n === 0) return { row: 0, top: 0 };
    if (offset <= 0) return { row: 0, top: 0 };
    if (offset >= this.total) {
      const last = this.n - 1;
      return { row: last, top: this.offsetOf(last) };
    }
    const defaultHeight = this.defaultHeight;
    if (this.size === 0) {
      const row = Math.floor(offset / defaultHeight);
      return { row, top: row * defaultHeight };
    }
    // Largest segment count whose segments all end at or before `offset`.
    let index = 0;
    let remaining = offset;
    for (let step = 1 << (31 - Math.clz32(this.size)); step > 0; step >>= 1) {
      const next = index + step;
      if (next <= this.size && (this.tree[next] ?? 0) <= remaining) {
        index = next;
        remaining -= this.tree[next] ?? 0;
      }
    }
    // `offset` is inside segment `index`: in its default run or on its resized row.
    const start = this.segmentStart(index);
    const end = index < this.size ? (this.rows[index] ?? this.n) : this.n;
    const segmentTop = offset - remaining;
    const defaultRows = Math.floor(remaining / defaultHeight);
    if (defaultRows < end - start) {
      return { row: start + defaultRows, top: segmentTop + defaultRows * defaultHeight };
    }
    if (index < this.size) return { row: end, top: segmentTop + (end - start) * defaultHeight };
    const last = this.n - 1;
    return { row: last, top: this.offsetOf(last) };
  }

  /** Resized rows before `row`, which is also the segment that holds `row`. */
  private lowerBound(row: number): number {
    let lo = 0;
    let hi = this.size;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((this.rows[mid] ?? 0) < row) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** First row of segment `index`. */
  private segmentStart(index: number): number {
    return index === 0 ? 0 : (this.rows[index - 1] ?? -1) + 1;
  }

  /** Height of the first `segments` segments. */
  private prefix(segments: number): number {
    let sum = 0;
    for (let i = segments; i > 0; i -= i & -i) sum += this.tree[i] ?? 0;
    return sum;
  }

  private insertAt(index: number, row: number, h: number): void {
    if (this.size === this.rows.length) {
      const capacity = Math.max(MIN_CAPACITY, this.size * 2);
      const rows = new Int32Array(capacity);
      const heights = new Float64Array(capacity);
      rows.set(this.rows.subarray(0, this.size));
      heights.set(this.heights.subarray(0, this.size));
      this.rows = rows;
      this.heights = heights;
      this.tree = new Float64Array(capacity + 1);
    }
    this.rows.copyWithin(index + 1, index, this.size);
    this.heights.copyWithin(index + 1, index, this.size);
    this.rows[index] = row;
    this.heights[index] = h;
    this.size++;
    this.rebuildTree();
  }

  private removeAt(index: number): void {
    if (this.size === 1) {
      this.release();
      return;
    }
    this.rows.copyWithin(index, index + 1, this.size);
    this.heights.copyWithin(index, index + 1, this.size);
    this.size--;
    this.rebuildTree();
  }

  /** Back to the arithmetic default geometry. */
  private release(): void {
    this.rows = NO_ROWS;
    this.heights = NO_HEIGHTS;
    this.tree = NO_HEIGHTS;
    this.size = 0;
    this.total = this.n * this.defaultHeight;
  }

  /** O(k) Fenwick construction from `rows` and `heights`; also refreshes `total`. */
  private rebuildTree(): void {
    const tree = this.tree;
    const size = this.size;
    const defaultHeight = this.defaultHeight;
    tree.fill(0, 0, size + 1);
    let total = 0;
    let start = 0;
    for (let i = 1; i <= size; i++) {
      const row = this.rows[i - 1] ?? 0;
      const segment = (row - start) * defaultHeight + (this.heights[i - 1] ?? 0);
      start = row + 1;
      total += segment;
      tree[i] = (tree[i] ?? 0) + segment;
      const parent = i + (i & -i);
      if (parent <= size) tree[parent] = (tree[parent] ?? 0) + (tree[i] ?? 0);
    }
    this.total = total + (this.n - start) * defaultHeight;
  }
}

/**
 * Browsers cap element height (~33.5M px in Chrome). Above that the DOM sizer is
 * pinned to `cap` and a capped scroll position is mapped linearly onto the real
 * virtual range. Below the cap the mapping is identity.
 */
export class ScaledScroll {
  constructor(
    private totalHeight: number,
    private viewport: number,
    private cap: number,
  ) {}

  update(totalHeight: number, viewport: number, cap = this.cap): void {
    this.totalHeight = totalHeight;
    this.viewport = viewport;
    this.cap = cap;
  }

  get scaled(): boolean {
    return this.totalHeight > this.cap;
  }

  /** Height to give the DOM sizer element. */
  get sizerHeight(): number {
    return Math.min(this.totalHeight, this.cap);
  }

  /** DOM scrollTop -> content-space offset. */
  toContent(scrollTop: number): number {
    if (!this.scaled) return scrollTop;
    const scrollRange = this.cap - this.viewport;
    const contentRange = this.totalHeight - this.viewport;
    if (scrollRange <= 0) return 0;
    return (scrollTop / scrollRange) * contentRange;
  }

  /** Content-space offset -> DOM scrollTop. */
  toScroll(contentOffset: number): number {
    if (!this.scaled) return contentOffset;
    const scrollRange = this.cap - this.viewport;
    const contentRange = this.totalHeight - this.viewport;
    if (contentRange <= 0) return 0;
    return (contentOffset / contentRange) * scrollRange;
  }
}
