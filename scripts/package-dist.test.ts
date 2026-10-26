import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  assertPublishedDeclarations,
  formatBuiltJavaScript,
  pruneUnreachableDeclarations,
} from "./package-dist.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function writePackage(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sheetwrite-package-dist-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

/**
 * Under Bun 1.4, `expect(promise).rejects` never settles while the promise
 * waits on the TypeScript API process, so the test awaits the rejection itself.
 */
async function rejection(pending: Promise<unknown>): Promise<string> {
  try {
    await pending;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected the promise to reject");
}

// Each kind of module reference a declaration can carry reaches exactly one
// file; the comment and the string type name files that must stay unreachable.
const TYPED_PACKAGE = {
  "package.json": JSON.stringify({
    name: "fixture",
    types: "./dist/index.d.ts",
    exports: {
      ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
      "./extra": { types: "./dist/extra.d.ts", default: "./dist/extra.js" },
    },
  }),
  "dist/index.d.ts": [
    '/// <reference path="./ambient.d.ts" />',
    '/** Example: `import("./commented.js")`. */',
    'export type { Cell } from "./cell.js";',
    'export declare const grid: import("./grid/index.js").Grid;',
    'export declare const folder: import("./folder").Folder;',
    'export declare const name: "./string-type.js";',
    'export type { Fflate } from "fflate";',
    "",
  ].join("\n"),
  "dist/ambient.d.ts": "declare const ambient: number;\n",
  "dist/cell.d.ts": 'import type { Style } from "../dist/style.js";\nexport type Cell = Style;\n',
  "dist/style.d.ts": "export type Style = string;\n",
  "dist/grid/index.d.ts": "export type Grid = number;\n",
  "dist/folder/index.d.ts": "export type Folder = number;\n",
  "dist/extra.d.ts": "export type Extra = number;\n",
  "dist/commented.d.ts": "export type Commented = number;\n",
  "dist/string-type.d.ts": "export type StringType = number;\n",
  "dist/internal.d.ts": "export type Internal = number;\n",
};
const REACHABLE = [
  "dist/ambient.d.ts",
  "dist/cell.d.ts",
  "dist/extra.d.ts",
  "dist/folder/index.d.ts",
  "dist/grid/index.d.ts",
  "dist/index.d.ts",
  "dist/style.d.ts",
];
const UNREACHABLE = ["dist/commented.d.ts", "dist/internal.d.ts", "dist/string-type.d.ts"];

describe("published declarations", () => {
  it("accepts exactly the declarations the type entries reach", async () => {
    const root = await writePackage(TYPED_PACKAGE);

    await assertPublishedDeclarations(root, ["package.json", "dist/index.js", ...REACHABLE]);
  });

  it("rejects a published declaration no type entry reaches", async () => {
    const root = await writePackage(TYPED_PACKAGE);

    expect(
      await rejection(assertPublishedDeclarations(root, [...REACHABLE, "dist/internal.d.ts"])),
    ).toContain("unreachable dist/internal.d.ts");
  });

  it("rejects a reached declaration that is not published", async () => {
    const { "dist/style.d.ts": _style, ...withoutStyle } = TYPED_PACKAGE;
    const root = await writePackage(withoutStyle);

    expect(
      await rejection(
        assertPublishedDeclarations(
          root,
          REACHABLE.filter((file) => file !== "dist/style.d.ts"),
        ),
      ),
    ).toContain("missing dist/cell.d.ts -> ../dist/style.js");
  });

  it("leaves source-typed packages to their framework tooling", async () => {
    const root = await writePackage({
      "package.json": JSON.stringify({ exports: { ".": { types: "./src/index.ts" } } }),
      "src/index.ts": "export const value = 1;\n",
    });

    await assertPublishedDeclarations(root, ["src/index.ts", "src/Grid.svelte.d.ts"]);
  });
});

describe("built declaration pruning", () => {
  it("deletes only the declarations no type entry reaches", async () => {
    const root = await writePackage(TYPED_PACKAGE);

    const removed = await pruneUnreachableDeclarations(root);

    expect(removed.toSorted()).toEqual(UNREACHABLE);
    await assertPublishedDeclarations(root, REACHABLE);
  });

  it("fails the build when a reached declaration was never emitted", async () => {
    const { "dist/grid/index.d.ts": _grid, ...withoutGrid } = TYPED_PACKAGE;
    const root = await writePackage(withoutGrid);

    expect(await rejection(pruneUnreachableDeclarations(root))).toContain(
      "dist/index.d.ts -> ./grid/index.js",
    );
    expect(await Bun.file(join(root, "dist/internal.d.ts")).exists()).toBe(true);
  });
});

describe("built JavaScript formatting", () => {
  it("indents with 2 spaces and keeps template contents and import order", async () => {
    const source = [
      'import "./second-side-effect.js";',
      'import { first } from "./first.js";',
      "export function render() {",
      "    if (first) {",
      "        return `<style>",
      "    .cell { color: red; }",
      "</style>`;",
      "    }",
      "}",
      "",
    ].join("\n");
    const root = await writePackage({ "dist/render.js": source });

    await formatBuiltJavaScript(root);

    expect(await readFile(join(root, "dist/render.js"), "utf8")).toBe(
      [
        'import "./second-side-effect.js";',
        'import { first } from "./first.js";',
        "export function render() {",
        "  if (first) {",
        "    return `<style>",
        "    .cell { color: red; }",
        "</style>`;",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
  });
});
