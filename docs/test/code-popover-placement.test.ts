import { expect, it } from "bun:test";

import {
  choosePanelSide,
  panelFrame,
  type PlacementInput,
} from "../src/lib/code-popover-placement.js";

// The browser tests place real panels; these cover the geometry's choices.

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

/** A 17 px tall symbol at x 400 and y `triggerTop`, in a 1440 × 900 viewport under a 64 px header. */
function input(triggerTop: number, panel = { width: 560, height: 280 }): PlacementInput {
  return {
    trigger: box(400, triggerTop, 80, 17),
    panel,
    viewport: box(12, 76, 1440 - 24, 900 - 76 - 12),
    gap: 8,
  };
}

it("opens below the symbol, 8 px from it, when the panel fits there", () => {
  const placement = input(400);
  expect(choosePanelSide(placement)).toBe("below");
  expect(panelFrame("below", placement)).toEqual({ left: 400, top: 425, maxHeight: 280 });
});

it("opens above the symbol, 8 px from it, when only that side has room", () => {
  const placement = input(669);
  expect(choosePanelSide(placement)).toBe("above");
  expect(panelFrame("above", placement)).toEqual({ left: 400, top: 381, maxHeight: 280 });
});

it("takes the roomier side and cuts the panel to it when neither side fits", () => {
  const placement = input(300, { width: 560, height: 700 });
  expect(choosePanelSide(placement)).toBe("below");
  expect(panelFrame("below", placement)).toEqual({ left: 400, top: 325, maxHeight: 563 });
});

it("moves a panel left to keep it inside the viewport", () => {
  const placement = { ...input(400), trigger: box(1300, 400, 80, 17) };
  expect(panelFrame("below", placement).left).toBe(1428 - 560);
});
