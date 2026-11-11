import { createSignal, For } from "solid-js";

import { Markup } from "../../islands/markup.js";
import { onTabListKey } from "../tabKeys.js";

/** The landing's frameworks, in tab order; the route renders one snippet per entry. */
export const CODE_TAB_FRAMEWORKS = [
  { id: "vanilla", label: "Vanilla" },
  { id: "react", label: "React" },
  { id: "vue", label: "Vue" },
  { id: "svelte", label: "Svelte" },
] as const;

type FrameworkId = (typeof CODE_TAB_FRAMEWORKS)[number]["id"];

/** Props of {@link CodeTabs}: each framework's snippet, as finished markup in tab order. */
export interface CodeTabsProps {
  readonly panels: readonly string[];
}

/**
 * The landing's framework snippets, ported from
 * docs/src/components/landing/CodeTabs.tsx. Every snippet is markup in the
 * page (hidden until its tab is chosen), so choosing a tab loads nothing; the
 * island reads the panels back from the page when it hydrates.
 */
export function CodeTabs(props: CodeTabsProps) {
  const [active, setActive] = createSignal<FrameworkId>("vanilla");
  const ids = CODE_TAB_FRAMEWORKS.map((framework) => framework.id);
  return (
    <div class="sw-code-tabs">
      {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- the tabs inside take focus; the tab list itself does not. */}
      <div
        aria-label="Framework"
        class="sw-code-tabs__list"
        onKeyDown={(event) =>
          onTabListKey(event, ids, active(), setActive, (id) => `landing-tab-${id}`)
        }
        role="tablist"
      >
        <For each={CODE_TAB_FRAMEWORKS}>
          {(framework) => (
            <button
              aria-controls={`landing-code-${framework.id}`}
              aria-selected={framework.id === active()}
              data-framework={framework.id}
              id={`landing-tab-${framework.id}`}
              onClick={() => setActive(framework.id)}
              role="tab"
              tabIndex={framework.id === active() ? 0 : -1}
              type="button"
            >
              {framework.label}
            </button>
          )}
        </For>
      </div>
      <For each={CODE_TAB_FRAMEWORKS}>
        {(framework, index) => (
          <div
            aria-labelledby={`landing-tab-${framework.id}`}
            class="sw-code-tabs__panel"
            hidden={framework.id !== active()}
            id={`landing-code-${framework.id}`}
            role="tabpanel"
          >
            <Markup html={props.panels[index()] ?? ""} />
          </div>
        )}
      </For>
    </div>
  );
}
