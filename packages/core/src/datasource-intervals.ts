/** Half-open row interval shared by coverage, request ownership, and wait samples. */
export interface RowBand {
  start: number;
  end: number;
}

/** Sorted, disjoint half-open intervals. */
export class SparseIntervals {
  private readonly bands: RowBand[] = [];

  get bandCount(): number {
    return this.bands.length;
  }

  get length(): number {
    let length = 0;
    for (const band of this.bands) length += band.end - band.start;
    return length;
  }

  first(): RowBand | undefined {
    return this.bands[0];
  }

  clear(): void {
    this.bands.length = 0;
  }

  atOrAfter(row: number): RowBand | undefined {
    return bandAtOrAfter(this.bands, row);
  }

  covers(start: number, end: number): boolean {
    if (start >= end) return true;
    const band = this.atOrAfter(start);
    return band !== undefined && band.start <= start && band.end >= end;
  }

  intersects(start: number, end: number): boolean {
    const band = this.atOrAfter(start);
    return band !== undefined && band.start < end;
  }

  intersections(start: number, end: number): RowBand[] {
    const result: RowBand[] = [];
    let band = this.atOrAfter(start);

    while (band && band.start < end) {
      result.push({ start: Math.max(start, band.start), end: Math.min(end, band.end) });
      band = this.atOrAfter(band.end);
    }

    return result;
  }

  add(start: number, end: number): void {
    if (start >= end) return;

    let index = 0;
    while (
      index < this.bands.length &&
      (this.bands[index]?.end ?? Number.POSITIVE_INFINITY) < start
    )
      index += 1;

    let nextStart = start;
    let nextEnd = end;
    const first = index;

    while (
      index < this.bands.length &&
      (this.bands[index]?.start ?? Number.POSITIVE_INFINITY) <= nextEnd
    ) {
      const band = this.bands[index];
      if (!band) break;
      nextStart = Math.min(nextStart, band.start);
      nextEnd = Math.max(nextEnd, band.end);
      index += 1;
    }

    this.bands.splice(first, index - first, { start: nextStart, end: nextEnd });
  }

  remove(start: number, end: number): void {
    if (start >= end) return;

    const next: RowBand[] = [];

    for (const band of this.bands) {
      if (band.end <= start || band.start >= end) {
        next.push(band);
        continue;
      }

      if (band.start < start) next.push({ start: band.start, end: start });
      if (band.end > end) next.push({ start: end, end: band.end });
    }

    this.bands.splice(0, this.bands.length, ...next);
  }

  forEachGap(start: number, end: number, visit: (start: number, end: number) => void): void {
    let cursor = start;
    let band = this.atOrAfter(start);

    while (cursor < end) {
      if (!band || band.start >= end) {
        visit(cursor, end);
        return;
      }

      if (band.start > cursor) visit(cursor, Math.min(end, band.start));
      cursor = Math.max(cursor, band.end);
      band = this.atOrAfter(cursor);
    }
  }
}

/** Per-physical-column row coverage; empty column metadata is removed eagerly. */
export class SparseColumnIntervals {
  private readonly columns = new Map<number, SparseIntervals>();

  get bandCount(): number {
    let count = 0;
    for (const rows of this.columns.values()) count += rows.bandCount;
    return count;
  }

  get columnCount(): number {
    return this.columns.size;
  }

  clear(): void {
    this.columns.clear();
  }

  rows(column: number): SparseIntervals | undefined {
    return this.columns.get(column);
  }

  add(columns: readonly number[], start: number, end: number): void {
    if (start >= end) return;

    for (const column of columns) {
      let rows = this.columns.get(column);

      if (!rows) {
        rows = new SparseIntervals();
        this.columns.set(column, rows);
      }

      rows.add(start, end);
    }
  }

  remove(columns: readonly number[], start: number, end: number): void {
    for (const column of columns) this.removeColumn(column, start, end);
  }

  removeColumn(column: number, start: number, end: number): void {
    const rows = this.columns.get(column);
    if (!rows) return;
    rows.remove(start, end);
    if (rows.bandCount === 0) this.columns.delete(column);
  }

  covers(start: number, end: number, columns: readonly number[]): boolean {
    for (const column of columns) {
      if (!this.columns.get(column)?.covers(start, end)) return false;
    }
    return true;
  }

