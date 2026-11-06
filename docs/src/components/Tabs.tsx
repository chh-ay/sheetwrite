import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

import { readPreference, writePreference } from "../lib/preference-storage.js";
import { onTabListKey } from "./tabKeys.js";

/** Props of {@link Tab}: one panel of a {@link Tabs} group. */
interface TabProps {
  readonly title: string;
  readonly children: ReactNode;
}

/** Props of {@link Tabs}. */
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
  readonly children: ReactNode;
}

const TAB_EVENT = "sheetwrite:docs-tab";
/** Preference keys keep the old prefix, so a reader's earlier choice still applies. */
const PREFERENCE_PREFIX = "sheetwrite-";

/** Payload of the tab event: the synchronised group and the title it selected. */
interface TabEventDetail {
  readonly key: string;
  readonly title: string;
}

function isTabEventDetail(value: unknown): value is TabEventDetail {
  if (typeof value !== "object" || value === null) return false;

  const detail: { key?: unknown; title?: unknown } = value;
  return typeof detail.key === "string" && typeof detail.title === "string";
}

/** One panel; {@link Tabs} renders it. */
export function Tab({ children }: Readonly<TabProps>) {
  return children;
}

/**
 * Switchable panels. Pages write `<Tabs>` and
 * `<Tab title>` in MDX; CodeGroup becomes a `variant="code"` Tabs at build time.
 */
export function Tabs({ children, sync, label = "Choose a version", variant }: Readonly<TabsProps>) {
  const tabs = useMemo(
    () =>
      Children.toArray(children).filter(
        (child): child is ReactElement<TabProps> =>
          isValidElement<TabProps>(child) && typeof child.props.title === "string",
      ),
    [children],
  );
  const [selected, setSelected] = useState(0);
  const id = useId();
  const titles = useMemo(() => tabs.map((tab) => tab.props.title), [tabs]);
  const tabElementId = (title: string) => `${id}-tab-${titles.indexOf(title)}`;
  const preferenceKey = sync === undefined ? undefined : `${PREFERENCE_PREFIX}${sync}`;

  useEffect(() => {
    if (preferenceKey === undefined) return;
    const stored = readPreference(preferenceKey);
    const index = titles.indexOf(stored ?? "");
    if (index >= 0) setSelected(index);

    const onChange = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;

      const detail: unknown = event.detail;
      if (!isTabEventDetail(detail) || detail.key !== preferenceKey) return;

      const next = titles.indexOf(detail.title);
      if (next >= 0) setSelected(next);
    };
    window.addEventListener(TAB_EVENT, onChange);
    return () => window.removeEventListener(TAB_EVENT, onChange);
  }, [preferenceKey, titles]);

  const select = (index: number) => {
    setSelected(index);
    const title = titles[index];
    if (preferenceKey === undefined || title === undefined) return;
    writePreference(preferenceKey, title);
    window.dispatchEvent(
      new CustomEvent<TabEventDetail>(TAB_EVENT, { detail: { key: preferenceKey, title } }),
    );
  };

  if (tabs.length === 0) return null;

  return (
    <div className="sw-tabs" data-variant={variant}>
      <div aria-label={label} className="sw-tabs__list" role="tablist">
        {tabs.map((tab, index) => (
          <button
            aria-controls={`${id}-panel-${index}`}
            aria-selected={index === selected}
            id={`${id}-tab-${index}`}
            key={tab.props.title}
            onClick={() => select(index)}
            onKeyDown={(event) =>
              onTabListKey(
                event,
                titles,
                tab.props.title,
                (title) => select(titles.indexOf(title)),
                tabElementId,
              )
            }
            role="tab"
            // Only the selected tab is in the Tab sequence; arrow keys move between tabs.
            tabIndex={index === selected ? 0 : -1}
            type="button"
          >
            {tab.props.title}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          aria-labelledby={`${id}-tab-${index}`}
          className="sw-tabs__panel"
          hidden={index !== selected}
          id={`${id}-panel-${index}`}
          key={tab.props.title}
          role="tabpanel"
        >
          {tab.props.children}
        </div>
      ))}
    </div>
  );
}
