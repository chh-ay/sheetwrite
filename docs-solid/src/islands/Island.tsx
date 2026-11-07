import { type Component, createComponent, type JSX, sharedConfig } from "solid-js";

/** Every island a page can hold; islands/client.tsx has one loader per name. */
export type IslandName =
  | "search"
  | "theme"
  | "outline-rail"
  | "outline-inline"
  | "api-filter"
  | "tabs"
  | "package-command"
  | "live-grid"
  | "runnable-code";

/** `build:islands`: static pages that hydrate only their islands. `build:full`: Solid hydrates every page. */
export const ISLANDS: boolean = import.meta.env.DOCS_SOLID_ISLANDS;

interface IslandProps<Props extends object> {
  readonly name: IslandName;
  readonly component: Component<Props>;
  readonly props: Props;
  /** Props the client reads back from the island's own markup instead (see StaticMarkup). */
  readonly omitFromPage?: readonly (keyof Props)[];
}

/**
 * One interactive widget in a static page. The page renders under
 * `NoHydration`, so nothing else carries hydration keys; an island resumes
 * them under its own id, as Solid's `Hydration` boundary does, and writes that
 * id beside its props so the client can `hydrate` just this subtree.
 */
export function Island<Props extends object>(props: IslandProps<Props>): JSX.Element {
  if (!ISLANDS) return createComponent(props.component, props.props);
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
      data-island-id={id}
      data-props={Object.keys(pageProps).length === 0 ? undefined : JSON.stringify(pageProps)}
      style={{ display: "contents" }}
    >
      {content}
    </div>
  );
}
