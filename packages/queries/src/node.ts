import { readFile } from "node:fs/promises";

import type { Grid, PowerQueryCodec } from "@sheetwrite/core";

import { connect } from "./connect.js";
import {
  loadPowerQueryCodec as loadCodecWithArtifact,
  loadQueryEngine as loadWithArtifact,
} from "./index.js";
import type { QueryEngineOptions, QuerySession, QuerySessionOptions } from "./index.js";
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

/** Node variant of `createQuerySession`; it reads the artifact from this package. */
export async function createQuerySession(
  grid: Grid,
  options: QuerySessionOptions & QueryEngineOptions,
): Promise<QuerySession> {
  return connect(grid, options, await loadQueryEngine(options));
}
