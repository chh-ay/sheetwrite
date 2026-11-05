import type { Grid } from "@sheetwrite/core";

/** Where a showcase Grid paints: on the main thread or in a Web Worker. */
export type RenderingMode = ReturnType<Grid["rendererKind"]>;

/** Requested versus actually active paint backend, plus any fallback reason. */
export interface RendererState {
  requested: RenderingMode;
  active: RenderingMode;
  fallback: string | null;
}
