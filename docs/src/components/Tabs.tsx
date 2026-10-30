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
import { onTabListKey } from "./landing/tabKeys.js";

interface TabItemProps {
  label: string;
  children: ReactNode;
}

interface TabsProps {
  syncKey?: string;
  children: ReactNode;
}

const TAB_EVENT = "sheetwrite:docs-tab";

export function TabItem({ children }: Readonly<TabItemProps>) {
  return children;
}

export function Tabs({ children, syncKey }: Readonly<TabsProps>) {
  const tabs = useMemo(
    () =>
      Children.toArray(children).filter(
        (child): child is ReactElement<TabItemProps> =>
          isValidElement<TabItemProps>(child) && typeof child.props.label === "string",
      ),
    [children],
  );
  const [selected, setSelected] = useState(0);
  const id = useId();
  const labels = useMemo(() => tabs.map((tab) => tab.props.label), [tabs]);
  const tabElementId = (label: string) => `${id}-tab-${labels.indexOf(label)}`;

  useEffect(() => {
    if (syncKey === undefined) return;
    const stored = readPreference(syncKey);
    const index = tabs.findIndex((tab) => tab.props.label === stored);
    if (index >= 0) setSelected(index);

    const onChange = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail?.key !== syncKey) return;
      const next = tabs.findIndex((tab) => tab.props.label === event.detail.label);
      if (next >= 0) setSelected(next);
    };
    window.addEventListener(TAB_EVENT, onChange);
    return () => window.removeEventListener(TAB_EVENT, onChange);
  }, [syncKey, tabs]);

  const select = (index: number) => {
    setSelected(index);
    if (syncKey === undefined) return;

    const label = labels[index];
    if (label === undefined) return;
    writePreference(syncKey, label);
    window.dispatchEvent(new CustomEvent(TAB_EVENT, { detail: { key: syncKey, label } }));
  };

  if (tabs.length === 0) return null;

  return (
    <div className="sw-tabs">
      <div className="sw-tabs__list" role="tablist" aria-label="Framework">
        {tabs.map((tab, index) => (
          <button
            aria-controls={`${id}-panel-${index}`}
            aria-selected={index === selected}
            id={`${id}-tab-${index}`}
            key={tab.props.label}
            onClick={() => select(index)}
            onKeyDown={(event) =>
              onTabListKey(
                event,
                labels,
                tab.props.label,
                (label) => select(labels.indexOf(label)),
                tabElementId,
              )
            }
            role="tab"
            // Only the selected tab is in the Tab sequence; arrow keys move between tabs.
            tabIndex={index === selected ? 0 : -1}
            type="button"
          >
            {tab.props.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          aria-labelledby={`${id}-tab-${index}`}
          className="sw-tabs__panel"
          hidden={index !== selected}
          id={`${id}-panel-${index}`}
          key={tab.props.label}
          role="tabpanel"
        >
          {tab.props.children}
        </div>
      ))}
    </div>
  );
}
