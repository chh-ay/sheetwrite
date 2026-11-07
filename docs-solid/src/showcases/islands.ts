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
  "showcase-data-tools": {
    source: "src/showcases/data-tools/DataToolsStage.tsx",
    load: () =>
      import("./data-tools/DataToolsStage.js").then(({ DataToolsStage }) =>
        withProps(DataToolsStage),
      ),
  },
  "showcase-data-events": {
    source: "src/showcases/data-tools/DataEvents.tsx",
    load: () =>
      import("./data-tools/DataEvents.js").then(({ DataEvents }) => withProps(DataEvents)),
  },
  "showcase-formulas": {
    source: "src/showcases/formulas/FormulasStage.tsx",
    load: () =>
      import("./formulas/FormulasStage.js").then(({ FormulasStage }) => withProps(FormulasStage)),
  },
  "showcase-formatting": {
    source: "src/showcases/formatting/FormattingStage.tsx",
    load: () =>
      import("./formatting/FormattingStage.js").then(({ FormattingStage }) =>
        withProps(FormattingStage),
      ),
  },
  "showcase-formatting-imported": {
    source: "src/showcases/formatting/FormattingImported.tsx",
    load: () =>
      import("./formatting/FormattingImported.js").then(({ FormattingImported }) =>
        withProps(FormattingImported),
      ),
  },
  "showcase-host-rows": {
    source: "src/showcases/host-rows/HostRowsStage.tsx",
    load: () =>
      import("./host-rows/HostRowsStage.js").then(({ HostRowsStage }) => withProps(HostRowsStage)),
  },
} as const satisfies Readonly<Record<string, ShowcaseIsland>>;

/** The showcase pages' islands; islands/Island.tsx adds these names to every island name. */
export type ShowcaseIslandName = keyof typeof SHOWCASE_ISLANDS;
