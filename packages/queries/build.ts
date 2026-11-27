import { readFile, writeFile } from "node:fs/promises";

import {
  checkWasmFunctionSizes,
  WASM_FUNCTION_BUDGET_BYTES,
} from "../../scripts/wasm-function-sizes.js";

const wasm_path = new URL("./pkg/sheetwrite_queries_bg.wasm", import.meta.url);
const { wasm, largestFunctions: largest_functions } = checkWasmFunctionSizes(
  await readFile(wasm_path),
);

process.stdout.write(
  [
    `Query WASM function budget: ${WASM_FUNCTION_BUDGET_BYTES} B`,
    ...largest_functions.map((entry) => `${entry.bytes} B ${entry.name}`),
    "",
  ].join("\n"),
);

// The size check needs the function names; the shipped artifact does not.
// `checkWasmFunctionSizes` returns the module without its name section.
await writeFile(wasm_path, wasm);
