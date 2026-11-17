/**
 * The Format Cells preview: while the dialog is open, the selected cells show
 * the format OK would apply. It changes only the window the grid paints, never
 * the document, so Cancel leaves nothing to undo. It loads with the dialog.
 */

import type { PaintedWindowTransform } from "./read-window-controller.js";
import type { SelRect } from "./selection.js";
import type { CellBorder, CellStyle } from "./types/cell.js";
import type { BorderPreset } from "./types/grid.js";

/** Bits for the edges of the selected rectangles a cell lies on. */
const TOP = 1;
const BOTTOM = 2;
const LEFT = 4;
const RIGHT = 8;
/** One more than the largest edge mask, so a style id and a mask make one key. */
const EDGE_KEYS = 16;

/** The edges of `rects` the cell at view row `row`, column `col` lies on, or -1 outside them. */
function edgesAt(rects: readonly SelRect[], row: number, col: number): number {
  let edges = -1;
  for (const rect of rects) {
    if (row < rect.r0 || row > rect.r1 || col < rect.c0 || col > rect.c1) continue;
    edges =
      Math.max(edges, 0) |
      (row === rect.r0 ? TOP : 0) |
      (row === rect.r1 ? BOTTOM : 0) |
      (col === rect.c0 ? LEFT : 0) |
      (col === rect.c1 ? RIGHT : 0);
  }
  return edges;
}

/**
 * A transform of painted windows that shows `change` on the cells of `rects`
 * (view rows), as OK applies it: the style merges into each cell's style,
 * and a border preset draws its lines in `color` on the edges it names.
 */
export function formatPreview(
  rects: readonly SelRect[],
  change: { readonly style: Partial<CellStyle>; readonly border: BorderPreset | null },
  color: string,
): PaintedWindowTransform {
  const { border } = change;
  const side: CellBorder = {
    color,
    width: border === "thickOutside" ? 2 : 1,
    style: "solid",
  };
  const outside = border === "outside" || border === "thickOutside";

  const previewStyle = (base: CellStyle, edges: number): CellStyle => {
    const next: CellStyle = { ...base, ...change.style };
    if (border === null) return next;
    if (border === "none" || border === "all") {
      next.border = border === "all" ? { all: side } : undefined;
      return next;
    }

    const lines = { ...base.border };
    if (edges & TOP && (outside || border === "top")) lines.top = side;
    if (edges & BOTTOM && (outside || border === "bottom")) lines.bottom = side;
    if (edges & LEFT && (outside || border === "left")) lines.left = side;
    if (edges & RIGHT && (outside || border === "right")) lines.right = side;
    next.border = lines;
    return next;
  };

  return (view) => {
    const { rows, cols, styleIds, styles } = view;
    const previewIds = new Map<number, number>();
    const nextStyles = [...styles];
    let nextIds: Uint32Array | null = null;
    for (let row = rows.start; row < rows.end; row++) {
      for (let index = 0; index < cols.length; index++) {
        const edges = edgesAt(rects, row, cols[index]!);
        if (edges < 0) continue;

        const cell = (row - rows.start) * cols.length + index;
        const base = styleIds[cell]!;
        const key = base * EDGE_KEYS + edges;
        let id = previewIds.get(key);
        if (id === undefined) {
          id = nextStyles.push(previewStyle(styles[base] ?? {}, edges)) - 1;
          previewIds.set(key, id);
        }
        const ids = nextIds ?? (nextIds = styleIds.slice());
        ids[cell] = id;
      }
    }
    return nextIds ? { ...view, styleIds: nextIds, styles: nextStyles } : view;
  };
}
