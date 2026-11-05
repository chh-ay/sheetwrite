import { readFile } from "node:fs/promises";

import { loadQueryEngine as loadWithArtifact } from "./index.js";
import type { QueryEngineOptions } from "./index.js";
import type { QueryEngine } from "./types.js";

export * from "./index.js";

/** Node reads the optional artifact only on demand; source I/O still belongs to the host. */
export async function loadQueryEngine(options: QueryEngineOptions = {}): Promise<QueryEngine> {
  const wasm =
    options.wasm ?? (await readFile(new URL("../pkg/sheetwrite_queries_bg.wasm", import.meta.url)));

  return loadWithArtifact({ wasm });
}
