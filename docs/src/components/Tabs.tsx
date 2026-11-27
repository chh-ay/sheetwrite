import { readPreference, writePreference } from "@docs/lib/preference-storage.js";
import {
  children,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  type JSX,
  mergeProps,
  onCleanup,
  Show,
} from "solid-js";

import { onTabListKey } from "./tabKeys.js";

/** Props of {@link Tab}: one panel of a {@link Tabs} group. */
interface TabProps {
  readonly title: string;
  readonly children?: JSX.Element;
}

interface TabsProps {
  /**
   * Tabs with the same `sync` value switch together across the site, and the
   * choice is remembered: `framework` and `package-manager` are the two used.
   */
  readonly sync?: string;
  /** The tab list's accessible name. */
  readonly label?: string;
  /** `code`: the tabs head a code block (CodeGroup), drawn as its title bar. */
  readonly variant?: "code";
  readonly children?: JSX.Element;
}

const TAB_EVENT = "sheetwrite:docs-tab";
/** Stored tab choices already use this prefix; keeping it keeps a reader's earlier choice. */
const PREFERENCE_PREFIX = "sheetwrite-";

/** Payload of the tab event: the synchronised group and the title it selected. */
interface TabEventDetail {
  readonly key: string;
  readonly title: string;
}

function is_tab_event_detail(value: unknown): value is TabEventDetail {
  if (typeof value !== "object" || value === null) return false;

  const detail: { key?: unknown; title?: unknown } = value;
  return typeof detail.key === "string" && typeof detail.title === "string";
}

/** Whether a resolved child of {@link Tabs} is a {@link Tab} descriptor. */
export function isTab(child: unknown): child is TabProps {
  if (typeof child !== "object" || child === null) return false;
  // Rendered nodes (text, markup between the tabs) are no Tab; the server has no Node.
  if (typeof Node !== "undefined" && child instanceof Node) return false;
  const tab: { title?: unknown } = child;
  return typeof tab.title === "string";
}

/**
 * One panel; {@link Tabs} renders it. Solid renders children eagerly, so a Tab
 * renders nothing itself: it hands its props to Tabs, whose panel reads the
 * (lazy) `children` where the panel is drawn.
 */
export function Tab(props: Readonly<TabProps>): JSX.Element {
  return props as unknown as JSX.Element;
}

/**
 * Switchable panels. Pages write `<Tabs>` and
 * `<Tab title>` in MDX; CodeGroup becomes a `variant="code"` Tabs at build time.
 */
export function Tabs(rawProps: Readonly<TabsProps>) {
  const props = mergeProps({ label: "Choose a version" }, rawProps);
  const resolved = children(() => props.children);
  const tabs = createMemo(() =>
    resolved.toArray().flatMap((child) => (isTab(child) ? [child] : [])),
  );
  const [selected, set_selected] = createSignal(0);
  const id = createUniqueId();
  const titles = createMemo(() => tabs().map((tab) => tab.title));
  const tab_element_id = (title: string) => `${id}-tab-${titles().indexOf(title)}`;
  const preference_key = () =>
    props.sync === undefined ? undefined : `${PREFERENCE_PREFIX}${props.sync}`;

  createEffect(() => {
    const key = preference_key();
    const current = titles();
    if (key === undefined) return;
    const stored = readPreference(key);
    const index = current.indexOf(stored ?? "");
    if (index >= 0) set_selected(index);

    const on_change = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;

      const detail: unknown = event.detail;
      if (!is_tab_event_detail(detail) || detail.key !== key) return;

      const next = current.indexOf(detail.title);
      if (next >= 0) set_selected(next);
    };
    window.addEventListener(TAB_EVENT, on_change);
    onCleanup(() => window.removeEventListener(TAB_EVENT, on_change));
  });

  const select = (index: number) => {
    set_selected(index);
    const title = titles()[index];
    const key = preference_key();
    if (key === undefined || title === undefined) return;
    writePreference(key, title);
    window.dispatchEvent(new CustomEvent<TabEventDetail>(TAB_EVENT, { detail: { key, title } }));
  };

  return (
    <Show when={tabs().length > 0}>
      <div class="sw-tabs" data-variant={props.variant}>
        <div aria-label={props.label} class="sw-tabs__list" role="tablist">
          <For each={tabs()}>
            {(tab, index) => (
              <button
                aria-controls={`${id}-panel-${index()}`}
                aria-selected={index() === selected()}
                id={`${id}-tab-${index()}`}
                onClick={() => select(index())}
                onKeyDown={(event) =>
                  onTabListKey(
                    event,
                    titles(),
                    tab.title,
                    (title) => select(titles().indexOf(title)),
                    tab_element_id,
                  )
                }
                role="tab"
                // Only the selected tab is in the Tab sequence; arrow keys move between tabs.
                tabIndex={index() === selected() ? 0 : -1}
                type="button"
              >
                {tab.title}
              </button>
            )}
          </For>
        </div>
        <For each={tabs()}>
          {(tab, index) => (
            <div
              aria-labelledby={`${id}-tab-${index()}`}
              class="sw-tabs__panel"
              hidden={index() !== selected()}
              id={`${id}-panel-${index()}`}
              role="tabpanel"
            >
              {tab.children}
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
