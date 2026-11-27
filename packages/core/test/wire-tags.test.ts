import { expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import * as wire_tags from "../src/store/wire-tags.js";

const ENGINE_TYPES = new URL("../../wasm/src/types.rs", import.meta.url);
const ENGINE_KIND = /^pub\(crate\) const (KIND_\w+): u8 = (\d+);$/gm;

it("gives each cell kind the value the engine gives it", () => {
  const engine_kinds = Object.fromEntries(
    Array.from(readFileSync(ENGINE_TYPES, "utf8").matchAll(ENGINE_KIND), ([, name, value]) => [
      name,
      Number(value),
    ]),
  );
  const script_kinds = Object.fromEntries(
    Object.entries(wire_tags).filter(([name]) => name.startsWith("KIND_")),
  );

  expect(Object.keys(engine_kinds)).not.toHaveLength(0);
  expect(script_kinds).toEqual(engine_kinds);
});
