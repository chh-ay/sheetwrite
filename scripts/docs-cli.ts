/**
 * `bun run docs:generate` and `bun run docs:check`.
 *
 * The docs generator imports the site's navigation and moved-page modules,
 * which import generated JSON. This entry writes that JSON first, from the
 * same sources the generator uses, and only then loads the generator, so
 * both modes work in a checkout that has never generated docs. Package
 * declarations must be built first: the API pages read them. `generate` also
 * writes core's function table, because the site compiles core's sources.
 */
import { resolve } from "node:path";

import { siteDataFiles } from "./docs-site-data.js";
import { loadFormulaContractInventory, renderFormulaFunctionPages } from "./formula-docs.js";
import { generateFunctionMetadata } from "./function-metadata.js";
import { analyzePublicApi } from "./public-api.js";
import { writeIfChanged } from "./script-io.js";

const USAGE = "Usage: bun scripts/docs-cli.ts <generate|check>";

/** Runs one docs mode and returns its summary line. */
async function runDocs(mode: string | undefined): Promise<string> {
  if (mode !== "generate" && mode !== "check") throw new Error(USAGE);
  const repositoryRoot = resolve(import.meta.dir, "..");
  const analysis = await analyzePublicApi(repositoryRoot);
  const formulaPages = renderFormulaFunctionPages(
    await loadFormulaContractInventory(repositoryRoot),
  );
  for (const file of siteDataFiles(analysis.manifest, formulaPages)) {
    await writeIfChanged(file.path, file.content);
  }
  // Loaded after the JSON above exists: a static import would fail to resolve it.
  const { generateDocs, verifyDocs } = await import("./docs.js");
  if (mode === "check") return verifyDocs(analysis);
  await generateFunctionMetadata(repositoryRoot);
  return generateDocs(analysis);
}

if (import.meta.main) {
  process.stdout.write(`${await runDocs(process.argv[2])}\n`);
}
