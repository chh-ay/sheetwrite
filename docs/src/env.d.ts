/// <reference types="vite/client" />

declare module "*.mdx" {
  import type { ComponentType } from "react";

  import type { DocumentComponents, DocumentFrontmatter } from "./lib/content.js";

  const Component: ComponentType<{ components?: DocumentComponents }>;
  export default Component;
  /** The page's frontmatter, with the outline the build adds. */
  export const frontmatter: DocumentFrontmatter;
  /** Stylesheets of the rare components the page uses; see lib/content-components.ts. */
  export const stylesheets: readonly string[];
}

/** Expressive Code's code-block scripts; see `expressiveCodeAssets` in vite.config.ts. */
declare module "virtual:expressive-code-scripts" {
  export function installExpressiveCodeScripts(): void;
}

/** Formula family tables; see `formulaTables` in src/lib/formula-tables.ts. */
/** The landing page's speed story; see `speedStoryMarkup` in src/lib/speed-story-markup.ts. */
/** Performance page figures; see `perfFigureMarkup` in src/lib/perf-figure-markup.ts. */
declare module "virtual:perf-figures" {
  export function perfFigureHtml(name: string): string | null;
  export function perfFigureUrl(name: string): string | null;
}

declare module "virtual:speed-story" {
  export const speedStoryHtml: string | null;
  export const speedStoryUrl: string | null;
}

declare module "virtual:formula-tables" {
  export function formulaTableHtml(family: string): string | null;
  export function formulaTableUrl(family: string): string | null;
}
