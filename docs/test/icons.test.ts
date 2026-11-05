import { expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { ICON_NAMES } from "../src/icons/icon-names.ts";

const SPRITE = readFileSync(new URL("../src/icons/sprite.svg", import.meta.url), "utf8");
const SYMBOLS = [...SPRITE.matchAll(/<symbol id="([^"]+)" viewBox="([^"]+)">(.*?)<\/symbol>/g)];

it("names every icon in the sprite, in sprite order", () => {
  expect(SYMBOLS.map((symbol) => symbol[1])).toEqual([...ICON_NAMES]);
});

it("draws every icon on the 24-unit grid", () => {
  for (const [, id, viewBox] of SYMBOLS)
    expect({ id, viewBox }).toEqual({ id, viewBox: "0 0 24 24" });
});

it("takes colour and stroke from the page, with the accent token as the only other paint", () => {
  for (const [, id, , body = ""] of SYMBOLS) {
    // Stroke width, caps and joins come from .sw-icon; colours from currentColor.
    expect({
      id,
      attributes: body.match(/\s(?:stroke|fill|stroke-linecap|stroke-linejoin|color)="/g),
    }).toEqual({
      id,
      attributes: null,
    });
    for (const style of body.matchAll(/style="([^"]+)"/g)) {
      const paints = (style[1] ?? "").match(/(?:fill|stroke):[^;]+/g) ?? [];
      for (const paint of paints) {
        expect({ id, paint }).toEqual({
          id,
          paint: expect.stringMatching(/^(?:fill|stroke):(?:var\(--sw-icon-accent\)|none)$/),
        });
      }
    }
  }
});