  firstRectangle(): { start: number; end: number; columns: number[] } | null {
    const firstColumn = [...this.columns.keys()].sort((a, b) => a - b)[0];
    if (firstColumn === undefined) return null;

    const band = this.columns.get(firstColumn)?.first();
    if (!band) return null;

    const columns: number[] = [];

    for (const [column, rows] of this.columns) {
      if (rows.covers(band.start, band.end)) columns.push(column);
    }

    columns.sort((a, b) => a - b);

    return { start: band.start, end: band.end, columns };
  }
}

interface OwnerBand extends RowBand {
  owner: number;
}

class SparseOwnerIntervals {
  private readonly bands: OwnerBand[] = [];

  get bandCount(): number {
    return this.bands.length;
  }

  atOrAfter(row: number): OwnerBand | undefined {
    return bandAtOrAfter(this.bands, row);
  }

  intersects(start: number, end: number): boolean {
    const band = this.atOrAfter(start);
    return band !== undefined && band.start < end;
  }

  forEachGap(start: number, end: number, visit: (start: number, end: number) => void): void {
    let cursor = start;
    let band = this.atOrAfter(start);

    while (cursor < end) {
      if (!band || band.start >= end) {
        visit(cursor, end);
        return;
      }

      if (band.start > cursor) visit(cursor, Math.min(end, band.start));
      cursor = Math.max(cursor, band.end);
      band = this.atOrAfter(cursor);
    }
  }

  add(start: number, end: number, owner: number): void {
    if (start >= end) return;
    const index = this.bands.findIndex((band) => band.start >= start);
    const insertAt = index < 0 ? this.bands.length : index;
    const previous = this.bands[insertAt - 1];
    const next = this.bands[insertAt];
    if ((previous && previous.end > start) || (next && next.start < end)) {
      throw new Error("Overlapping datasource request ownership");
    }

    this.bands.splice(insertAt, 0, { start, end, owner });
  }

  removeOwner(owner: number): void {
    for (let index = this.bands.length - 1; index >= 0; index -= 1) {
      if (this.bands[index]?.owner === owner) this.bands.splice(index, 1);
    }
  }
}

/** Sparse request ownership indexed only by columns with active work. */
export class SparseColumnOwners {
  private readonly columns = new Map<number, SparseOwnerIntervals>();

  get bandCount(): number {
    let count = 0;
    for (const rows of this.columns.values()) count += rows.bandCount;
    return count;
  }

  get columnCount(): number {
    return this.columns.size;
  }

  clear(): void {
    this.columns.clear();
  }

  rows(column: number): SparseOwnerIntervals | undefined {
    return this.columns.get(column);
  }

  add(columns: readonly number[], start: number, end: number, owner: number): void {
    for (const column of columns) {
      let rows = this.columns.get(column);

      if (!rows) {
        rows = new SparseOwnerIntervals();
        this.columns.set(column, rows);
      }

      rows.add(start, end, owner);
    }
  }

  remove(owner: number, columns: readonly number[]): void {
    for (const column of columns) {
      const rows = this.columns.get(column);
      if (!rows) continue;

      rows.removeOwner(owner);
      if (rows.bandCount === 0) this.columns.delete(column);
    }
  }
}

interface VisibleWaitBand extends RowBand {
  startedAt: number;
}

/** Completed visible demand weighted by the number of rows it covered. */
export interface VisibleWaitSample {
  duration: number;
  rows: number;
}

class SparseVisibleWaits {
  private readonly bands: VisibleWaitBand[] = [];

  get bandCount(): number {
    return this.bands.length;
  }

  get rowCount(): number {
    let count = 0;
    for (const band of this.bands) count += band.end - band.start;
    return count;
  }

  appendCoverage(target: SparseIntervals): void {
    for (const band of this.bands) target.add(band.start, band.end);
  }

  atOrAfter(row: number): VisibleWaitBand | undefined {
    return bandAtOrAfter(this.bands, row);
  }

  addMissing(start: number, end: number, startedAt: number): void {
    if (start >= end) return;

    let cursor = start;
    let band = this.atOrAfter(start);

    while (cursor < end) {
      if (!band || band.start >= end) {
        this.insert(cursor, end, startedAt);
        return;
      }

      if (band.start > cursor) this.insert(cursor, Math.min(end, band.start), startedAt);
      cursor = Math.max(cursor, band.end);
      band = this.atOrAfter(cursor);
    }
  }

