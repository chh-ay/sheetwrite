import type { ExternalLinkSheet } from "./types/external-link.js";
import type { Grid } from "./types/grid.js";

/** What a resolver is asked for: one linked workbook and the sheets that formulas name. */
export interface ExternalLinkRequest {
  /** The file name formulas use, such as `Budget.xlsx`. */
  readonly book: string;
  /** Where the workbook is, as saved: a relative path, a file path or a URL. */
  readonly target: string;
  /** The sheets the workbook link holds now. */
  readonly sheets: readonly string[];
}

/**
 * Gives the current values of a linked workbook, as sheets with their cells,
 * or `null` when the workbook is not available. A rejected promise counts as
 * a failed update. The values replace all saved values of that link.
 */
export type ExternalLinkResolver = (
  request: ExternalLinkRequest,
) => Promise<ExternalLinkSheet[] | null>;

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
