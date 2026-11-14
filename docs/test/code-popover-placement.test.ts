import { expect, it } from "bun:test";

import { choosePanelPlacement } from "../src/lib/code-popover-placement.js";

// The code popover tests place real panels through the other paths.

it("without room beside, opens a panel past the mentions next to the line", () => {
  const box = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
  });
  // A code line at y 400–420 in an 800 px wide viewport, its text ending at x 700.
  const placement = choosePanelPlacement({
    trigger: box(400, 400, 60, 20),
    line: box(380, 400, 700, 20),
    lineEnd: 700,
    panel: { width: 360, height: 160 },
    mentions: [box(420, 300, 60, 20), box(420, 480, 60, 20), box(420, 520, 60, 20)],
    chrome: [],
    viewport: box(12, 76, 800 - 24, 812),
    gap: 8,
    minHeight: 120,
  });
  expect(placement).toEqual({ side: "above", shift: 100 });
});

it("keeps a panel off the code block's tabs, opening it above them", () => {
  const box = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
  });
  // The first line of a block (y 400–420) with its tab list at y 340–390, a
  // mention below, and no room beside the line.
  const placement = choosePanelPlacement({
    trigger: box(400, 400, 60, 20),
    line: box(380, 400, 700, 20),
    lineEnd: 700,
    panel: { width: 360, height: 120 },
    mentions: [box(420, 440, 60, 20)],
    chrome: [box(380, 340, 400, 50)],
    viewport: box(12, 76, 800 - 24, 812),
    gap: 8,
    minHeight: 120,
  });
  expect(placement).toEqual({ side: "above", shift: 60 });
});
