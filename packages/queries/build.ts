import { readFile, writeFile } from "node:fs/promises";

import {
  checkWasmFunctionSizes,
  WASM_FUNCTION_BUDGET_BYTES,
} from "../../scripts/wasm-function-sizes.js";

const wasmPath = new URL("./pkg/sheetwrite_queries_bg.wasm", import.meta.url);
const { wasm, largestFunctions } = checkWasmFunctionSizes(await readFile(wasmPath));

process.stdout.write(
  [
    `Query WASM function budget: ${WASM_FUNCTION_BUDGET_BYTES} B`,
    ...largestFunctions.map((entry) => `${entry.bytes} B ${entry.name}`),
    "",
  ].join("\n"),
);

// Names are needed by the guard but do not belong in the shipped artifact.
await writeFile(wasmPath, wasm);
