import { describe, expect, it } from "bun:test";
import {
  horizontalMergeGaps,
  intersectingMerges,
  type MergeRect,
  mergeAnchorAt,
  prepareMergeIndex,
  verticalMergeGaps,
} from "../src/canvas-paint.js";

describe("PreparedMergeIndex", () => {
  it("returns stable answers across repeated queries and updated merge sets", () => {
    const initial: readonly MergeRect[] = [{ r0: 2, c0: 3, r1: 4, c1: 5 }];
    for (let query = 0; query < 2; query++) {
      const index = prepareMergeIndex(initial);
      expect(mergeAnchorAt(index, 3, 4)).toEqual(initial[0]!);
      expect(mergeAnchorAt(index, 0, 0)).toBeNull();
    }

    const replaced: readonly MergeRect[] = [{ r0: 7, c0: 8, r1: 9, c1: 10 }];
    const replacementIndex = prepareMergeIndex(replaced);
    expect(mergeAnchorAt(replacementIndex, 8, 9)).toEqual(replaced[0]!);
    expect(mergeAnchorAt(replacementIndex, 3, 4)).toBeNull();

    expect(mergeAnchorAt(prepareMergeIndex([]), 8, 9)).toBeNull();
  });

  it("returns window intersections and sorted gridline gaps", () => {
    const merges: readonly MergeRect[] = [
      { r0: 3, c0: 7, r1: 5, c1: 9 },
      { r0: 2, c0: 1, r1: 4, c1: 3 },
      { r0: 20, c0: 20, r1: 21, c1: 21 },
    ];
    const index = prepareMergeIndex(merges);
    expect(intersectingMerges(index, 2, 6, [0, 1, 2, 3, 7, 8, 9])).toEqual([
      merges[1]!,
      merges[0]!,
    ]);
    expect(horizontalMergeGaps(index, 3, 0, 10)).toEqual([merges[1]!, merges[0]!]);
    expect(verticalMergeGaps(index, 8, 0, 10)).toEqual([merges[0]!]);
  });
});
