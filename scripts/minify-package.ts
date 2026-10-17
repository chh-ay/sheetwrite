import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const directory = process.argv[2];
if (!directory) throw new Error("Expected a generated JavaScript directory");

// Keep module boundaries, names, imports, and dead code for consumer bundlers.
// Only generated JavaScript loses comments and whitespace; declarations stay readable.
const transpiler = new Bun.Transpiler({
  loader: "js",
  target: "browser",
  minifyWhitespace: true,
  treeShaking: false,
  trimUnusedImports: false,
  deadCodeElimination: false,
  inline: false,
});
const root = resolve(directory);
for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".js")) continue;

  const path = join(entry.parentPath, entry.name);
  const source = await readFile(path, "utf8");
  await writeFile(path, transpiler.transformSync(source));
}
