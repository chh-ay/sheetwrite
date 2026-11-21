import { describe, expect, it } from "bun:test";

import { automaticTextColor, parseRgbColor, resolveCssColor } from "../src/color-contrast.js";

describe("parseRgbColor", () => {
  it("reads hex and rgb forms with and without alpha", () => {
    expect(parseRgbColor("#abc")).toEqual({ red: 0xaa, green: 0xbb, blue: 0xcc, alpha: 1 });
    expect(parseRgbColor("#e6f2ec")).toEqual({ red: 0xe6, green: 0xf2, blue: 0xec, alpha: 1 });
    expect(parseRgbColor("#00000080")?.alpha).toBeCloseTo(128 / 255, 6);
    expect(parseRgbColor("rgb(1, 2, 3)")).toEqual({ red: 1, green: 2, blue: 3, alpha: 1 });
    expect(parseRgbColor("rgba(1, 2, 3, 0.5)")).toEqual({ red: 1, green: 2, blue: 3, alpha: 0.5 });
    expect(parseRgbColor("rgb(1 2 3 / 50%)")).toEqual({ red: 1, green: 2, blue: 3, alpha: 0.5 });
    expect(parseRgbColor("lightgreen")).toBeUndefined();
    expect(parseRgbColor("#12345")).toBeUndefined();
  });
});

describe("resolveCssColor", () => {
  // A canvas context stand-in: it keeps its last value for a name it does not know.
  const NAMES: Record<string, string> = { white: "#ffffff", navy: "#000080" };
  const resolver = {
    value: "#000000",
    get fillStyle(): string {
      return this.value;
    },
    set fillStyle(input: string) {
      const named = NAMES[input] ?? parseRgbColor(input)?.red;
      if (named !== undefined) this.value = NAMES[input] ?? input;
    },
  };

  it("resolves named colours through the resolver and rejects unknown ones", () => {
    expect(resolveCssColor("navy", resolver)).toEqual({ red: 0, green: 0, blue: 0x80, alpha: 1 });
    expect(resolveCssColor("not-a-colour", resolver)).toBeUndefined();
    expect(resolveCssColor("navy")).toBeUndefined();
  });

  it("picks dark text on a named light fill in a dark theme", () => {
    expect(automaticTextColor("white", "#e6edf3", "#0d1117", resolver)).toBe("#19120c");
  });
});

describe("automaticTextColor", () => {
  // The foreground or its inverse, whichever contrasts more with the fill
  // painted over the background; a fill it cannot read keeps the foreground.
  it.each([
    ["#ffffff", "#1f2328", "#ffffff", "#1f2328"],
    ["#000000", "#1f2328", "#ffffff", "#e0dcd7"],
    ["#e6f2ec", "#e6edf3", "#0d1117", "#19120c"],
    ["#0b3d2e", "#e6edf3", "#0d1117", "#e6edf3"],
    ["rgba(0, 0, 0, 0.1)", "#e6edf3", "#ffffff", "#19120c"],
    ["rgba(0, 0, 0, 0.1)", "#e6edf3", "#0d1117", "#e6edf3"],
    ["bogus", "#e6edf3", "#0d1117", "#e6edf3"],
  ])(
    "paints %s with foreground %s on background %s in %s",
    (fill, foreground, background, text) => {
      expect(automaticTextColor(fill, foreground, background)).toBe(text);
    },
  );
});
