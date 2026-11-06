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
declare module "virtual:formula-tables" {
  export function formulaTableHtml(family: string): string | null;
  export function formulaTableUrl(family: string): string | null;
}
