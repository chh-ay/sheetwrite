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
import { type Component, createComponent, type JSX, sharedConfig } from "solid-js";
import { hydrate } from "solid-js/web";
import { installExpressiveCodeScripts } from "virtual:expressive-code-scripts";

import { installDocsShell } from "../lib/shell.js";
import { SHOWCASE_ISLANDS, type ShowcaseIsland } from "../showcases/islands.js";
import type { CoreIslandName, IslandName } from "./Island.js";
import type { StaticRunnableCodeProps, StaticTabsProps } from "./StaticMarkup.js";

/** An island's root, from the props the server serialised for it and its own markup. */
export type IslandRender = (island: HTMLElement, props: object) => JSX.Element;

function withProps<Props extends object>(component: Component<Props>): IslandRender {
  // The server wrote these props from the same component's props (Island.tsx).
  return (_island, props) => createComponent(component, props as Props);
}

/** Each island's code loads only on the pages that hold it; page-scripts.ts preloads it there. */
const CORE_ISLANDS: Readonly<Record<CoreIslandName, () => Promise<IslandRender>>> = {
  "activation-fixture": () =>
    import("./ActivationFixture.js").then(({ ActivationFixture }) => withProps(ActivationFixture)),
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
  search: () =>
    import("../components/DocsSearch.js").then(({ DocsSearch }) => withProps(DocsSearch)),
  "api-symbol-filter": () =>
    import("../components/ApiSymbolFilter.js").then(({ ApiSymbolFilter }) =>
      withProps(ApiSymbolFilter),
    ),
  "landing-hero": () =>
    import("../components/landing/HeroApp.js").then(({ HeroApp }) => withProps(HeroApp)),
  "landing-architecture": () =>
    import("../components/landing/ArchitectureScene.js").then(({ ArchitectureScene }) =>
      withProps(ArchitectureScene),
    ),
  "landing-stories": () =>
    import("../components/landing/StoryReel.js").then(({ StoryReel }) => withProps(StoryReel)),
  "landing-code": () =>
    Promise.all([import("../components/landing/CodeTabs.js"), import("./markup.js")]).then(
      ([{ CodeTabs }, { markupOf }]): IslandRender =>
        (island) =>
          createComponent(CodeTabs, { panels: markupOf(island) }),
    ),
};

const ISLANDS: Readonly<Record<IslandName, () => Promise<IslandRender>>> = {
  ...CORE_ISLANDS,
  ...(Object.fromEntries(
    Object.entries<ShowcaseIsland>(SHOWCASE_ISLANDS).map(([name, island]) => [name, island.load]),
  ) as Record<keyof typeof SHOWCASE_ISLANDS, () => Promise<IslandRender>>),
};

function isIslandName(name: string | undefined): name is IslandName {
  return name !== undefined && Object.hasOwn(ISLANDS, name);
}

function islandLoader(island: HTMLElement): () => Promise<IslandRender> {
  const name = island.dataset.island;
  if (!isIslandName(name)) throw new Error(`Unknown island "${name ?? ""}"`);
  return ISLANDS[name];
}

/**
 * Each island is its own hydration root. Solid marks a page's hydration done
 * at the first delegated event after one starts (its event handler sets
 * `_$HY.done`), and from then on `hydrate` renders anew instead of adopting
 * the server's nodes. An island that hydrates later, on first use, starts its
 * own hydration again.
 */
function beginHydration(): void {
  const registry = (globalThis._$HY ??= { events: [], completed: new WeakSet(), r: {} });
  registry.done = false;
  registry.events ??= [];
  registry.completed ??= new WeakSet();
  sharedConfig.done = false;
}

function hydrateWith(island: HTMLElement, render: IslandRender): void {
  const props: object = JSON.parse(island.dataset.props ?? "{}");
  beginHydration();
  hydrate(() => render(island, props), island, { renderId: island.dataset.islandId ?? "" });
}

async function hydrateIsland(island: HTMLElement): Promise<void> {
  hydrateWith(island, await islandLoader(island)());
}

/** Pointing at or focusing an interaction island fetches its code ahead of use. */
const PREFETCH_EVENTS = ["pointerover", "focusin"] as const;
/**
 * Events an interaction island's code must see: held until it hydrates, then
 * replayed. Typing into a field (`input` included, which pasting and
 * autofill send without keys) hydrates it too; the island reads the field.
 */
const ACTIVATION_EVENTS = [
  "pointerdown",
  "pointerup",
  "click",
  "keydown",
  "keyup",
  "input",
] as const;

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

/** Elements the browser clicks when they have focus and the reader presses Space. */
const CLICKED_BY_SPACE = [
  "button",
  "summary",
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="submit"]',
  'input[type="button"]',
  'input[type="reset"]',
  'input[type="image"]',
].join(", ");

/** Elements the browser clicks when they have focus and the reader presses Enter. */
const CLICKED_BY_ENTER = [
  "button",
  "summary",
  "a[href]",
  'input[type="submit"]',
  'input[type="button"]',
  'input[type="reset"]',
  'input[type="image"]',
].join(", ");

