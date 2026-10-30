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
