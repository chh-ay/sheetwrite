/// <reference types="vite/client" />

declare module "*.mdx" {
  import type { ComponentType } from "react";

  const Component: ComponentType;
  export default Component;
}

/** Expressive Code's code-block scripts; see `expressiveCodeAssets` in vite.config.ts. */
declare module "virtual:expressive-code-scripts" {
  export function installExpressiveCodeScripts(): void;
}

/** Formula family tables; see `formulaTables` in src/lib/formula-tables.ts. */
/** The landing page's speed story; see `speedStoryMarkup` in src/lib/speed-story-markup.ts. */
declare module "virtual:speed-story" {
  export const speedStoryHtml: string | null;
  export const speedStoryUrl: string | null;
}

declare module "virtual:formula-tables" {
  export function formulaTableHtml(family: string): string | null;
  export function formulaTableUrl(family: string): string | null;
}
