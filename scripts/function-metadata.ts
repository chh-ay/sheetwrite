/**
 * Writes `packages/core/src/generated/function-metadata.ts`, the built-in
 * function table core loads for `listFunctions()`, formula help and Explain
 * Formula. The core build, typecheck and unit tests run this first, so the
 * table always matches the formula contract inventory and the engine source.
 */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { extractVolatileFunctions } from "./formula-contract.js";
import {
  loadFormulaContractInventory,
  loadFormulaReferenceEntries,
  renderFunctionMetadata,
} from "./formula-docs.js";
import { writeIfChanged } from "./script-io.js";

/** Repository-relative path of the generated table. */
const FUNCTION_METADATA_PATH = "packages/core/src/generated/function-metadata.ts";

/** Renders the table from the formula contract inventory, the engine's volatile functions and Excel's syntax lines. */
async function render_function_metadata_module(repository_root: string): Promise<string> {
  const [inventory, engine_types, engine_calc, reference] = await Promise.all([
    loadFormulaContractInventory(repository_root),
    readFile(join(repository_root, "packages/wasm/src/types.rs"), "utf8"),
    readFile(join(repository_root, "packages/wasm/src/calc/functions.rs"), "utf8"),
    loadFormulaReferenceEntries(repository_root),
  ]);
  return renderFunctionMetadata(
    inventory,
    new Set(extractVolatileFunctions(engine_types, engine_calc)),
    reference,
  );
}

/** Writes the table unless it is already current. */
export async function generateFunctionMetadata(repositoryRoot: string): Promise<void> {
  await writeIfChanged(
    join(repositoryRoot, FUNCTION_METADATA_PATH),
    await render_function_metadata_module(repositoryRoot),
  );
}

if (import.meta.main) {
  await generateFunctionMetadata(resolve(import.meta.dir, ".."));
}
