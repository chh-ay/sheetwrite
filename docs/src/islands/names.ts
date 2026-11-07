/** Every island a docs page can hold; islands/client.tsx has one loader per name. */
export type IslandName =
  | "search"
  | "theme"
  | "outline-rail"
  | "outline-inline"
  | "api-filter"
  | "tabs"
  | "package-command"
  | "formula-reference"
  | "live-grid"
  | "runnable-code";

/**
 * The module each content island loads on demand (islands/client.tsx imports
 * the same paths). The page-scripts step preloads them on the pages that hold
 * the island, so a widget's code arrives with the entry instead of after it.
 */
export const ON_DEMAND_ISLANDS: Readonly<Partial<Record<IslandName, string>>> = {
  "api-filter": "src/components/ApiSymbolFilter.tsx",
  tabs: "src/islands/StaticTabs.tsx",
  "package-command": "src/components/PackageCommand.tsx",
  "formula-reference": "src/components/FormulaReference.tsx",
  "live-grid": "src/components/LiveGrid.tsx",
  "runnable-code": "src/islands/StaticTabs.tsx",
};
