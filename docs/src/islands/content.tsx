import {
 type AnchorHTMLAttributes,
 Children,
 type ComponentProps,
 isValidElement,
 type ReactElement,
 type ReactNode,
 use,
} from "react";

import { FormulaReference as FormulaReferenceView } from "../components/FormulaReference.js";
import { LiveGrid as LiveGridView } from "../components/LiveGrid.js";
import { PackageCommand as PackageCommandView } from "../components/PackageCommand.js";
import { RunnableCode as RunnableCodeView } from "../components/RunnableCode.js";
import { Tab, Tabs as TabsView } from "../components/Tabs.js";
import { Island, IslandsContext, renderIsolated } from "./Island.js";
import { StaticRunnableCode, StaticTabs } from "./StaticTabs.js";

/*
 * The components a compiled docs page renders in the browser, as islands. MDX
 * pages import Tabs, Tab and LiveGrid from here (RUNTIME_MODULES in
 * lib/content-components.ts); the docs route passes the others as components.
 */

export { Tab };

type TabElement = ReactElement<{ title: string; children?: ReactNode }>;

function isTabElement(child: unknown): child is TabElement {
 return isValidElement<{ title?: unknown }>(child) && typeof child.props.title === "string";
}

export function Tabs(props: ComponentProps<typeof TabsView>): ReactNode {
 const isolated = use(IslandsContext);
 if (!isolated) return <TabsView {...props} />;
 const tabs = Children.toArray(props.children).filter(isTabElement);
 return (
  <Island
   component={StaticTabs}
   name="tabs"
   omitFromPage={["panels"]}
   props={{
    sync: props.sync,
    label: props.label,
    variant: props.variant,
    titles: tabs.map((tab) => tab.props.title),
    panels: tabs.map((tab) => renderIsolated(tab.props.children)),
   }}
  />
 );
}

/** Try it: the runnable-code build step (lib/runnable-code.ts) imports it from here. */
export function RunnableCode(props: ComponentProps<typeof RunnableCodeView>): ReactNode {
 const isolated = use(IslandsContext);
 if (!isolated) return <RunnableCodeView {...props} />;
 return (
  <Island
   component={StaticRunnableCode}
   name="runnable-code"
   omitFromPage={["html"]}
   props={{ disclosed: props.disclosed, html: renderIsolated(props.children) }}
  />
 );
}

export function LiveGrid(props: ComponentProps<typeof LiveGridView>): ReactNode {
 return <Island component={LiveGridView} name="live-grid" props={props} />;
}

export function PackageCommand(props: ComponentProps<typeof PackageCommandView>): ReactNode {
 return <Island component={PackageCommandView} name="package-command" props={props} />;
}

export function FormulaReference(props: ComponentProps<typeof FormulaReferenceView>): ReactNode {
 return <Island component={FormulaReferenceView} name="formula-reference" props={props} />;
}

/** A content link on a static page: a plain anchor, as the browser navigates. */
export function StaticLink({ children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
 return <a {...rest}>{children}</a>;
}
