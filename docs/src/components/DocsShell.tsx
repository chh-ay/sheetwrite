import { Link } from "@tanstack/react-router";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";

import {
  CURRENT_RELEASE,
  type DocsTabId,
  type DocumentNeighbours,
  documentNeighbours,
  type NavigationItem,
  type NavigationLocation,
  type NavigationSection,
  navigationBadge,
  nearestNavigationItem,
  tabForHref,
  tabSections,
} from "../lib/navigation.js";
import type { OutlineItem } from "../lib/outline.js";
import { editUrl, reportProblemUrl } from "../lib/page-links.js";
import { ApiSymbolFilter } from "./ApiSymbolFilter.js";
import { BrandMark } from "./BrandMark.js";
import { NavigationSections } from "./DocsNavigation.js";
import { DocsNavigationMenu } from "./DocsNavigationMenu.js";
import { DocsSearch } from "./DocsSearch.js";
import { DocsTopbar } from "./DocsTopbar.js";
import { Icon } from "./Icon.js";
import { InlineTableOfContents, TableOfContents, useDocumentOutline } from "./TableOfContents.js";

interface DocsShellProps {
  activeHref?: string;
  children: ReactNode;
  description: string;
  /** Declaration kind of an API symbol page, shown as a chip beside the title. */
  kind?: string;
  /** The page's outline from the build, shown before the article is read. */
  outline?: readonly OutlineItem[];
  /**
   * Include the outline: on the right on wide screens, a collapsible row above
   * the article on narrow ones. Error and not-found pages omit it.
   */
  reserveOutline?: boolean;
  /** An API entry point's exported symbol count, so its filter renders on the server. */
  symbolCount?: number;
  /** The page's source file in the repository, for Edit on GitHub; generated pages have none. */
  sourcePath?: string;
  title: string;
}

/** Reading order: the neighbours of this page, when it sits in one. */
function DocumentPager({ previous, next }: Readonly<DocumentNeighbours>) {
  if (previous === undefined && next === undefined) return null;

  return (
    <nav aria-label="Documentation pages" className="sw-doc-pager">
      {previous === undefined ? (
        // Keeps "Next" in its own column when it is the only neighbour.
        <span aria-hidden="true" />
      ) : (
        <Link
          className="sw-doc-pager__link sw-doc-pager__link--previous"
          rel="prev"
          to={previous.href}
        >
          <span>Previous</span>
          <strong>{previous.label}</strong>
        </Link>
      )}
      {next === undefined ? null : (
        <Link className="sw-doc-pager__link sw-doc-pager__link--next" rel="next" to={next.href}>
          <span>Next</span>
          <strong>{next.label}</strong>
        </Link>
      )}
    </nav>
  );
}

/**
 * The page's eyebrow: the group it sits in (the nearest group, else its
 * section), or the package of a generated symbol page.
 */
function eyebrowFor(activeHref: string | undefined, titlePackage: string | undefined): string {
  if (titlePackage !== undefined) return titlePackage;
  const location = nearestNavigationItem(activeHref);
  if (location === undefined) return "Documentation";
  const group = location.ancestors.at(-1);
  // A group's own page is the group: the section names its place.
  if (group === undefined || group.href === activeHref) return location.section;
  return group.label;
}

/**
 * The documentation page layout: the sidebar, the top bar, the page head, the
 * article with its outline, and the footer. Its interactive parts (search,
 * theme, menu, outline and the API filter) are their own components.
 */
export function DocsShell({
  activeHref,
  children,
  description,
  kind,
  outline: buildOutline,
  reserveOutline,
  symbolCount,
  sourcePath,
  title,
}: Readonly<DocsShellProps>) {
  // API page titles arrive as "Symbol | @sheetwrite/pkg"; the package reads
  // better as the eyebrow than as part of a display-size heading.
  const [titleMain, titlePackage] = title.split(" | ", 2);
  const tab = tabForHref(activeHref);

  const outline = useDocumentOutline(buildOutline);
  const neighbours = documentNeighbours(activeHref);

  return (
    <div className={`sw-docs${kind === undefined ? "" : " sw-docs--api"}`}>
      <a className="sw-skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sw-sidebar">
        <Link aria-label="Sheetwrite home" className="sw-sidebar__brand" to="/">
          <BrandMark />
          <span>Sheetwrite</span>
        </Link>
        <NavigationSections activeHref={activeHref} tab={tab} />
      </aside>
      <DocsTopbar
        activeHref={activeHref}
        activeTab={tab}
        menu={<DocsNavigationMenu activeHref={activeHref} tab={tab} />}
        search={<DocsSearch />}
      />
      <main
        className="sw-document"
        data-pagefind-body
        // Attribute-value meta works regardless of element nesting; the h1
        // span below captures the clean symbol title.
        data-pagefind-meta={titlePackage ? `package:${titlePackage}` : undefined}
        id="main-content"
      >
        <header className="sw-document__header">
          <p className="sw-document__eyebrow" data-pagefind-ignore>
            {eyebrowFor(activeHref, titlePackage)}
          </p>
          <h1>
            <span data-pagefind-meta="title">{titleMain}</span>
            {kind === undefined ? null : (
              <span className="api-status" data-kind={kind} data-pagefind-ignore>
                {kind}
              </span>
            )}
          </h1>
          {/* Symbol pages repeat this sentence as the body's opening summary. */}
          {titlePackage === undefined ? <p className="sw-document__lead">{description}</p> : null}
          {activeHref ? (
            <p className="sw-page-actions" data-pagefind-ignore>
              {sourcePath === undefined ? null : (
                <a className="sw-button" data-size="sm" href={editUrl(sourcePath)}>
                  <Icon name="edit" />
                  Edit on GitHub
                </a>
              )}
              <a className="sw-button" data-size="sm" href={reportProblemUrl(title, activeHref)}>
                <Icon name="flag" />
                Report a problem
              </a>
            </p>
          ) : null}
        </header>
        <ApiSymbolFilter symbolCount={symbolCount} />
        {reserveOutline === true ? <InlineTableOfContents items={outline} /> : null}
        <article
          className={`sw-prose${activeHref === "/docs/reference/compatibility-limits/" ? " sw-prose--resource-limits" : ""}`}
        >
          {children}
        </article>
        {reserveOutline === true ? <TableOfContents items={outline} /> : null}
        <footer className="sw-document__footer" data-pagefind-ignore>
          <DocumentPager {...neighbours} />
          <div className="sw-document__colophon">
            <span>Sheetwrite is MIT licensed.</span>
            {/* Plain text endpoints, not routes: no client-side navigation. */}
            <a href="/llms.txt">llms.txt</a>
            <a href="https://github.com/chh-ay/sheetwrite/issues">Report a documentation issue</a>
          </div>
        </footer>
      </main>
    </div>
  );
}
