import { readFile } from "node:fs/promises";

import type { PowerQueryCodec, SheetwriteAddon } from "@sheetwrite/core";

import { createQueriesAddon, type QueriesAddonOptions, type QueryEngineOptions } from "./addon.js";
import {
  loadPowerQueryCodec as loadCodecWithArtifact,
  loadQueryEngine as loadWithArtifact,
} from "./index.js";
import type { QueryEngine } from "./types.js";

export * from "./index.js";

async function artifact(options: QueryEngineOptions): Promise<QueryEngineOptions> {
  return {
    wasm:
      options.wasm ??
      (await readFile(new URL("../pkg/sheetwrite_queries_bg.wasm", import.meta.url))),
  };
}

/** Node reads the optional artifact only on demand; source I/O still belongs to the host. */
export async function loadQueryEngine(options: QueryEngineOptions = {}): Promise<QueryEngine> {
  return loadWithArtifact(await artifact(options));
}

/** Node variant of `loadPowerQueryCodec`; it reads the artifact from this package. */
export async function loadPowerQueryCodec(
  options: QueryEngineOptions = {},
): Promise<PowerQueryCodec> {
  return loadCodecWithArtifact(await artifact(options));
}

/** Node variant of `queriesAddon`; it reads the artifact from this package. */
export function queriesAddon(
  options: QueriesAddonOptions = {},
): SheetwriteAddon<QueriesAddonOptions> {
  return createQueriesAddon(loadQueryEngine, options);
}
