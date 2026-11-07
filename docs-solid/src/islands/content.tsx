import { children, type ComponentProps, type JSX, Show } from "solid-js";
import { resolveSSRNode } from "solid-js/web";
import { formulaTableHtml } from "virtual:formula-tables";

import { FormulaFilter, formulaTableId } from "../components/FormulaReference.js";
import { LiveGrid as LiveGridView } from "../components/LiveGrid.js";
import { PackageCommand as PackageCommandView } from "../components/PackageCommand.js";
import { RunnableCode as RunnableCodeView } from "../components/RunnableCode.js";
import { isTab, Tab, type Tabs as TabsView } from "../components/Tabs.js";
import { Island } from "./Island.js";
import { StaticRunnableCode, StaticTabs } from "./StaticMarkup.js";

/*
 * The components a compiled page renders in the browser, each as an island.
 * vite.config.ts points the content pipeline's imports
 * (`/src/components/Tabs.tsx`, `LiveGrid.tsx`, `RunnableCode.tsx`) here, and
 * the docs route passes PackageCommand and FormulaReference as components.
 */

export { Tab };

export function Tabs(props: ComponentProps<typeof TabsView>): JSX.Element {
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

/**
 * A formula family page's table and filter. The table is static markup the
 * docs generator built (docs/src/lib/formula-tables.ts); only the filter is an
 * island, so the rows never ship as script or hydrate. The filter's select
 * brings most of its code, so it loads when the reader first reaches for the
 * filter, not with the page.
 */
export function FormulaReference(props: { readonly family: string }): JSX.Element {
  const table = formulaTableHtml(props.family);
  // One row per function (docs/src/lib/formula-tables.ts marks each with its name).
  const total = table?.match(/\bdata-formula-name="/g)?.length ?? 0;
  return (
    <div class="sw-formula-reference">
      <Island
        component={FormulaFilter}
        hydrate="interaction"
        name="formula-reference"
        props={{ family: props.family, total }}
      />
      <Show
        fallback={<p>The function table did not load. Reload the page to see it.</p>}
        when={table}
      >
        {(html) => (
          <div
            class="sw-formula-reference__table"
            id={formulaTableId(props.family)}
            innerHTML={html()}
          />
        )}
      </Show>
    </div>
  );
}
