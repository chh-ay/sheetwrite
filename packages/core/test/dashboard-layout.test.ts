import { expect, it } from "bun:test";

import { boxIsFree, firstFreeBox } from "../src/dashboard/dashboard-layout.js";
import type { DashboardItem } from "../src/types.js";

const item = (id: string, x: number, y: number, w: number, h: number): DashboardItem => ({
  id,
  box: { x, y, w, h },
  kind: "pivot",
  pivot: id,
});

it("finds the first free box in reading order, or the row below the last item", () => {
  const items = [item("a", 0, 0, 6, 4), item("b", 6, 0, 3, 2)];

  expect(firstFreeBox(items, 3, 2)).toEqual({ x: 9, y: 0, w: 3, h: 2 });
  expect(firstFreeBox(items, 6, 2)).toEqual({ x: 6, y: 2, w: 6, h: 2 });
  expect(firstFreeBox([item("full", 0, 0, 12, 3)], 4, 1)).toEqual({ x: 0, y: 3, w: 4, h: 1 });
  expect(boxIsFree(items, { x: 5, y: 3, w: 2, h: 1 })).toBe(false);
  expect(boxIsFree(items, { x: 5, y: 3, w: 2, h: 1 }, "a")).toBe(true);
});
