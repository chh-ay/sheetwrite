import { readFile } from "node:fs/promises";

import type { Grid, PowerQueryCodec } from "@sheetwrite/core";

import { connect } from "./connect.js";
import {
  loadPowerQueryCodec as loadCodecWithArtifact,
  loadQueryEngine as loadWithArtifact,
} from "./index.js";
import type {
  PowerQueryCodecOptions,
  QueryEngineOptions,
  QuerySession,
  QuerySessionOptions,
} from "./index.js";
import type { QueryEngine } from "./types.js";

export * from "./index.js";

/** Node reads optional artifacts only on demand; source I/O still belongs to the host. */
export async function loadQueryEngine(options: QueryEngineOptions = {}): Promise<QueryEngine> {
  const wasm =
    options.wasm ?? (await readFile(new URL("../pkg/sheetwrite_queries_bg.wasm", import.meta.url)));

  return loadWithArtifact({ wasm });
}

/** Node variant of `loadPowerQueryCodec`; it reads the codec artifact from this package. */
export async function loadPowerQueryCodec(
  options: PowerQueryCodecOptions = {},
): Promise<PowerQueryCodec> {
  const wasm =
    options.wasm ??
    (await readFile(new URL("../pkg-power-query/sheetwrite_power_query_bg.wasm", import.meta.url)));

  return loadCodecWithArtifact({ wasm });
}

/** Node variant of `createQuerySession`; it reads the artifact from this package. */
export async function createQuerySession(
  grid: Grid,
  options: QuerySessionOptions & QueryEngineOptions,
): Promise<QuerySession> {
  return connect(grid, options, await loadQueryEngine(options));
}
