import { type Component, createComponent } from "solid-js";

import type { IslandRender } from "../islands/client.js";
import type { ShowcaseIsland } from "../showcases/islands.js";

/*
 * The browser tests' fixture pages (src/routes/test.*.tsx) each run as one
 * island that mounts its fixture in the browser. The pages are prerendered
 * only in a test build (vite.config.ts, SHEETWRITE_DOCS_FIXTURES=1), so none
 * of this ships on the published site; islands/client.tsx and page-scripts.ts
 * read these entries as they read the showcases'.
 */

function withProps<Props extends object>(component: Component<Props>): IslandRender {
  // The server wrote these props from the same component's props (islands/Island.tsx).
  return (_island, props) => createComponent(component, props as Props);
}

/** Each fixture island's module and loader. */
export const TEST_FIXTURE_ISLANDS = {
  "test-xlsx": {
    source: "src/test-fixtures/xlsx/XlsxFixture.tsx",
    load: () => import("./xlsx/XlsxFixture.js").then(({ XlsxFixture }) => withProps(XlsxFixture)),
  },
  "test-formulas-engine": {
    source: "src/test-fixtures/formulas-engine/FormulasEngineFixture.tsx",
    load: () =>
      import("./formulas-engine/FormulasEngineFixture.js").then(({ FormulasEngineFixture }) =>
        withProps(FormulasEngineFixture),
      ),
  },
  "test-collaboration": {
    source: "src/test-fixtures/collaboration/CollaborationFixture.tsx",
    load: () =>
      import("./collaboration/CollaborationFixture.js").then(({ CollaborationFixture }) =>
        withProps(CollaborationFixture),
      ),
  },
} as const satisfies Readonly<Record<string, ShowcaseIsland>>;

export type TestFixtureIslandName = keyof typeof TEST_FIXTURE_ISLANDS;
