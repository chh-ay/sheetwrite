import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import { applyPlan, planRenames, toSnakeCase } from "./snake-case-internals.js";

const FIXTURES = resolve(import.meta.dir, "fixtures/snake-case-internals");

/** Copy the input fixture project so `apply` never touches the checked-in files. */
function copy_input(): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "snake-case-internals-")));
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
    const directory = copy_input();

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

  test("reports bound names and prose mentions instead of rewriting them", async () => {
    const plan = await planRenames(join(FIXTURES, "input/tsconfig.json"), []);

    expect(plan.mentions.map((mention) => `${mention.line} ${mention.oldName}`)).toEqual([
      "6 localTotal",
      "89 currentCount",
    ]);

    expect(plan.conflicts.map((conflict) => `${conflict.oldName} -> ${conflict.newName}`)).toEqual([
      "scaledLine -> scaled_line",
    ]);
    expect(plan.renames.map((rename) => rename.oldName)).not.toContain("scaledLine");
  });

  test("a picked name settles a conflict and is still checked against bound names", async () => {
    const directory = copy_input();

    try {
      const tsconfig = join(directory, "tsconfig.json");
      const pick = async (new_name: string) =>
        planRenames(
          tsconfig,
          [],
          new Map([[join(directory, "rules.ts"), new Map([["scaledLine", new_name]])]]),
        );

      const bound = await pick("scaled_line");
      expect(bound.conflicts.map((conflict) => conflict.oldName)).toEqual(["scaledLine"]);

      const free = await pick("line_scaled");
      expect(free.conflicts).toEqual([]);
      expect(free.renames.find((rename) => rename.oldName === "scaledLine")?.newName).toBe(
        "line_scaled",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("skips files below a nested tsconfig.json", async () => {
    const directory = copy_input();

    try {
      cpSync(join(FIXTURES, "input"), join(directory, "nested"), { recursive: true });
      const tsconfig = JSON.parse(readFileSync(join(directory, "tsconfig.json"), "utf8"));
      writeFileSync(
        join(directory, "tsconfig.json"),
        JSON.stringify({ ...tsconfig, include: ["**/*.ts"] }),
      );

      const plan = await planRenames(join(directory, "tsconfig.json"), []);

      expect(new Set(plan.renames.map((rename) => relative(directory, rename.file)))).toEqual(
        new Set(["rules.ts"]),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("skips generated .gen.ts files, which their generator rewrites", async () => {
    const directory = copy_input();

    try {
      writeFileSync(
        join(directory, "routeTree.gen.ts"),
        "const rootChildren = [1];\nexport const routeTree = rootChildren;\n",
      );

      const plan = await planRenames(join(directory, "tsconfig.json"), []);

      expect(plan.renames.map((rename) => rename.oldName)).not.toContain("rootChildren");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("a reflective call follows a private member of another project", async () => {
    const directory = copy_input();

    try {
      writeFileSync(
        join(directory, "probe.ts"),
        'export function peek(target: object): unknown {\n  return Reflect.get(target, "remoteMember");\n}\n',
      );
      const other_members = new Map([["remoteMember", new Set(["remote_member"])]]);
      applyPlan(await planRenames(join(directory, "tsconfig.json"), [], new Map(), other_members));

      expect(readFileSync(join(directory, "probe.ts"), "utf8")).toContain(
        'Reflect.get(target, "remote_member")',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("a key in a double cast's type follows a private member of another project", async () => {
    const directory = copy_input();

    try {
      writeFileSync(
        join(directory, "view.ts"),
        [
          "export function peekView(target: object): number {",
          "  const view = target as unknown as { remoteMember: { size: number }; otherKey: number };",
          "  return view.remoteMember.size + view.otherKey;",
          "}",
          "",
        ].join("\n"),
      );
      const other_members = new Map([["remoteMember", new Set(["remote_member"])]]);
      const plan = await planRenames(
        join(directory, "tsconfig.json"),
        [],
        new Map(),
        other_members,
      );
      applyPlan(plan);

      const view = readFileSync(join(directory, "view.ts"), "utf8");
      expect(view).toContain("{ remote_member: { size: number }; otherKey: number }");
      expect(view).toContain("view.remote_member.size + view.otherKey");
      const names_only = plan.mentions.filter((mention) => mention.source === "name only");
      expect(names_only.map((mention) => `${mention.line} ${mention.oldName}`)).toContain(
        "2 remoteMember",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("a second run finds nothing to rename and changes no file", async () => {
    const directory = copy_input();

    try {
      const tsconfig = join(directory, "tsconfig.json");
      applyPlan(await planRenames(tsconfig, []));
      const first = readFileSync(join(directory, "rules.ts"), "utf8");

      const second = await planRenames(tsconfig, []);
      applyPlan(second);

      expect(second.renames).toEqual([]);
      expect(readFileSync(join(directory, "rules.ts"), "utf8")).toBe(first);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
