import { afterEach, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { collectStaticGraph, relativeImports } from "./verify-example-xlsx-isolation.js";

const fixtureRoots: string[] = [];

afterEach(async () => {
  await Promise.all(fixtureRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

// Built Svelte chunks keep the doc comment of `mount()`, whose example is
// import-shaped text; a code sample in a string looks the same.
const ENTRY = [
  "/**",
  " * ```js",
  " * import { mount } from 'svelte';",
  " * import App from './App.svelte';",
  " * ```",
  " */",
  `const hover = "import Sample from './sample.js'";`,
  `import { grid } from "./grid.js";`,
  `const lazy = () => import("./xlsx.js");`,
  "export { grid, hover, lazy };",
].join("\n");

it("follows only real module imports, not import text in comments or strings", async () => {
  const root = await mkdtemp(join(tmpdir(), "sheetwrite-xlsx-isolation-"));
  fixtureRoots.push(root);
  await writeFile(join(root, "entry.js"), ENTRY);
  await writeFile(join(root, "grid.js"), "export const grid = 1;\n");

  const graph = await collectStaticGraph([join(root, "entry.js")]);

  expect([...graph.keys()].sort()).toEqual([join(root, "entry.js"), join(root, "grid.js")]);
  expect(relativeImports(ENTRY, "dynamic-import")).toEqual(["./xlsx.js"]);
});
