import { describe, expect, it } from "bun:test";

import {
  automaticTextColor,
  contrastRatio,
  parseRgbColor,
  relativeLuminance,
  resolveCssColor,
} from "../src/color-contrast.js";

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
  // A stand-in for a canvas context: it normalizes the names it knows and keeps
  // its previous value for anything else, as a canvas does.
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
  it("keeps the foreground when it contrasts more and inverts it otherwise", () => {
    expect(automaticTextColor("#ffffff", "#1f2328", "#ffffff")).toBe("#1f2328");
    expect(automaticTextColor("#000000", "#1f2328", "#ffffff")).toBe("#e0dcd7");
    expect(automaticTextColor("#e6f2ec", "#e6edf3", "#0d1117")).toBe("#19120c");
    expect(automaticTextColor("#0b3d2e", "#e6edf3", "#0d1117")).toBe("#e6edf3");
  });

  it("judges a translucent fill as painted over the background", () => {
    // 10% black over white is light; over a near-black page it is dark.
    expect(automaticTextColor("rgba(0, 0, 0, 0.1)", "#e6edf3", "#ffffff")).toBe("#19120c");
    expect(automaticTextColor("rgba(0, 0, 0, 0.1)", "#e6edf3", "#0d1117")).toBe("#e6edf3");
  });

  it("gives the higher-contrast choice across the whole grey ramp", () => {
    const pairs: readonly (readonly [string, string])[] = [
      ["#1f2328", "#e0dcd7"],
      ["#e6edf3", "#19120c"],
    ];
    for (const [foreground, inverse] of pairs) {
      for (let level = 0; level <= 255; level += 15) {
        const fill = `rgb(${level}, ${level}, ${level})`;
        const chosen = automaticTextColor(fill, foreground, "#ffffff");
        const fillLuminance = relativeLuminance({
          red: level,
          green: level,
          blue: level,
          alpha: 1,
        });
        const ratio = (css: string) => {
          const color = parseRgbColor(css);
          if (!color) throw new Error(`unparsed ${css}`);
          return contrastRatio(relativeLuminance(color), fillLuminance);
        };
        expect([foreground, inverse]).toContain(chosen);
        const other = chosen === foreground ? inverse : foreground;
        expect(ratio(chosen)).toBeGreaterThanOrEqual(ratio(other));
      }
    }
  });

  it("keeps the foreground for a fill it cannot read", () => {
    expect(automaticTextColor("bogus", "#e6edf3", "#0d1117")).toBe("#e6edf3");
  });
});
