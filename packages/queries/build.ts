import { readFile, writeFile } from "node:fs/promises";

import {
  checkWasmFunctionSizes,
  WASM_FUNCTION_BUDGET_BYTES,
} from "../../scripts/wasm-function-sizes.js";

// The engine and the Power Query codec are separate lazy artifacts; both get the size guard.
const ARTIFACTS = [
  { label: "Query engine", path: "./pkg/sheetwrite_queries_bg.wasm" },
  { label: "Power Query codec", path: "./pkg-power-query/sheetwrite_power_query_bg.wasm" },
] as const;

for (const artifact of ARTIFACTS) {
  const wasmPath = new URL(artifact.path, import.meta.url);
  const { wasm, largestFunctions } = checkWasmFunctionSizes(await readFile(wasmPath));

  process.stdout.write(
    [
      `${artifact.label} WASM function budget: ${WASM_FUNCTION_BUDGET_BYTES} B`,
      ...largestFunctions.map((entry) => `${entry.bytes} B ${entry.name}`),
      "",
    ].join("\n"),
  );

  // Names are needed by the guard but do not belong in the shipped artifact.
  await writeFile(wasmPath, wasm);
}
