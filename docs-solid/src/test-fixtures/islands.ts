import type { ShowcaseIsland } from "../showcases/islands.js";

/*
 * The browser tests' fixture pages (src/routes/test.*.tsx) each run as one
 * island that mounts its fixture in the browser. The pages are prerendered
 * only in a test build (vite.config.ts, SHEETWRITE_DOCS_FIXTURES=1), so none
 * of this ships on the published site; islands/client.tsx and page-scripts.ts
 * read these entries as they read the showcases'.
 */

/** Each fixture island's module and loader. */
export const TEST_FIXTURE_ISLANDS = {} as const satisfies Readonly<Record<string, ShowcaseIsland>>;

export type TestFixtureIslandName = keyof typeof TEST_FIXTURE_ISLANDS;