/**
 * Enter or Space on an element the browser activates itself. The browser
 * turns the key into a trusted click, which is held and replayed like a
 * pointer's; a replayed key is untrusted and would never click. An element
 * that only has a button role gets no click from the browser: its own key
 * handler acts, so its keys are held and replayed as usual.
 */
function isNativeActivationKey(event: Event): boolean {
  return (
    event instanceof KeyboardEvent &&
    event.target instanceof Element &&
    ((event.key === " " && event.target.matches(CLICKED_BY_SPACE)) ||
      (event.key === "Enter" && event.target.matches(CLICKED_BY_ENTER)))
  );
}

/** Keys that move focus or belong to the browser, not to the widget. */
function isPassThroughKey(event: Event): boolean {
  return (
    event instanceof KeyboardEvent &&
    (event.key === "Tab" || event.altKey || event.ctrlKey || event.metaKey)
  );
}

/** After the page's load event, once the browser has nothing else to do. */
function whenIdleAfterLoad(run: () => void): void {
  const idle = (): void => {
    if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 2_000 });
    else setTimeout(run, 200);
  };
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}

/**
 * Fetches an interaction island's code (`data-island-code`, written by
 * page-scripts.ts) at low priority once the island is on screen and the page
 * is idle, so its first use doesn't wait for the network. The module preloads
 * fill the module map; the island's own import then reuses them.
 */
function prefetchWhenVisible(island: HTMLElement): void {
  const files = island.dataset.islandCode?.split(" ").filter(Boolean) ?? [];
  // The island's wrapper has no box (display: contents); its content does.
  const boxes = Array.from(island.children);
  if (files.length === 0 || boxes.length === 0) return;
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    whenIdleAfterLoad(() => {
      for (const file of files) {
        if (document.head.querySelector(`link[rel="modulepreload"][href="${file}"]`)) continue;
        const link = document.createElement("link");
        link.rel = "modulepreload";
        link.fetchPriority = "low";
        link.href = file;
        document.head.append(link);
      }
    });
  });
  for (const box of boxes) observer.observe(box);
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
    if (isPassThroughKey(event) || isNativeActivationKey(event)) return;
    if (!isTextEntry(event.target)) {
      // Pointer presses keep their default, so a touch still produces its
      // click (and focuses what it presses); clicks and keys are held whole.
      // Chromium dispatches clicks as PointerEvents, so the test is the type.
      if (event.type !== "pointerdown" && event.type !== "pointerup") event.preventDefault();
      event.stopImmediatePropagation();
      held.push(event);
    }
    if (hydrating) return;
    hydrating = true;
    fetchCode().then(
      (render) =>
        // Code already fetched resolves while the first event is still being
        // dispatched: a canceled click on a checkbox restores its state only
        // after that. Hydrating and replaying in a later task keeps the
        // replayed click from being undone; events until then are held too.
        setTimeout(() => {
          for (const type of PREFETCH_EVENTS) island.removeEventListener(type, prefetch);
          for (const type of ACTIVATION_EVENTS) island.removeEventListener(type, activate, true);
          hydrateWith(island, render);
          for (const event of held) {
            // The init dictionary reads key, button, pointerType and coordinates off the original.
            const replay = new (event.constructor as typeof Event)(event.type, event);
            event.target?.dispatchEvent(replay);
          }
        }),
      (error: unknown) => console.error(`Docs island "${island.dataset.island}" failed:`, error),
    );
  };

  for (const type of PREFETCH_EVENTS) island.addEventListener(type, prefetch, { once: true });
  for (const type of ACTIVATION_EVENTS) island.addEventListener(type, activate, true);
  prefetchWhenVisible(island);
}

declare global {
  /** Solid's hydration registry; on fully hydrated pages HydrationScript creates it. */
  var _$HY:
    | {
        events: unknown[] | null;
        completed: WeakSet<Element> | null;
        r: Record<string, unknown>;
        done?: boolean;
      }
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
  installDocsShell();
  if (document.querySelector(".sw-landing") !== null) {
    void import("../lib/landing.js").then(({ installLanding }) => installLanding());
  }
  revealAnchoredMember();
  injectAnalytics({ framework: "solid" });
  injectSpeedInsights({ framework: "solid" });
  // Interaction islands listen at once; their code loads ahead or on first use,
  // or at load when the URL deep-links into one (`data-island-param`).
  const query = new URLSearchParams(window.location.search);
  const atLoad = (island: HTMLElement): boolean =>
    island.dataset.islandHydrate !== "interaction" ||
    (island.dataset.islandParam !== undefined && query.has(island.dataset.islandParam));
  const islands = Array.from(document.querySelectorAll<HTMLElement>("[data-island]"));
  const onLoad = islands.filter(atLoad);
  for (const island of islands) {
    if (!atLoad(island)) hydrateOnInteraction(island);
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
