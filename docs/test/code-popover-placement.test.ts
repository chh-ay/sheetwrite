import { describe, expect, it } from "bun:test";

import {
  type Box,
  choosePanelSide,
  type PlacementInput,
} from "../src/lib/code-popover-placement.js";

function box(left: number, top: number, width: number, height: number): Box {
  return { left, top, right: left + width, bottom: top + height };
}

/** A code line at y 400–420 in a 1440×900 viewport, its text ending at x 700. */
function input(mentions: readonly Box[], viewportWidth = 1440): PlacementInput {
  return {
    trigger: box(400, 400, 60, 20),
    line: box(380, 400, 700, 20),
    lineEnd: 700,
    panel: { width: 360, height: 160 },
    mentions,
    viewport: box(12, 76, viewportWidth - 24, 812),
    gap: 8,
  };
}

describe("code popover placement", () => {
  it("opens below the line when no mention is in the way", () => {
    expect(choosePanelSide(input([]))).toBe("below");
  });

  it("opens above when the symbol's other mentions are below", () => {
    expect(choosePanelSide(input([box(420, 480, 60, 20)]))).toBe("above");
  });

  it("opens beside the line end when mentions are above and below", () => {
    const mentions = [box(420, 340, 60, 20), box(420, 480, 60, 20)];
    expect(choosePanelSide(input(mentions))).toBe("beside");
  });

  it("without room beside, covers the fewest mentions", () => {
    const mentions = [box(420, 300, 60, 20), box(420, 480, 60, 20), box(420, 520, 60, 20)];
    expect(choosePanelSide(input(mentions, 800))).toBe("above");
  });
});
