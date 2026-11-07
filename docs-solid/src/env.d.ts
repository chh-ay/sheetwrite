/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set by vite.config.ts: static pages with islands, or full hydration. */
  readonly DOCS_SOLID_ISLANDS: boolean;
}

/** Expressive Code's code-block scripts; see `expressiveCodeAssets` in docs/vite.config.ts. */
declare module "virtual:expressive-code-scripts" {
  export function installExpressiveCodeScripts(): void;
}

/** Performance page figures; see `perfFigureMarkup` in docs/src/lib/perf-figure-markup.ts. */
declare module "virtual:perf-figures" {
  export function perfFigureHtml(name: string): string | null;
  export function perfFigureUrl(name: string): string | null;
}
