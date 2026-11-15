import { For } from "solid-js";

import { RunnableCode } from "../components/RunnableCode.js";
import { Tab, Tabs } from "../components/Tabs.js";
import { Markup } from "./markup.js";

export { markupOf } from "./markup.js";

/* Islands whose content is static page markup (see markup.tsx). */

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
