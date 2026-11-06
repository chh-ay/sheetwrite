import type { ExternalLinkResolver } from "./external-links.js";
import type { Grid } from "./types/grid.js";

/** The resolver each grid's Edit Links panel uses for Update Values. */
const RESOLVERS = new WeakMap<Grid, ExternalLinkResolver>();

/** The resolver connected to `grid`, if any. */
export function externalLinkResolverOf(grid: Grid): ExternalLinkResolver | undefined {
  return RESOLVERS.get(grid);
}

/** Connect `resolve` to `grid`; the returned function disconnects it. */
export function connectExternalLinkResolver(grid: Grid, resolve: ExternalLinkResolver): () => void {
  RESOLVERS.set(grid, resolve);
  return () => {
    if (RESOLVERS.get(grid) === resolve) RESOLVERS.delete(grid);
  };
}
