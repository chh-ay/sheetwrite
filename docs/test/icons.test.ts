import { expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { ICON_NAMES } from "../src/icons/icon-names.ts";

it("names every icon in the sprite, in sprite order", () => {
  const sprite = readFileSync(new URL("../src/icons/sprite.svg", import.meta.url), "utf8");
  const ids = [...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((symbol) => symbol[1]);
  expect(ids).toEqual([...ICON_NAMES]);
});
