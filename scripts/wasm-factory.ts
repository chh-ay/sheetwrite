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
    .replace(/^export \{[^}]*\};?\s*$/gm, "")
    .replace(/ptr => wasm\./g, "ptr => wasm?.")
    .replace(
      "wasmModule = module;",
      "wasmModule = module;\n    if (lazy) adoptPublishedModule(module);",
    )
    .replaceAll(
      "if (wasm !== undefined) return wasm;",
      "if (wasm !== undefined && wasm !== lazyWasm) return wasm;",
    );
  const exports = [...new Set([...declarations, "initSync"])];
  const memoryCaches = [...source.matchAll(/^let (cached\w+Memory\d+) = null;/gm)].map(
    (match) => `${match[1]} = null;`,
  );
  if (memoryCaches.length === 0) throw new Error(`Unrecognized memory caches in ${gluePath}`);

  const retire = `wasm = undefined; wasmInstance = undefined; wasmModule = undefined; ${memoryCaches.join(" ")}`;
  await writeFile(
    resolve(packageDirectory, "pkg/sheetwrite_wasm_factory.js"),
    `// Generated from wasm-bindgen glue; do not edit.
// The published exports use only the first module adopted by load() or by the first
// ready engine, so a later engine built from another module cannot retarget them.
let publishedModule;

export function adoptPublishedModule(module) {
    publishedModule ??= module;
}

export function createPublishedInstance() {
    if (!publishedModule) throw new Error("Sheetwrite: await load() or initSheetwrite() first");

    const engine = createInstance();
    engine.initSync({ module: publishedModule });
    return engine;
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
    gluePath,
    `// Generated singleton loader; do not edit.\nimport { createInstance } from "./sheetwrite_wasm_factory.js";\nconst singleton = createInstance(true);\nexport const { ${exports.join(", ")} } = singleton;\nexport default singleton.init;\n`,
  );
}

if (import.meta.main) {
  const packageDirectory = process.argv[2];
  if (!packageDirectory) throw new Error("Expected an engine package directory");

  await generateWasmFactory(packageDirectory);
}
