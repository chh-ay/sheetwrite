/**
 * The only script of a static docs page. It hydrates each island under the id
 * the server gave it (islands/Island.tsx) and installs the page's plain-DOM
 * behaviour: code hovers, copy buttons, anchors, scroll hints and figure tips.
 * The build's page-scripts step links it from every page.
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

import type { IslandName } from "./Island.js";
import type { StaticRunnableCodeProps, StaticTabsProps } from "./StaticMarkup.js";

/** An island's root, from the props the server serialised for it and its own markup. */
type IslandRender = (island: HTMLElement, props: object) => JSX.Element;

function withProps<Props extends object>(component: Component<Props>): IslandRender {
  // The server wrote these props from the same component's props (Island.tsx).
  return (_island, props) => createComponent(component, props as Props);
}

/** Each island's code loads only on the pages that hold it; page-scripts.ts preloads it there. */
const ISLANDS: Readonly<Record<IslandName, () => Promise<IslandRender>>> = {
  "package-command": () =>
    import("../components/PackageCommand.js").then(({ PackageCommand }) =>
      withProps(PackageCommand),
    ),
  "formula-reference": () =>
    import("../components/FormulaReference.js").then(({ FormulaFilter }) =>
      withProps(FormulaFilter),
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

function islandLoader(island: HTMLElement): () => Promise<IslandRender> {
  const name = island.dataset.island;
  if (!isIslandName(name)) throw new Error(`Unknown island "${name ?? ""}"`);
  return ISLANDS[name];
}

function hydrateWith(island: HTMLElement, render: IslandRender): void {
  const props: object = JSON.parse(island.dataset.props ?? "{}");
  hydrate(() => render(island, props), island, { renderId: island.dataset.islandId ?? "" });
}

async function hydrateIsland(island: HTMLElement): Promise<void> {
  hydrateWith(island, await islandLoader(island)());
}

/** Pointing at or focusing an interaction island fetches its code ahead of use. */
const PREFETCH_EVENTS = ["pointerover", "focusin"] as const;
/** Events an interaction island's code must see: held until it hydrates, then replayed. */
const ACTIVATION_EVENTS = ["pointerdown", "pointerup", "click", "keydown", "keyup"] as const;

/** Typing and caret placement in a text field work without the island's code. */
function isTextEntry(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return (
    target instanceof HTMLInputElement &&
    !["button", "checkbox", "color", "file", "image", "radio", "range", "reset", "submit"].includes(
      target.type,
    )
  );
}

/** Keys that move focus or belong to the browser, not to the widget. */
function isPassThroughKey(event: Event): boolean {
  return (
    event instanceof KeyboardEvent &&
    (event.key === "Tab" || event.altKey || event.ctrlKey || event.metaKey)
  );
}

/**
 * An island that hydrates on first use. Its server markup stands in until
 * then. The first activation loads its code; that event and any that follow
 * before hydration are held back and replayed on their original targets once
 * the island has hydrated, so a click or key press made while the code loads
 * acts once, as if the code had been there. Text fields keep working
 * natively; the island reads what was typed when it hydrates.
 */
function hydrateOnInteraction(island: HTMLElement): void {
  const load = islandLoader(island);
  let code: Promise<IslandRender> | undefined;
  const fetchCode = (): Promise<IslandRender> => (code ??= load());
  const held: Event[] = [];
  let hydrating = false;

  const prefetch = (): void => {
    void fetchCode();
  };
  const activate = (event: Event): void => {
    if (isPassThroughKey(event)) return;
    if (!isTextEntry(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      held.push(event);
    }
    if (hydrating) return;
    hydrating = true;
    fetchCode().then(
      (render) => {
        for (const type of PREFETCH_EVENTS) island.removeEventListener(type, prefetch);
        for (const type of ACTIVATION_EVENTS) island.removeEventListener(type, activate, true);
        hydrateWith(island, render);
        for (const event of held) {
          // The init dictionary reads key, button, pointerType and coordinates off the original.
          const replay = new (event.constructor as typeof Event)(event.type, event);
          event.target?.dispatchEvent(replay);
        }
      },
      (error: unknown) => console.error(`Docs island "${island.dataset.island}" failed:`, error),
    );
  };

  for (const type of PREFETCH_EVENTS) island.addEventListener(type, prefetch, { once: true });
  for (const type of ACTIVATION_EVENTS) island.addEventListener(type, activate, true);
}

declare global {
  /** Solid's hydration registry; on fully hydrated pages HydrationScript creates it. */
  var _$HY:
    | { events: unknown[]; completed: WeakSet<Element>; r: Record<string, unknown> }
    | undefined;
}

// Pages render no HydrationScript (routes/__root.tsx), so Solid's own replay
// of early clicks is off: its registry starts empty and no page-wide capture
// listener holds events back. Interaction islands hold and replay their own.
globalThis._$HY ??= { events: [], completed: new WeakSet(), r: {} };

/** An old URL redirects here with its old #fragment; send that heading on. */
const forwarded = forwardedHeading(window.location.pathname, window.location.hash);
if (forwarded === undefined) {
  initializeCodeEnhancements();
  installExpressiveCodeScripts();
  installAnchorReveal();
  installGridScrollHints();
  installFigureTips();
  revealAnchoredMember();
  injectAnalytics({ framework: "solid" });
  injectSpeedInsights({ framework: "solid" });
  // Interaction islands listen at once; nothing of theirs loads until used.
  const islands = Array.from(document.querySelectorAll<HTMLElement>("[data-island]"));
  const onLoad = islands.filter((island) => island.dataset.islandHydrate !== "interaction");
  for (const island of islands) {
    if (island.dataset.islandHydrate === "interaction") hydrateOnInteraction(island);
  }
  // After the first frame: the small bundle can arrive before the stylesheets
  // let the page paint, and hydrating then would hold the first paint back.
  requestAnimationFrame(() =>
    setTimeout(() => {
      Promise.all(onLoad.map(hydrateIsland)).then(
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
