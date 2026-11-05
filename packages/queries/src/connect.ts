import type { Grid } from "@sheetwrite/core";

import type { QuerySession, QuerySessionOptions } from "./session.js";
import type { QueryEngine } from "./types.js";

/** Shared by the browser and Node entry points, which differ only in artifact loading. */
export async function connect(
  grid: Grid,
  options: QuerySessionOptions,
  engine: QueryEngine,
): Promise<QuerySession> {
  // The session module loads with the engine, never with the package entry.
  const { createSessionWithEngine } = await import("./session.js");

  return createSessionWithEngine(grid, engine, options);
}
