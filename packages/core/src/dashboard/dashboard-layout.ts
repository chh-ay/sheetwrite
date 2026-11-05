// Layout arithmetic of the dashboard grid, as plain data: where a moved or
// resized box goes, and where a new item fits. The view and the Insert
// commands use it; the store checks the result (#231).

import { boxesOverlap } from "../dashboard.js";
import type { DashboardBox, DashboardItem } from "../types/dashboard.js";

/** Columns of the dashboard grid. */
export const DASHBOARD_COLUMNS = 12;
/** Height of one grid row, in CSS pixels. */
export const DASHBOARD_ROW_HEIGHT = 48;
/** Tallest item, in grid rows. */
const MAX_ITEM_HEIGHT = 64;

/** Whether `box` is free of every item except the one with `ignore`. */
export function boxIsFree(
  items: readonly DashboardItem[],
  box: DashboardBox,
  ignore?: string,
): boolean {
  return items.every((item) => item.id === ignore || !boxesOverlap(item.box, box));
}

/** `box` moved by whole cells, kept inside the columns and below row 0. */
export function movedBox(box: DashboardBox, dx: number, dy: number): DashboardBox {
  return {
    ...box,
    x: Math.min(Math.max(box.x + dx, 0), DASHBOARD_COLUMNS - box.w),
    y: Math.max(box.y + dy, 0),
  };
}

/** `box` resized by whole cells, at least one cell and inside the columns. */
export function resizedBox(box: DashboardBox, dw: number, dh: number): DashboardBox {
  return {
    ...box,
    w: Math.min(Math.max(box.w + dw, 1), DASHBOARD_COLUMNS - box.x),
    h: Math.min(Math.max(box.h + dh, 1), MAX_ITEM_HEIGHT),
  };
}

/**
 * The first free box of `w` by `h` cells in reading order: top to bottom,
 * then left to right. Below the last item there is always room.
 */
export function firstFreeBox(items: readonly DashboardItem[], w: number, h: number): DashboardBox {
  const width = Math.min(w, DASHBOARD_COLUMNS);
  const bottom = items.reduce((last, item) => Math.max(last, item.box.y + item.box.h), 0);
  for (let y = 0; y <= bottom; y++) {
    for (let x = 0; x + width <= DASHBOARD_COLUMNS; x++) {
      const box = { x, y, w: width, h };
      if (boxIsFree(items, box)) return box;
    }
  }
  return { x: 0, y: bottom, w: width, h };
}
