// Row geometry keeps only the rows whose height differs from the default.
// The resized rows split the sheet into segments: a run of default rows that
// ends in one resized row, then a tail of default rows. A Fenwick tree over the
// segment heights gives offsets, row lookups and height changes of resized rows
// in O(log k), k being the resized rows. Resizing a default row, or giving a
// row the default height back, is queued in O(1); the next offset or lookup
// merges the queue into the sorted rows in O(k + m log m) for m queued rows, so
// a run of single-row changes between two reads costs one merge. A sheet
// without resized rows allocates nothing.

const NO_ROWS = new Int32Array(0);
const NO_HEIGHTS = new Float64Array(0);
/** Smallest capacity the resized-row arrays grow to. */
const MIN_CAPACITY = 4;

export class OffsetIndex {
  private readonly n: number;
  private readonly default_height: number;
  /** Resized rows in ascending order; the first `size` entries are in use. */
  private rows = NO_ROWS;
  /** Height of each resized row, parallel to `rows`. */
  private heights = NO_HEIGHTS;
  /** 1-indexed Fenwick tree of segment heights; segment `i` ends at `rows[i]`. */
  private tree = NO_HEIGHTS;
  private size = 0;
  /** Heights not merged into `rows` yet: new resized rows and rows back at the default. */
  private queued: Map<number, number> | undefined;
  /** Sum of every height, queued ones included. */
  private total: number;

  constructor(count: number, defaultHeight: number) {
    this.n = count;
    this.default_height = defaultHeight;
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
    this.merge();
    return this.rows.byteLength + this.heights.byteLength + this.tree.byteLength;
  }

  heightOf(row: number): number {
    return this.queued?.get(row) ?? this.stored_height(row);
  }

  setHeight(row: number, h: number): void {
    if (!Number.isInteger(row) || row < 0 || row >= this.n) return;
    const queued = this.queued?.get(row);
    if (queued !== undefined) {
      if (h === queued) return;
      this.total += h - queued;
      this.queued?.set(row, h);
      return;
    }
    const index = this.lower_bound(row);
    const resized = index < this.size && this.rows[index] === row;
    const current = resized ? (this.heights[index] ?? this.default_height) : this.default_height;
    const delta = h - current;
    if (delta === 0) return;
    this.total += delta;
    if (resized && h !== this.default_height) {
      this.heights[index] = h;
      for (let i = index + 1; i <= this.size; i += i & -i) {
        this.tree[i] = (this.tree[i] ?? 0) + delta;
      }
      return;
    }
    (this.queued ??= new Map()).set(row, h);
  }

  /**
   * Set the heights of `rows` in one O(k + m) merge with the resized rows.
   * `rows` must be ascending, distinct and inside the index.
   */
  setHeights(rows: ArrayLike<number>, heights: ArrayLike<number>): void {
    if (rows.length === 0) return;
    if (rows.length === 1) {
      this.setHeight(rows[0] ?? -1, heights[0] ?? this.default_height);
      return;
    }
    this.merge();
    this.merge_sorted(rows, heights);
  }

  /**
   * Give an index without resized rows the heights of `rows`, which must be
   * ascending, distinct and inside the index. The index keeps both arrays.
   */
  load(rows: Int32Array<ArrayBuffer>, heights: Float64Array<ArrayBuffer>): void {
    if (this.size > 0 || (this.queued?.size ?? 0) > 0) {
      this.setHeights(rows, heights);
      return;
    }
    let size = 0;
    for (let position = 0; position < rows.length; position++) {
      const height = heights[position] ?? this.default_height;
      if (height === this.default_height) continue;
      rows[size] = rows[position] ?? 0;
      heights[size] = height;
      size++;
    }
    if (size === 0) return;
    this.rows = rows;
    this.heights = heights;
    this.tree = new Float64Array(rows.length + 1);
    this.size = size;
    this.rebuild_tree();
  }

