import { type Component, createComponent } from "solid-js";

import type { IslandRender } from "../islands/client.js";

export interface ShowcaseIsland {
  /** The module the island loads on demand (page-scripts.ts preloads it on the pages that hold it). */
  readonly source: string;
  readonly load: () => Promise<IslandRender>;
}

function withProps<Props extends object>(component: Component<Props>): IslandRender {
  // The server wrote these props from the same component's props (islands/Island.tsx).
  return (_island, props) => createComponent(component, props as Props);
}

/** Each showcase island's module and loader; islands/client.tsx and page-scripts.ts read these. */
export const SHOWCASE_ISLANDS = {
  "showcase-hub-filter": {
    source: "src/showcases/hub/HubFilter.tsx",
    load: () => import("./hub/HubFilter.js").then(({ HubFilter }) => withProps(HubFilter)),
  },
  "showcase-spreadsheet": {
    source: "src/showcases/spreadsheet/SpreadsheetStage.tsx",
    load: () =>
      import("./spreadsheet/SpreadsheetStage.js").then(({ SpreadsheetStage }) =>
        withProps(SpreadsheetStage),
      ),
  },
  "showcase-analysis": {
    source: "src/showcases/analysis/AnalysisStage.tsx",
    load: () =>
      import("./analysis/AnalysisStage.js").then(({ AnalysisStage }) => withProps(AnalysisStage)),
  },
} as const satisfies Readonly<Record<string, ShowcaseIsland>>;

/** The showcase pages' islands; islands/Island.tsx adds these names to every island name. */
export type ShowcaseIslandName = keyof typeof SHOWCASE_ISLANDS;
