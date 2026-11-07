/// <reference types="vite/client" />

/** Expressive Code's code-block scripts; see `expressiveCodeAssets` in docs/vite.config.ts. */
declare module "virtual:expressive-code-scripts" {
  export function installExpressiveCodeScripts(): void;
}

/** Performance page figures; see `perfFigureMarkup` in docs/src/lib/perf-figure-markup.ts. */
declare module "virtual:perf-figures" {
  export function perfFigureHtml(name: string): string | null;
  export function perfFigureUrl(name: string): string | null;
}

/** Formula family tables; see `formulaTables` in docs/src/lib/formula-tables.ts. */
declare module "virtual:formula-tables" {
  export function formulaTableHtml(family: string): string | null;
  export function formulaTableUrl(family: string): string | null;
}
