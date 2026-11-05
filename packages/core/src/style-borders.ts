import type { SelRect } from "./selection.js";
import { storeEngine } from "./store/engine-registry.js";
import { mergesOverlap } from "./store/ranges.js";
import type { CellStyle } from "./types/cell.js";
import type { SheetId } from "./types/coordinates.js";
import type { DocumentOp } from "./types/document.js";
import type { BorderPreset } from "./types/grid.js";
import type { Theme } from "./types/render.js";
import type { Store } from "./types/store.js";

/** Edge cells above which side-only runs replace per-cell style reads. */
const BORDER_EDGE_LIMIT = 65_536;

/** Grid reads that border patches need; style actions supply them. */
export interface BorderPatchDeps {
  store: Store;
  theme: () => Theme;
  activeSheet: () => SheetId;
  merges: () => SelRect[];
  anchorCell: (row: number, col: number) => { row: number; col: number };
  toDataRow: (viewRow: number) => number;
}

type Border = NonNullable<CellStyle["border"]>;

type BorderEdge = "top" | "bottom" | "left" | "right";

type BorderSide = NonNullable<Border["top"]>;

type EdgePreset = Exclude<BorderPreset, "all" | "none">;

/** One anchor cell and the border edges it receives. */
interface BorderCell {
  row: number;
  col: number;
  border: Border;
}

/** Anchor cells keyed by data position so merged cells receive one border patch. */
class BorderTargets {
  readonly cells = new Map<string, BorderCell>();

  constructor(
    private readonly deps: BorderPatchDeps,
    private readonly side: BorderSide,
  ) {}

  add(row: number, col: number, edge: BorderEdge): void {
    const anchor = this.deps.anchorCell(row, col);
    const dataRow = this.deps.toDataRow(anchor.row);
    const key = `${dataRow}:${anchor.col}`;
    let target = this.cells.get(key);
    if (!target) {
      target = { row: dataRow, col: anchor.col, border: {} };
      this.cells.set(key, target);
    }

    target.border[edge] = this.side;
  }
}

/** Build edge-only formatting patches, bounding reads for very large selections. */
export function selectionBorderPatches(
  deps: BorderPatchDeps,
  rects: readonly SelRect[],
  preset: EdgePreset,
): DocumentOp[] {
  const side: BorderSide = {
    color: deps.theme().fg,
    width: preset === "thickOutside" ? 2 : 1,
    style: "solid",
  };
  const outside = preset === "outside" || preset === "thickOutside";
  const edgeCount = rects.reduce(
    (count, rect) =>
      count +
      (outside || preset === "top" || preset === "bottom"
        ? (rect.c1 - rect.c0 + 1) * (outside ? 2 : 1)
        : 0) +
      (outside || preset === "left" || preset === "right"
        ? (rect.r1 - rect.r0 + 1) * (outside ? 2 : 1)
        : 0),
    0,
  );
  const targets = new BorderTargets(deps, side);

  return edgeCount > BORDER_EDGE_LIMIT
    ? largeEdgeBorders(deps, rects, preset, outside, side, targets)
    : cellBorders(deps, rects, preset, outside, targets);
}

function largeEdgeBorders(
  deps: BorderPatchDeps,
  rects: readonly SelRect[],
  preset: EdgePreset,
  outside: boolean,
  side: BorderSide,
  targets: BorderTargets,
): DocumentOp[] {
  const patches: DocumentOp[] = [];
  // Side-only borders replace existing borders without reading every edge cell.
  for (const rect of rects) {
    const edges = [
      ["top", rect.r0, rect.c0, rect.r0, rect.c1],
      ["bottom", rect.r1, rect.c0, rect.r1, rect.c1],
      ["left", rect.r0, rect.c0, rect.r1, rect.c0],
      ["right", rect.r0, rect.c1, rect.r1, rect.c1],
    ] as const;
    for (const [edge, r0, c0, r1, c1] of edges) {
      if (!outside && preset !== edge) continue;
      let strips: SelRect[] = [{ r0, c0, r1, c1 }];
      if (outside) {
        targets.add(r0, c0, edge);
        targets.add(r1, c1, edge);
        const horizontal = edge === "top" || edge === "bottom";
        const interior = horizontal
          ? { r0, c0: c0 + 1, r1, c1: c1 - 1 }
          : { r0: r0 + 1, c0, r1: r1 - 1, c1 };
        strips = interior.r0 <= interior.r1 && interior.c0 <= interior.c1 ? [interior] : [];
      }

      strips = subtractMergedEdges(deps, strips, edge, targets);
      for (const strip of strips) appendEdgeRuns(deps, patches, strip, edge, side);
    }
  }

  for (const target of targets.cells.values()) {
    patches.push(borderPatch(deps.activeSheet(), target));
  }

  return patches;
}

