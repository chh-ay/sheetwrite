import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Keep wasm-bindgen's closure-local caches and finalizers isolated per engine. */
export async function generateWasmFactory(packageDirectory: string): Promise<void> {
  const gluePath = resolve(packageDirectory, "pkg/sheetwrite_wasm.js");
  const source = await readFile(gluePath, "utf8");
  const declarations = [...source.matchAll(/^export (?:class|function|const|let) (\w+)/gm)].map(
    (match) => match[1],
  );
  if (
    !declarations.includes("CellStore") ||
    !/\bfunction initSync\b/.test(source) ||
    !/\bwasmModule = module;/.test(source)
  ) {
    throw new Error(`Unrecognized wasm-bindgen exports in ${gluePath}`);
  }
  const implementation = source
    .replace(/^export (class|function|const|let) /gm, "$1 ")
    .replace(/^export \{[^}]*\};?\s*$/gm, "");
  const exports = [...new Set([...declarations, "initSync"])];
  await writeFile(
    resolve(packageDirectory, "pkg/sheetwrite_wasm_factory.js"),
    `// Generated from wasm-bindgen glue; do not edit.\nexport function createInstance() {\n${implementation}\nreturn { ${exports.join(", ")}, init: __wbg_init, getModule: () => wasmModule, getMemory: () => wasm.memory };\n}\n`,
  );
}

if (import.meta.main) {
  const packageDirectory = process.argv[2];
  if (!packageDirectory) throw new Error("Expected an engine package directory");
  await generateWasmFactory(packageDirectory);
}