  /** Sum of heights of rows [0, row); i.e. the top Y of `row`. */
  offsetOf(row: number): number {
    this.merge();
    const r = Math.max(0, Math.min(row, this.n));
    if (this.size === 0) return r * this.default_height;
    const index = this.lower_bound(r);
    return this.prefix(index) + (r - this.segment_start(index)) * this.default_height;
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
    this.merge();
    const default_height = this.default_height;
    if (this.size === 0) {
      const row = Math.floor(offset / default_height);
      return { row, top: row * default_height };
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
    const start = this.segment_start(index);
    const end = index < this.size ? (this.rows[index] ?? this.n) : this.n;
    const segment_top = offset - remaining;
    const default_rows = Math.floor(remaining / default_height);
    if (default_rows < end - start) {
      return { row: start + default_rows, top: segment_top + default_rows * default_height };
    }
    if (index < this.size) return { row: end, top: segment_top + (end - start) * default_height };
    const last = this.n - 1;
    return { row: last, top: this.offsetOf(last) };
  }

  /** Height of `row` in the sorted rows, ignoring queued changes. */
  private stored_height(row: number): number {
    const index = this.lower_bound(row);
    return index < this.size && this.rows[index] === row
      ? (this.heights[index] ?? this.default_height)
      : this.default_height;
  }

  /** Merge queued heights into the sorted rows and rebuild the tree. */
  private merge(): void {
    const queued = this.queued;
    if (queued === undefined || queued.size === 0) return;
    if (queued.size === 1) {
      for (const [row, h] of queued) {
        queued.clear();
        this.merge_one(row, h);
      }
      return;
    }
    const rows = Int32Array.from(queued.keys()).sort();
    const heights = new Float64Array(rows.length);
    for (let position = 0; position < rows.length; position++) {
      heights[position] = queued.get(rows[position] ?? 0) ?? this.default_height;
    }
    queued.clear();
    this.merge_sorted(rows, heights);
  }

  /** One queued row, in place: no new arrays unless they must grow. */
  private merge_one(row: number, h: number): void {
    const index = this.lower_bound(row);
    const resized = index < this.size && this.rows[index] === row;
    if (!resized) {
      if (h !== this.default_height) this.insert_at(index, row, h);
    } else if (h === this.default_height) {
      this.remove_at(index);
    } else {
      this.heights[index] = h;
      this.rebuild_tree();
    }
  }

  /** Merge ascending, distinct `rows` into the sorted rows in O(k + m). */
  private merge_sorted(rows: ArrayLike<number>, heights: ArrayLike<number>): void {
    const count = rows.length;
    const capacity = this.size + count;
    const next_rows = new Int32Array(capacity);
    const next_heights = new Float64Array(capacity);
    let size = 0;
    let kept = 0;
    for (let update = 0; update < count; update++) {
      const row = rows[update] ?? 0;
      while (kept < this.size && (this.rows[kept] ?? 0) < row) {
        next_rows[size] = this.rows[kept] ?? 0;
        next_heights[size] = this.heights[kept] ?? 0;
        size++;
        kept++;
      }
      if (kept < this.size && this.rows[kept] === row) kept++;
      const height = heights[update] ?? this.default_height;
      if (height !== this.default_height) {
        next_rows[size] = row;
        next_heights[size] = height;
        size++;
      }
    }
    for (; kept < this.size; kept++) {
      next_rows[size] = this.rows[kept] ?? 0;
      next_heights[size] = this.heights[kept] ?? 0;
      size++;
    }
    if (size === 0) {
      this.release();
      return;
    }
    this.rows = next_rows;
    this.heights = next_heights;
    this.tree = new Float64Array(capacity + 1);
    this.size = size;
    this.rebuild_tree();
  }

  /** Resized rows before `row`, which is also the segment that holds `row`. */
  private lower_bound(row: number): number {
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
  private segment_start(index: number): number {
    return index === 0 ? 0 : (this.rows[index - 1] ?? -1) + 1;
  }

  /** Height of the first `segments` segments. */
  private prefix(segments: number): number {
    let sum = 0;
    for (let i = segments; i > 0; i -= i & -i) sum += this.tree[i] ?? 0;
    return sum;
  }

  private insert_at(index: number, row: number, h: number): void {
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
    this.rebuild_tree();
  }

  private remove_at(index: number): void {
    if (this.size === 1) {
      this.release();
      return;
    }
    this.rows.copyWithin(index, index + 1, this.size);
    this.heights.copyWithin(index, index + 1, this.size);
    this.size--;
    this.rebuild_tree();
  }

  /** Back to the arithmetic default geometry. */
  private release(): void {
    this.rows = NO_ROWS;
    this.heights = NO_HEIGHTS;
    this.tree = NO_HEIGHTS;
    this.size = 0;
    this.total = this.n * this.default_height;
  }

  /** O(k) Fenwick construction from `rows` and `heights`; also refreshes `total`. */
  private rebuild_tree(): void {
    const tree = this.tree;
    const size = this.size;
    const default_height = this.default_height;
    tree.fill(0, 0, size + 1);
    let total = 0;
    let start = 0;
    for (let i = 1; i <= size; i++) {
      const row = this.rows[i - 1] ?? 0;
      const segment = (row - start) * default_height + (this.heights[i - 1] ?? 0);
      start = row + 1;
      total += segment;
      tree[i] = (tree[i] ?? 0) + segment;
      const parent = i + (i & -i);
      if (parent <= size) tree[parent] = (tree[parent] ?? 0) + (tree[i] ?? 0);
    }
    this.total = total + (this.n - start) * default_height;
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
    const scroll_range = this.cap - this.viewport;
    const content_range = this.totalHeight - this.viewport;
    if (scroll_range <= 0) return 0;
    return (scrollTop / scroll_range) * content_range;
  }

  /** Content-space offset -> DOM scrollTop. */
  toScroll(contentOffset: number): number {
    if (!this.scaled) return contentOffset;
    const scroll_range = this.cap - this.viewport;
    const content_range = this.totalHeight - this.viewport;
    if (content_range <= 0) return 0;
    return (contentOffset / content_range) * scroll_range;
  }
}
