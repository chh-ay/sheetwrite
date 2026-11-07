import { type Component, createComponent, type JSX, sharedConfig } from "solid-js";

import type { ShowcaseIslandName } from "../showcases/islands.js";

/** Every island a page can hold; islands/client.tsx has one loader per name. */
export type IslandName = CoreIslandName | ShowcaseIslandName;

/** The docs shell's, the content pipeline's and the landing's islands. */
export type CoreIslandName =
  | "activation-fixture"
  | "tabs"
  | "package-command"
  | "formula-reference"
  | "live-grid"
  | "runnable-code"
  | "search"
  | "api-symbol-filter"
  | "landing-hero"
  | "landing-architecture"
  | "landing-stories"
  | "landing-code";

/**
 * When an island's code loads and hydrates. `load`: after the page's first
 * paint, on every page that holds it. `interaction`: when the reader first
 * reaches for it (islands/client.tsx); its code is fetched ahead at low
 * priority once the island is on screen and the page is idle.
 */
export type IslandHydration = "load" | "interaction";

interface IslandProps<Props extends object> {
  readonly name: IslandName;
  readonly component: Component<Props>;
  readonly props: Props;
  /** Props the client reads back from the island's own markup instead (see StaticMarkup). */
  readonly omitFromPage?: readonly (keyof Props)[];
  /** Defaults to `load`. */
  readonly hydrate?: IslandHydration;
}

/**
 * One interactive widget in a static page. The page renders under
 * `NoHydration`, so nothing else carries hydration keys; an island resumes
 * them under its own id, as Solid's `Hydration` boundary does, and writes that
 * id beside its props so the client can `hydrate` just this subtree.
 */
export function Island<Props extends object>(props: IslandProps<Props>): JSX.Element {
  const context = sharedConfig.context;
  if (context === undefined || context === null) throw new Error("Islands render on the server");
  // Read first, under the page's NoHydration: Solid passes JSX props as getters,
  // and props that render page markup (StaticMarkup) must not take island ids.
  const componentProps = props.props;
  const id = sharedConfig.getNextContextId();
  // The server context also carries `noHydrate` (set by NoHydration), which Solid's type omits.
  sharedConfig.context = Object.assign({}, context, { count: 0, id, noHydrate: false });
  const content = createComponent(props.component, componentProps);
  sharedConfig.context = context;
  const omitted = props.omitFromPage ?? [];
  const pageProps = Object.fromEntries(
    Object.entries(componentProps).filter(([key]) => !omitted.some((name) => name === key)),
  );
  return (
    <div
      data-island={props.name}
      data-island-hydrate={props.hydrate === "interaction" ? "interaction" : undefined}
      data-island-id={id}
      data-props={Object.keys(pageProps).length === 0 ? undefined : JSON.stringify(pageProps)}
      style={{ display: "contents" }}
    >
      {content}
    </div>
  );
}
