import { describe, expect, test } from "bun:test";
import { hasOpaqueForeground } from "./canvas-assertions.js";

describe("hasOpaqueForeground", () => {
  test("accepts an opaque foreground pixel over the background", () => {
    expect(
      hasOpaqueForeground(
        new Uint8ClampedArray([255, 255, 255, 255, 227, 232, 240, 255]),
        [255, 255, 255],
      ),
    ).toBe(true);
  });

  test("uses the dominant opaque color as the background when none is supplied", () => {
    expect(
      hasOpaqueForeground(
        new Uint8ClampedArray([10, 13, 20, 255, 10, 13, 20, 255, 10, 13, 20, 255, 32, 40, 58, 255]),
      ),
    ).toBe(true);
  });

  test("does not count transparent foreground-colored pixels as paint", () => {
    expect(
      hasOpaqueForeground(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]), [255, 255, 255]),
    ).toBe(false);
  });

  test("rejects zero-size input", () => {
    expect(hasOpaqueForeground(new Uint8ClampedArray())).toBe(false);
  });
});
