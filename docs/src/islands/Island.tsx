import { createServerOnlyFn } from "@tanstack/react-start";
import { type ComponentType, createContext, type ReactNode, use } from "react";
import { renderToString } from "react-dom/server";

import type { IslandName } from "./names.js";

/**
 * True while the docs route renders a page that ships as static HTML with
 * islands. Outside it (every other route, and the dev server) an island is its
 * component, hydrated with the rest of the page.
 */
export const IslandsContext = createContext(false);

/**
 * Renders `node` as its own React root, keeping island markers inside it. The
 * client hydrates each island as a separate root, so the server must render it
 * as one too: `useId` values then match. Server-only, so the client bundles
 * never carry the server renderer.
 */
export const renderIsolated = createServerOnlyFn((node: ReactNode): string =>
  renderToString(<IslandsContext value>{node}</IslandsContext>),
);

interface IslandProps<Props extends object> {
  /** The key of the island's loader in islands/client.tsx. */
  readonly name: IslandName;
  readonly component: ComponentType<Props>;
  /** Serialised into the page: the client hydrates with the same props. */
  readonly props: Props;
  /** Props the client reads back from the island's own markup instead (see StaticTabs). */
  readonly omitFromPage?: readonly (keyof Props)[];
}

/**
 * One interactive widget in a static page. On the server it renders the
 * component into a `display: contents` marker with its props; the islands
 * client hydrates that marker and nothing around it.
 */
export function Island<Props extends object>({
  name,
  component: Component,
  props,
  omitFromPage = [],
}: IslandProps<Props>): ReactNode {
  const isolated = use(IslandsContext);
  if (!isolated) return <Component {...props} />;
  const pageProps = Object.fromEntries(
    Object.entries(props).filter(([key]) => !omitFromPage.some((omitted) => omitted === key)),
  );
  return (
    <div
      dangerouslySetInnerHTML={{ __html: renderIsolated(<Component {...props} />) }}
      data-island={name}
      data-props={Object.keys(pageProps).length === 0 ? undefined : JSON.stringify(pageProps)}
      style={{ display: "contents" }}
    />
  );
}
