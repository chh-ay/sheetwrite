import { describe, expect, test } from "bun:test";
import { hasOpaqueForeground } from "./canvas-assertions.js";

const pixel = (red: number, green: number, blue: number, alpha = 255) => [red, green, blue, alpha];
const background = pixel(10, 13, 20);
const ink = pixel(32, 40, 58);

describe("hasOpaqueForeground", () => {
  test("detects opaque paint that differs from the dominant background", () => {
    const cases: Array<[string, number[], boolean]> = [
      ["ink over background", [...background, ...background, ...background, ...ink], true],
      ["blank background", [...background, ...background, ...background], false],
      ["transparent ink", [...background, ...background, ...pixel(32, 40, 58, 0)], false],
      ["fully transparent", [...pixel(0, 0, 0, 0), ...pixel(32, 40, 58, 0)], false],
      ["empty", [], false],
    ];
    for (const [label, rgba, painted] of cases) {
      expect(hasOpaqueForeground(new Uint8ClampedArray(rgba)), label).toBe(painted);
    }
  });
});
