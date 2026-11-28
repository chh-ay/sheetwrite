import { copyFile, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { checkWasmFunctionSizes, WASM_FUNCTION_BUDGET_BYTES } from "./wasm-function-sizes.js";

/**
 * The JavaScript loaders that both engine packages publish. `packages/wasm` owns
 * them; every other engine package gets a copy at build time, so the loaders
 * cannot drift between engines.
 */
export const ENGINE_LOADER_FILES = [
  "loader.mjs",
  "loader-browser.mjs",
  "loader-node.mjs",
  "loader-state.mjs",
] as const;

const LOADER_SOURCE_DIRECTORY = resolve(import.meta.dir, "../packages/wasm");

/** Copy the loaders owned by `packages/wasm` into another engine package. */
export async function copyEngineLoaders(packageDirectory: string): Promise<void> {
  const target = resolve(packageDirectory);
  if (target === LOADER_SOURCE_DIRECTORY) return;

  await Promise.all(
    ENGINE_LOADER_FILES.map((file) =>
      copyFile(resolve(LOADER_SOURCE_DIRECTORY, file), resolve(target, file)),
    ),
  );
}

/**
 * The Rust documentation wasm-bindgen copies into the glue as JSDoc blocks. It
 * stays in the `.d.ts`. The shipped JavaScript drops it: it would be about 63%
 * of the Brotli bytes.
 */
const DOC_COMMENT = /^[ \t]*\/\*\*[\s\S]*?\*\/[ \t]*\n/gm;

/** Keep wasm-bindgen's closure-local caches and finalizers isolated per engine. */
export async function generateWasmFactory(packageDirectory: string): Promise<void> {
  const wasm_path = resolve(packageDirectory, "pkg/sheetwrite_wasm_bg.wasm");
  const { wasm, largestFunctions: largest_functions } = checkWasmFunctionSizes(
    await readFile(wasm_path),
  );
  process.stdout.write(
    [
      `WASM function sizes (${basename(resolve(packageDirectory))}; budget ${WASM_FUNCTION_BUDGET_BYTES} bytes)`,
      "| Bytes | Function |",
      "| ---: | --- |",
      ...largest_functions.map((entry) => `| ${entry.bytes} | ${entry.name} |`),
      "",
    ].join("\n"),
  );
  await writeFile(wasm_path, wasm);

  const glue_path = resolve(packageDirectory, "pkg/sheetwrite_wasm.js");
  const source = await readFile(glue_path, "utf8");
  const declarations = [...source.matchAll(/^export (?:class|function|const|let) (\w+)/gm)].map(
    (match) => match[1],
  );
  if (!declarations.includes("CellStore") || !/\bfunction initSync\b/.test(source)) {
    throw new Error(`Unrecognized wasm-bindgen exports in ${glue_path}`);
  }

  const implementation = source
    .replace(DOC_COMMENT, "")
    .replace(/^export (class|function|const|let) /gm, "$1 ")
    .replace(/^export \{[^}]*\};?\s*$/gm, "")
    .replace(/ptr => wasm\./g, "ptr => wasm?.")
    .replaceAll(
      "if (wasm !== undefined) return wasm;",
      "if (wasm !== undefined && wasm !== lazyWasm) return wasm;",
    );
  const exports = [...new Set([...declarations, "initSync"])];
  const memory_caches = [...source.matchAll(/^let (cached\w+Memory\d+) = null;/gm)].map(
    (match) => `${match[1]} = null;`,
  );
  if (memory_caches.length === 0) throw new Error(`Unrecognized memory caches in ${glue_path}`);

  const retire = `wasm = undefined; wasmInstance = undefined; wasmModule = undefined; ${memory_caches.join(" ")}`;
  await writeFile(
    resolve(packageDirectory, "pkg/sheetwrite_wasm_factory.js"),
    `// Generated from wasm-bindgen glue; do not edit.
// The lazy published exports use only the module adopted by the first ready engine,
// so a later engine built from another module cannot retarget them.
let publishedModule;

export function adoptPublishedModule(module) {
    publishedModule ??= module;
}

export function createInstance(lazy = false) {
let lazyWasm;
${implementation}
if (lazy) {
    // Public singleton exports stay synchronous without a second eager instance.
    lazyWasm = new Proxy({}, {
        get(_target, key) {
            if (!publishedModule) throw new Error("Sheetwrite: await load() or initSheetwrite() first");
            wasm = undefined;
            return initSync({ module: publishedModule })[key];
        },
    });
    wasm = lazyWasm;
}

return { ${exports.join(", ")}, init: __wbg_init, getModule: () => { if (!wasmModule) throw new Error("Engine is not initialized or has been retired"); return wasmModule; }, getMemory: () => { if (!wasm) throw new Error("Engine is not initialized or has been retired"); return wasm.memory; }, retire: () => { ${retire} } };
}
`,
  );

  // Preserve the published singleton exports without shipping a second copy of
  // the glue implementation. Core uses independent instances from the same factory.
  await writeFile(
    glue_path,
    `// Generated singleton loader; do not edit.\nimport { createInstance } from "./sheetwrite_wasm_factory.js";\nconst singleton = createInstance(true);\nexport const { ${exports.join(", ")} } = singleton;\nexport default singleton.init;\n`,
  );
}

if (import.meta.main) {
  const package_directory = process.argv[2];
  if (!package_directory) throw new Error("Expected an engine package directory");

  await generateWasmFactory(package_directory);
  await copyEngineLoaders(package_directory);
}
