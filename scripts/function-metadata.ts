/**
 * Writes `packages/core/src/generated/function-metadata.ts`, the built-in
 * function table core loads for `listFunctions()`, formula help and Explain
 * Formula. The core build, typecheck and unit tests run this first, so the
 * table always matches the formula contract inventory and the engine source.
 */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { extractVolatileFunctions } from "./formula-contract.js";
import { loadFormulaContractInventory, renderFunctionMetadata } from "./formula-docs.js";
import { writeIfChanged } from "./script-io.js";

/** Repository-relative path of the generated table. */
const FUNCTION_METADATA_PATH = "packages/core/src/generated/function-metadata.ts";

/** Renders the table from the formula contract inventory and the engine's volatile functions. */
async function renderFunctionMetadataModule(repositoryRoot: string): Promise<string> {
  const [inventory, engineTypes, engineCalc] = await Promise.all([
    loadFormulaContractInventory(repositoryRoot),
    readFile(join(repositoryRoot, "packages/wasm/src/types.rs"), "utf8"),
    readFile(join(repositoryRoot, "packages/wasm/src/calc.rs"), "utf8"),
  ]);
  return renderFunctionMetadata(
    inventory,
    new Set(extractVolatileFunctions(engineTypes, engineCalc)),
  );
}

/** Writes the table unless it is already current. */
async function generateFunctionMetadata(repositoryRoot: string): Promise<void> {
  await writeIfChanged(
    join(repositoryRoot, FUNCTION_METADATA_PATH),
    await renderFunctionMetadataModule(repositoryRoot),
  );
}

if (import.meta.main) {
  await generateFunctionMetadata(resolve(import.meta.dir, ".."));
}