  discard(start: number, end: number): void {
    if (start >= end) return;

    const next: VisibleWaitBand[] = [];

    for (const band of this.bands) {
      if (band.end <= start || band.start >= end) {
        next.push(band);
        continue;
      }

      if (band.start < start) next.push({ ...band, end: start });
      if (band.end > end) next.push({ ...band, start: end });
    }

    this.bands.splice(0, this.bands.length, ...next);
  }

  complete(start: number, end: number, completedAt: number): VisibleWaitSample[] {
    const samples: VisibleWaitSample[] = [];

    for (const band of this.bands) {
      const overlapStart = Math.max(start, band.start);
      const overlapEnd = Math.min(end, band.end);

      if (overlapStart < overlapEnd) {
        samples.push({
          duration: Math.max(0, completedAt - band.startedAt),
          rows: overlapEnd - overlapStart,
        });
      }
    }

    this.discard(start, end);

    return samples;
  }

  private insert(start: number, end: number, startedAt: number): void {
    let index = 0;
    while (
      index < this.bands.length &&
      (this.bands[index]?.start ?? Number.POSITIVE_INFINITY) < start
    )
      index += 1;
    this.bands.splice(index, 0, { start, end, startedAt });
  }
}

/** Visible-demand timing grouped by physical column. */
export class SparseColumnVisibleWaits {
  private readonly columns = new Map<number, SparseVisibleWaits>();

  get bandCount(): number {
    let count = 0;
    for (const waits of this.columns.values()) count += waits.bandCount;
    return count;
  }

  get columnCount(): number {
    return this.columns.size;
  }

  get rowCount(): number {
    let count = 0;
    for (const waits of this.columns.values()) count += waits.rowCount;
    return count;
  }

  rowUnion(): SparseIntervals {
    const union = new SparseIntervals();
    for (const waits of this.columns.values()) waits.appendCoverage(union);
    return union;
  }

  clear(): void {
    this.columns.clear();
  }

  retain(columns: readonly number[], start: number, end: number, owners: SparseColumnOwners): void {
    const retained = new Set(columns);

    for (const [column, waits] of this.columns) {
      if (!retained.has(column)) {
        this.columns.delete(column);
        continue;
      }

      const owned = owners.rows(column);
      if (owned) {
        owned.forEachGap(0, start, (gapStart, gapEnd) => waits.discard(gapStart, gapEnd));
        owned.forEachGap(end, Number.MAX_SAFE_INTEGER, (gapStart, gapEnd) =>
          waits.discard(gapStart, gapEnd),
        );
      } else {
        waits.discard(0, start);
        waits.discard(end, Number.MAX_SAFE_INTEGER);
      }

      if (waits.bandCount === 0) this.columns.delete(column);
    }
  }

  addMissing(column: number, start: number, end: number, startedAt: number): void {
    if (start >= end) return;

    let waits = this.columns.get(column);
    if (!waits) {
      waits = new SparseVisibleWaits();
      this.columns.set(column, waits);
    }

    waits.addMissing(start, end, startedAt);
  }

  discard(columns: readonly number[], start: number, end: number): void {
    for (const column of columns) {
      const waits = this.columns.get(column);
      if (!waits) continue;

      waits.discard(start, end);
      if (waits.bandCount === 0) this.columns.delete(column);
    }
  }

  complete(
    columns: readonly number[],
    start: number,
    end: number,
    completedAt: number,
  ): VisibleWaitSample[] {
    const samples: VisibleWaitSample[] = [];

    for (const column of columns) {
      const waits = this.columns.get(column);
      if (!waits) continue;

      samples.push(...waits.complete(start, end, completedAt));
      if (waits.bandCount === 0) this.columns.delete(column);
    }

    return samples;
  }
}

function bandAtOrAfter<T extends RowBand>(bands: readonly T[], row: number): T | undefined {
  let low = 0;
  let high = bands.length;

  while (low < high) {
    const middle = (low + high) >>> 1;
    const band = bands[middle];
    if (band && band.end <= row) low = middle + 1;
    else high = middle;
  }

  return bands[low];
}
