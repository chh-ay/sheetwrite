import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { applyPlan, planRenames, toSnakeCase } from "./snake-case-internals.js";

const FIXTURES = resolve(import.meta.dir, "fixtures/snake-case-internals");

/** Copy the input fixture project so `apply` never touches the checked-in files. */
function copyInput(): string {
  const directory = mkdtempSync(join(tmpdir(), "snake-case-internals-"));
  cpSync(join(FIXTURES, "input"), directory, { recursive: true });

  return directory;
}

describe("toSnakeCase", () => {
  test.each([
    ["rowIndex", "row_index"],
    ["parseXMLPart", "parse_xml_part"],
    ["utf8Bytes", "utf8_bytes"],
    ["a1Reference", "a1_reference"],
    ["_pendingWrite", "_pending_write"],
    ["#stepSize", "#step_size"],
  ])("%s becomes %s", (name, expected) => {
    expect(toSnakeCase(name)).toBe(expected);
  });
});

describe("snake-case-internals", () => {
  test("renames internal names and keeps exported, public, key and DOM names", async () => {
    const directory = copyInput();

    try {
      applyPlan(await planRenames(join(directory, "tsconfig.json"), []));

      for (const file of ["rules.ts", "shared.ts"]) {
        expect(readFileSync(join(directory, file), "utf8")).toBe(
          readFileSync(join(FIXTURES, "expected", file), "utf8"),
        );
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("reports a rename whose new name is already bound instead of shadowing it", async () => {
    const plan = await planRenames(join(FIXTURES, "input/tsconfig.json"), []);

    expect(plan.conflicts.map((conflict) => `${conflict.oldName} -> ${conflict.newName}`)).toEqual([
      "scaledLine -> scaled_line",
    ]);
    expect(plan.renames.map((rename) => rename.oldName)).not.toContain("scaledLine");
  });

  test("finds nothing left to rename after applying", async () => {
    const directory = copyInput();

    try {
      const tsconfig = join(directory, "tsconfig.json");
      applyPlan(await planRenames(tsconfig, []));

      expect((await planRenames(tsconfig, [])).renames).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
