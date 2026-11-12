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
  "showcase-performance": {
    source: "src/showcases/performance/PerformanceStage.tsx",
    load: () =>
      import("./performance/PerformanceStage.js").then(({ PerformanceStage }) =>
        withProps(PerformanceStage),
      ),
  },
  "showcase-performance-diagnostics": {
    source: "src/showcases/performance/PerformanceDiagnostics.tsx",
    load: () =>
      import("./performance/PerformanceDiagnostics.js").then(({ PerformanceDiagnostics }) =>
        withProps(PerformanceDiagnostics),
      ),
  },
  "showcase-database": {
    source: "src/showcases/database/DatabaseStage.tsx",
    load: () =>
      import("./database/DatabaseStage.js").then(({ DatabaseStage }) => withProps(DatabaseStage)),
  },
  "showcase-database-lab": {
    source: "src/showcases/database/DatabaseLab.tsx",
    load: () =>
      import("./database/DatabaseLab.js").then(({ DatabaseLab }) => withProps(DatabaseLab)),
  },
  "showcase-collaboration": {
    source: "src/showcases/collaboration/CollaborationStage.tsx",
    load: () =>
      import("./collaboration/CollaborationStage.js").then(({ CollaborationStage }) =>
        withProps(CollaborationStage),
      ),
  },
  "showcase-collaboration-faults": {
    source: "src/showcases/collaboration/CollaborationFaults.tsx",
    load: () =>
      import("./collaboration/CollaborationFaults.js").then(({ CollaborationFaults }) =>
        withProps(CollaborationFaults),
      ),
  },
  "showcase-interop": {
    source: "src/showcases/interop/InteropStage.tsx",
    load: () =>
      import("./interop/InteropStage.js").then(({ InteropStage }) => withProps(InteropStage)),
  },
  "showcase-interop-spill": {
    source: "src/showcases/interop/SpillProof.tsx",
    load: () => import("./interop/SpillProof.js").then(({ SpillProof }) => withProps(SpillProof)),
  },
  "showcase-interop-labs": {
    source: "src/showcases/interop/labs/InteropLabs.tsx",
    load: () =>
      import("./interop/labs/InteropLabs.js").then(({ InteropLabs }) => withProps(InteropLabs)),
  },
  "showcase-sort": {
    source: "src/showcases/sort/SortStage.tsx",
    load: () => import("./sort/SortStage.js").then(({ SortStage }) => withProps(SortStage)),
  },
  "showcase-functions": {
    source: "src/showcases/functions/FunctionsStage.tsx",
    load: () =>
      import("./functions/FunctionsStage.js").then(({ FunctionsStage }) =>
        withProps(FunctionsStage),
      ),
  },
  "showcase-recalculation": {
    source: "src/showcases/recalculation/RecalculationStage.tsx",
    load: () =>
      import("./recalculation/RecalculationStage.js").then(({ RecalculationStage }) =>
        withProps(RecalculationStage),
      ),
  },
  "showcase-recalculation-fact": {
    source: "src/showcases/recalculation/FirstCalculationFact.tsx",
    load: () =>
      import("./recalculation/FirstCalculationFact.js").then(({ FirstCalculationFact }) =>
        withProps(FirstCalculationFact),
      ),
  },
  "showcase-data-model": {
    source: "src/showcases/data-model/DataModelStage.tsx",
    load: () =>
      import("./data-model/DataModelStage.js").then(({ DataModelStage }) =>
        withProps(DataModelStage),
      ),
  },
  "showcase-dashboards": {
    source: "src/showcases/dashboards/DashboardsStage.tsx",
    load: () =>
      import("./dashboards/DashboardsStage.js").then(({ DashboardsStage }) =>
        withProps(DashboardsStage),
      ),
  },
  "showcase-dashboards-items": {
    source: "src/showcases/dashboards/ItemCountFact.tsx",
    load: () =>
      import("./dashboards/ItemCountFact.js").then(({ ItemCountFact }) => withProps(ItemCountFact)),
  },
  "showcase-queries": {
    source: "src/showcases/queries/QueriesStage.tsx",
    load: () =>
      import("./queries/QueriesStage.js").then(({ QueriesStage }) => withProps(QueriesStage)),
  },
  "showcase-version-history": {
    source: "src/showcases/version-history/VersionHistoryStage.tsx",
    load: () =>
      import("./version-history/VersionHistoryStage.js").then(({ VersionHistoryStage }) =>
        withProps(VersionHistoryStage),
      ),
  },
  "workbench-vanilla": {
    source: "src/showcases/frameworks/vanilla/VanillaWorkbench.tsx",
    load: () =>
      import("./frameworks/vanilla/VanillaWorkbench.js").then(({ VanillaWorkbench }) =>
        withProps(VanillaWorkbench),
      ),
  },
  "workbench-react": {
    source: "src/showcases/frameworks/FrameworkMount.tsx",
    load: () =>
      import("./frameworks/FrameworkMount.js").then(({ ReactWorkbenchIsland }) =>
        withProps(ReactWorkbenchIsland),
      ),
  },
  "workbench-vue": {
    source: "src/showcases/frameworks/FrameworkMount.tsx",
    load: () =>
      import("./frameworks/FrameworkMount.js").then(({ VueWorkbenchIsland }) =>
        withProps(VueWorkbenchIsland),
      ),
  },
  "workbench-svelte": {
    source: "src/showcases/frameworks/FrameworkMount.tsx",
    load: () =>
      import("./frameworks/FrameworkMount.js").then(({ SvelteWorkbenchIsland }) =>
        withProps(SvelteWorkbenchIsland),
      ),
  },
} as const satisfies Readonly<Record<string, ShowcaseIsland>>;

/** The showcase pages' islands; islands/Island.tsx adds these names to every island name. */
export type ShowcaseIslandName = keyof typeof SHOWCASE_ISLANDS;
