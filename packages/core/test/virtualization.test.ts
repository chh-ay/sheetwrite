import { describe, expect, it } from "bun:test";

import { OffsetIndex } from "../src/fenwick.js";
import { computeWindow } from "../src/virtualization.js";

describe("computeWindow", () => {
  const idx = new OffsetIndex(1000, 20);

  it("includes the rows intersecting the viewport plus overscan", () => {
    // viewport [100, 200) covers rows 5..10; overscan 2 widens to [3, 13)
    expect(computeWindow(idx, 100, 100, 2)).toEqual({ start: 3, end: 13 });
  });

  it("returns an empty window for an empty sheet", () => {
    expect(computeWindow(new OffsetIndex(0, 20), 0, 100, 2)).toEqual({ start: 0, end: 0 });
  });
});
