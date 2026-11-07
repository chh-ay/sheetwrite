import { For } from "solid-js";

import { RunnableCode } from "../components/RunnableCode.js";
import { Tab, Tabs } from "../components/Tabs.js";

/*
 * Islands whose content is static page markup. The server renders the content
 * once into a `display: contents` holder; the client reads the holder's markup
 * back before hydrating, so the content never ships as script.
 */

/** Holds markup the island shows but never renders itself. */
function Markup(props: { html: string }) {
  return <div data-island-html="" innerHTML={props.html} style={{ display: "contents" }} />;
}

/** Every markup holder of a server-rendered static-markup island, in order. */
export function markupOf(island: HTMLElement): string[] {
  return Array.from(island.querySelectorAll("[data-island-html]"), (holder) => holder.innerHTML);
}

/** Props of {@link StaticTabs}: a Tabs group whose panels are finished markup. */
export interface StaticTabsProps {
  readonly sync?: string;
  readonly label?: string;
  readonly variant?: "code";
  readonly titles: readonly string[];
  readonly panels: readonly string[];
}

export function StaticTabs(props: StaticTabsProps) {
  return (
    <Tabs label={props.label} sync={props.sync} variant={props.variant}>
      <For each={props.titles}>
        {(title, index) => (
          <Tab title={title}>
            <Markup html={props.panels[index()] ?? ""} />
          </Tab>
        )}
      </For>
    </Tabs>
  );
}

/** Props of {@link StaticRunnableCode}: a runnable example whose code block is finished markup. */
export interface StaticRunnableCodeProps {
  readonly disclosed?: boolean;
  readonly html: string;
}

export function StaticRunnableCode(props: StaticRunnableCodeProps) {
  return (
    <RunnableCode disclosed={props.disclosed}>
      <Markup html={props.html} />
    </RunnableCode>
  );
}
