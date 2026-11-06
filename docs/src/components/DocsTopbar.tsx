import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { DOCS_TABS, type DocsTabId } from "../lib/navigation.js";
import { BrandMark } from "./BrandMark.js";
import { Icon } from "./Icon.js";
import { ThemeToggle } from "./ThemeToggle.js";

const REPOSITORY_URL = "https://github.com/chh-ay/sheetwrite";

interface DocsTopbarProps {
  /** The tab of the page being read. */
  readonly activeTab: DocsTabId;
  /** The page being read, so its tab's landing page is marked as the page. */
  readonly activeHref?: string;
  /** The search control. */
  readonly search: ReactNode;
  /** The documentation menu button, shown where the sidebar does not fit. */
  readonly menu: ReactNode;
}

/**
 * The documentation top bar, over the reading column: the tabs for each part
 * of the docs on the left; search, GitHub and the theme on the right. Where
 * the sidebar does not fit, the bar also carries the brand and the menu
 * button, and the tabs move to a second row that scrolls sideways.
 */
export function DocsTopbar({ activeTab, activeHref, search, menu }: DocsTopbarProps) {
  return (
    <header className="sw-docs-bar">
      <Link aria-label="Sheetwrite home" className="sw-docs-bar__brand" to="/">
        <BrandMark />
        <span>Sheetwrite</span>
      </Link>
      <nav aria-label="Documentation sections" className="sw-docs-tabs">
        {DOCS_TABS.map((tab) => (
          <Link
            activeOptions={{ exact: true }}
            aria-current={
              tab.id !== activeTab ? undefined : activeHref === tab.href ? "page" : "true"
            }
            key={tab.id}
            to={tab.href}
          >
            <Icon name={tab.icon} />
            <span>{tab.label}</span>
          </Link>
        ))}
      </nav>
      <div className="sw-docs-bar__actions">
        {search}
        <a className="sw-docs-bar__link" href={REPOSITORY_URL}>
          GitHub
        </a>
        <ThemeToggle />
        {menu}
      </div>
    </header>
  );
}