function subtractMergedEdges(
  deps: BorderPatchDeps,
  strips: SelRect[],
  edge: BorderEdge,
  targets: BorderTargets,
): SelRect[] {
  for (const merge of deps.merges()) {
    const remainder: SelRect[] = [];
    for (const strip of strips) {
      if (!mergesOverlap(strip, merge)) {
        remainder.push(strip);
        continue;
      }

      targets.add(Math.max(strip.r0, merge.r0), Math.max(strip.c0, merge.c0), edge);
      if (strip.r0 === strip.r1) {
        if (strip.c0 < merge.c0) remainder.push({ ...strip, c1: merge.c0 - 1 });
        if (strip.c1 > merge.c1) remainder.push({ ...strip, c0: merge.c1 + 1 });
      } else {
        if (strip.r0 < merge.r0) remainder.push({ ...strip, r1: merge.r0 - 1 });
        if (strip.r1 > merge.r1) remainder.push({ ...strip, r0: merge.r1 + 1 });
      }
    }

    strips = remainder;
  }

  return strips;
}

function appendEdgeRuns(
  deps: BorderPatchDeps,
  patches: DocumentOp[],
  strip: SelRect,
  edge: BorderEdge,
  side: BorderSide,
): void {
  let start = deps.toDataRow(strip.r0);
  let previous = start;
  for (let row = strip.r0 + 1; row <= strip.r1 + 1; row++) {
    const next = row <= strip.r1 ? deps.toDataRow(row) : -1;
    if (row <= strip.r1 && next === previous + 1) {
      previous = next;
      continue;
    }

    patches.push({
      op: "setRangeStyle",
      range: {
        sheet: deps.activeSheet(),
        start: { row: start, col: strip.c0 },
        end: { row: previous, col: strip.c1 },
      },
      style: { border: { [edge]: side } },
    });

    start = next;
    previous = next;
  }
}

function cellBorders(
  deps: BorderPatchDeps,
  rects: readonly SelRect[],
  preset: EdgePreset,
  outside: boolean,
  targets: BorderTargets,
): DocumentOp[] {
  for (const rect of rects) {
    if (outside || preset === "top")
      for (let col = rect.c0; col <= rect.c1; col++) targets.add(rect.r0, col, "top");
    if (outside || preset === "bottom")
      for (let col = rect.c0; col <= rect.c1; col++) targets.add(rect.r1, col, "bottom");
    if (outside || preset === "left")
      for (let row = rect.r0; row <= rect.r1; row++) targets.add(row, rect.c0, "left");
    if (outside || preset === "right")
      for (let row = rect.r0; row <= rect.r1; row++) targets.add(row, rect.c1, "right");
  }

  const cells = [...targets.cells.values()];
  const sheet = deps.activeSheet();
  const captured = storeEngine(deps.store)?.captureResolvedCells(sheet, cells);
  const merged = cells.map((cell, index) => ({
    ...cell,
    border: {
      ...(captured?.[index] ?? deps.store.getCell({ sheet, row: cell.row, col: cell.col })).style
        .border,
      ...cell.border,
    },
  }));

  const rows = borderRuns(sheet, merged, false);
  const columns = borderRuns(sheet, merged, true);
  return rows.length <= columns.length ? rows : columns;
}

function borderPatch(
  sheet: SheetId,
  cell: BorderCell,
): Extract<DocumentOp, { op: "setRangeStyle" }> {
  return {
    op: "setRangeStyle",
    range: {
      sheet,
      start: { row: cell.row, col: cell.col },
      end: { row: cell.row, col: cell.col },
    },
    style: { border: cell.border },
  };
}

function borderRuns(
  sheet: SheetId,
  cells: readonly BorderCell[],
  columnWise: boolean,
): DocumentOp[] {
  const sorted = [...cells].sort((a, b) =>
    columnWise ? a.col - b.col || a.row - b.row : a.row - b.row || a.col - b.col,
  );
  const result: DocumentOp[] = [];
  let previous: BorderCell | undefined;
  let signature = "";
  for (const cell of sorted) {
    const key = JSON.stringify(cell.border);
    const last = result[result.length - 1];
    if (
      previous &&
      key === signature &&
      last?.op === "setRangeStyle" &&
      (columnWise
        ? cell.col === previous.col && cell.row === previous.row + 1
        : cell.row === previous.row && cell.col === previous.col + 1)
    ) {
      last.range.end = { row: cell.row, col: cell.col };
    } else {
      result.push(borderPatch(sheet, cell));
    }

    previous = cell;
    signature = key;
  }

  return result;
}
