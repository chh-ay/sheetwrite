/**
 * The only script of a static docs page. The page arrives as finished HTML
 * (routes/docs.$.tsx renders it at build time); this hydrates each island as
 * its own React root and installs the plain-DOM behaviour the router app's
 * root runs on other pages. Built by vite.islands.config.ts; the build's
 * islands step (islands/page-scripts.ts) puts it in every docs page.
 */
import { inject as injectAnalytics } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";
import { type ComponentType, type ReactNode, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";
import { installExpressiveCodeScripts } from "virtual:expressive-code-scripts";

import { DocsSearch } from "../components/DocsSearch.js";
import { installFigureTips } from "../components/figures/figure-tips.ts";
import { OutlineInline, OutlineRail } from "../components/TableOfContents.js";
import { ThemeToggle } from "../components/ThemeToggle.js";
import { initializeCodeEnhancements } from "../lib/code-enhancements.ts";
import { installGridScrollHints } from "../lib/grid-scroll-hint.ts";
import { forwardedHeading } from "../lib/moved-headings.js";
import { installNavigationDrawer } from "../lib/navigation-drawer.js";
import { installAnchorReveal, revealAnchoredMember } from "../lib/reveal-anchor.ts";
import type { IslandName } from "./names.js";
import type { StaticRunnableCodeProps, StaticTabsProps } from "./StaticTabs.js";

/** An island's component with the props the server serialised for it. */
type IslandRender = (island: HTMLElement, props: object) => ReactNode;

function withProps<Props extends object>(Component: ComponentType<Props>): IslandRender {
  // The server wrote these props from the same component's props (Island.tsx).
  return (_island, props) => <Component {...(props as Props)} />;
}

/**
 * Every island by name. The shell's islands are on every page and ship in
 * this entry; content islands load only on the pages that hold them, and the
 * islands step preloads their chunks there.
 */
const ISLANDS: Readonly<Record<IslandName, () => Promise<IslandRender>>> = {
  search: async () => withProps(DocsSearch),
  theme: async () => withProps(ThemeToggle),
  "outline-rail": async () => withProps(OutlineRail),
  "outline-inline": async () => withProps(OutlineInline),
  "api-filter": () =>
    import("../components/ApiSymbolFilter.js").then(({ ApiSymbolFilter }) =>
      withProps(ApiSymbolFilter),
    ),
  tabs: () =>
    import("./StaticTabs.js").then(({ StaticTabs, panelsOf }): IslandRender => (island, props) => (
      // The panels stay out of the serialised props; they are the island's own markup.
      <StaticTabs {...(props as Omit<StaticTabsProps, "panels">)} panels={panelsOf(island)} />
    )),
  "package-command": () =>
    import("../components/PackageCommand.js").then(({ PackageCommand }) =>
      withProps(PackageCommand),
    ),
  "formula-reference": () =>
    import("../components/FormulaReference.js").then(({ FormulaReference }) =>
      withProps(FormulaReference),
    ),
  "live-grid": () =>
    import("../components/LiveGrid.js").then(({ LiveGrid }) => withProps(LiveGrid)),
  "runnable-code": () =>
    import("./StaticTabs.js").then(
      ({ StaticRunnableCode, runnableMarkupOf }): IslandRender =>
        (island, props) => (
          // The code block stays out of the serialised props; it is the island's own markup.
          <StaticRunnableCode
            {...(props as Omit<StaticRunnableCodeProps, "html">)}
            html={runnableMarkupOf(island)}
          />
        ),
    ),
};

function isIslandName(name: string | undefined): name is IslandName {
  return name !== undefined && Object.hasOwn(ISLANDS, name);
}

/** Reports its root's first commit, so the page knows when every island listens. */
function Committed({
  children,
  onCommit,
}: Readonly<{ children: ReactNode; onCommit: () => void }>) {
  useEffect(onCommit, [onCommit]);
  return children;
}

async function hydrateIsland(island: HTMLElement): Promise<void> {
  const name = island.dataset.island;
  if (!isIslandName(name)) throw new Error(`Unknown island "${name ?? ""}"`);
  const render = await ISLANDS[name]();
  const props: object = JSON.parse(island.dataset.props ?? "{}");
  const element = render(island, props);
  const { promise: committed, resolve } = Promise.withResolvers<void>();
  hydrateRoot(island, <Committed onCommit={resolve}>{element}</Committed>, {
    onRecoverableError: (error) => console.error(`Island "${name}" re-rendered:`, error),
  });
  return committed;
}

function hydrateIslands(): Promise<void> {
  const islands = Array.from(document.querySelectorAll<HTMLElement>("[data-island]"));
  return Promise.all(islands.map(hydrateIsland)).then(() => undefined);
}

/** An old URL redirects here with its old #fragment; send that heading on. */
function forwardMovedHeading(): boolean {
  const forwarded = forwardedHeading(window.location.pathname, window.location.hash);
  if (forwarded === undefined) return false;
  window.location.replace(forwarded);
  return true;
}

if (!forwardMovedHeading()) {
  installNavigationDrawer();
  initializeCodeEnhancements();
  installExpressiveCodeScripts();
  installAnchorReveal();
  installGridScrollHints();
  installFigureTips();
  revealAnchoredMember();
  injectAnalytics({ framework: "islands" });
  injectSpeedInsights({ framework: "islands" });
  hydrateIslands().then(
    () => {
      document.documentElement.dataset.hydrated = "true";
    },
    (error: unknown) => console.error("Docs islands failed to hydrate:", error),
  );
}
