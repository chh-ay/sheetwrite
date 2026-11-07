import type { IslandRender } from "../islands/client.js";

/** The showcase pages' islands; islands/Island.tsx adds these names to every island name. */
export type ShowcaseIslandName = never;

export interface ShowcaseIsland {
  /** The module the island loads on demand (page-scripts.ts preloads it on the pages that hold it). */
  readonly source: string;
  readonly load: () => Promise<IslandRender>;
}

/** Each showcase island's module and loader; islands/client.tsx and page-scripts.ts read these. */
export const SHOWCASE_ISLANDS: Readonly<Record<ShowcaseIslandName, ShowcaseIsland>> = {};
