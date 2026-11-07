import { children, type ComponentProps, type JSX } from "solid-js";
import { resolveSSRNode } from "solid-js/web";

import { LiveGrid as LiveGridView } from "../components/LiveGrid.js";
import { PackageCommand as PackageCommandView } from "../components/PackageCommand.js";
import { RunnableCode as RunnableCodeView } from "../components/RunnableCode.js";
import { isTab, Tab, Tabs as TabsView } from "../components/Tabs.js";
import { Island, ISLANDS } from "./Island.js";
import { StaticRunnableCode, StaticTabs } from "./StaticMarkup.js";

/*
 * The components a compiled page renders in the browser. vite.config.ts points
 * the content pipeline's imports (`/src/components/Tabs.tsx`, `LiveGrid.tsx`,
 * `RunnableCode.tsx`) here; with full hydration each is the component itself.
 */

export { Tab };

export function Tabs(props: ComponentProps<typeof TabsView>): JSX.Element {
  if (!ISLANDS) return <TabsView {...props} />;
  // Resolved here, under the page's NoHydration: the panels are markup, not island content.
  const tabs = children(() => props.children)
    .toArray()
    .flatMap((child) => (isTab(child) ? [child] : []));
  return (
    <Island
      component={StaticTabs}
      name="tabs"
      omitFromPage={["panels"]}
      props={{
        sync: props.sync,
        label: props.label,
        variant: props.variant,
        titles: tabs.map((tab) => tab.title),
        panels: tabs.map((tab) => resolveSSRNode(tab.children)),
      }}
    />
  );
}

export function RunnableCode(props: ComponentProps<typeof RunnableCodeView>): JSX.Element {
  if (!ISLANDS) return <RunnableCodeView {...props} />;
  return (
    <Island
      component={StaticRunnableCode}
      name="runnable-code"
      omitFromPage={["html"]}
      props={{ disclosed: props.disclosed, html: resolveSSRNode(props.children) }}
    />
  );
}

export function LiveGrid(props: ComponentProps<typeof LiveGridView>): JSX.Element {
  return <Island component={LiveGridView} name="live-grid" props={{ ...props }} />;
}

export function PackageCommand(props: ComponentProps<typeof PackageCommandView>): JSX.Element {
  return <Island component={PackageCommandView} name="package-command" props={{ ...props }} />;
}
