/**
 * The only script of a static docs page (`build:islands`). It hydrates each
 * island under the id the server gave it (islands/Island.tsx) and installs the
 * plain-DOM behaviour the root component installs with full hydration.
 */
import { installFigureTips } from "@docs/components/figures/figure-tips.ts";
import { initializeCodeEnhancements } from "@docs/lib/code-enhancements.ts";
import { installGridScrollHints } from "@docs/lib/grid-scroll-hint.ts";
import { forwardedHeading } from "@docs/lib/moved-headings.js";
import { installAnchorReveal, revealAnchoredMember } from "@docs/lib/reveal-anchor.ts";
import { inject as injectAnalytics } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";
import { type Component, createComponent, type JSX } from "solid-js";
import { hydrate } from "solid-js/web";
import { installExpressiveCodeScripts } from "virtual:expressive-code-scripts";

import { DocsSearch } from "../components/DocsSearch.js";
import { OutlineInline, OutlineRail } from "../components/TableOfContents.js";
import { ThemeToggle } from "../components/ThemeToggle.js";
import { installNavigationDrawer } from "../lib/navigation-drawer.js";
import type { IslandName } from "./Island.js";
import type { StaticRunnableCodeProps, StaticTabsProps } from "./StaticMarkup.js";

/** An island's root, from the props the server serialised for it and its own markup. */
type IslandRender = (island: HTMLElement, props: object) => JSX.Element;

function withProps<Props extends object>(component: Component<Props>): IslandRender {
 // The server wrote these props from the same component's props (Island.tsx).
 return (_island, props) => createComponent(component, props as Props);
}

/** Shell islands ship in this entry; content islands load on the pages that hold them. */
const ISLANDS: Readonly<Record<IslandName, () => Promise<IslandRender>>> = {
 search: async () => withProps(DocsSearch),
 theme: async () => withProps(ThemeToggle),
 "outline-rail": async () => withProps(OutlineRail),
 "outline-inline": async () => withProps(OutlineInline),
 "api-filter": () =>
  import("../components/ApiSymbolFilter.js").then(({ ApiSymbolFilter }) =>
   withProps(ApiSymbolFilter),
  ),
 "package-command": () =>
  import("../components/PackageCommand.js").then(({ PackageCommand }) =>
   withProps(PackageCommand),
  ),
 "live-grid": () =>
  import("../components/LiveGrid.js").then(({ LiveGrid }) => withProps(LiveGrid)),
 tabs: () =>
  import("./StaticMarkup.js").then(
   ({ StaticTabs, markupOf }): IslandRender =>
    (island, props) =>
     createComponent(StaticTabs, {
      ...(props as Omit<StaticTabsProps, "panels">),
      panels: markupOf(island),
     }),
  ),
 "runnable-code": () =>
  import("./StaticMarkup.js").then(
   ({ StaticRunnableCode, markupOf }): IslandRender =>
    (island, props) =>
     createComponent(StaticRunnableCode, {
      ...(props as Omit<StaticRunnableCodeProps, "html">),
      html: markupOf(island)[0] ?? "",
     }),
  ),
};

function isIslandName(name: string | undefined): name is IslandName {
 return name !== undefined && Object.hasOwn(ISLANDS, name);
}

async function hydrateIsland(island: HTMLElement): Promise<void> {
 const name = island.dataset.island;
 if (!isIslandName(name)) throw new Error(`Unknown island "${name ?? ""}"`);
 const render = await ISLANDS[name]();
 const props: object = JSON.parse(island.dataset.props ?? "{}");
 hydrate(() => render(island, props), island, { renderId: island.dataset.islandId ?? "" });
}

declare global {
 /** Solid's hydration registry; on fully hydrated pages HydrationScript creates it. */
 var _$HY:
  | { events: unknown[]; completed: WeakSet<Element>; r: Record<string, unknown> }
  | undefined;
}

// Static pages render no HydrationScript (routes/__root.tsx): islands replay no
// clicks made before they hydrate, so the registry starts empty and no
// capture listener holds events back from the islands' handlers.
globalThis._$HY ??= { events: [], completed: new WeakSet(), r: {} };
/** An old URL redirects here with its old #fragment; send that heading on (as the React site does). */
const forwarded = forwardedHeading(window.location.pathname, window.location.hash);
if (forwarded === undefined) {
 installNavigationDrawer();
 initializeCodeEnhancements();
 installExpressiveCodeScripts();
 installAnchorReveal();
 installGridScrollHints();
 installFigureTips();
 revealAnchoredMember();
 injectAnalytics({ framework: "solid" });
 injectSpeedInsights({ framework: "solid" });
 // After the first frame: the small bundle can arrive before the stylesheets
 // let the page paint, and hydrating then would hold the first paint back.
 requestAnimationFrame(() =>
  setTimeout(() => {
   Promise.all(
    Array.from(document.querySelectorAll<HTMLElement>("[data-island]"), hydrateIsland),
   ).then(
    () => {
     document.documentElement.dataset.hydrated = "true";
    },
    (error: unknown) => console.error("Docs islands failed to hydrate:", error),
   );
  }),
 );
} else {
 window.location.replace(forwarded);
}
