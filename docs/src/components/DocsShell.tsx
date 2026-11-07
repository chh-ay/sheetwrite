import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";

import releaseFacts from "../generated/release-facts.json" with { type: "json" };
import { Island } from "../islands/Island.js";
import { installNavigationDrawer, NAVIGATION_DIALOG_ID } from "../lib/navigation-drawer.js";
import {
  breadcrumbsFor,
  type Crumb,
  DOCS_NAVIGATION,
  type DocumentNeighbours,
  documentNeighbours,
  type NavigationItem,
  type NavigationLocation,
  navigationBadge,
  nearestNavigationItem,
} from "../lib/navigation.js";
import type { OutlineItem } from "../lib/outline.js";
import { editUrl, reportProblemUrl } from "../lib/page-links.js";
import { ApiSymbolFilter, listsExportedSymbols } from "./ApiSymbolFilter.js";
import { DocsSearch } from "./DocsSearch.js";
import { Icon } from "./Icon.js";
import { SiteTopbar } from "./SiteTopbar.js";
import { OutlineInline, OutlineRail } from "./TableOfContents.js";

/** The outline of a page without one; one constant, so the outline effects see a stable value. */
const NO_OUTLINE: readonly OutlineItem[] = [];

interface DocsShellProps {
  activeHref?: string;
  children: ReactNode;
  description: string;
  /** Declaration kind of an API symbol page, shown as a chip beside the title. */
  kind?: string;
  /**
   * Include a collapsible outline above the article on narrow screens.
   * The task-oriented overview omits it.
   */
  /** The page's outline from the build, shown before the article is read. */
  outline?: readonly OutlineItem[];
  reserveOutline?: boolean;
  /** The page's source file in the repository, for Edit on GitHub; generated pages have none. */
  sourcePath?: string;
  title: string;
}

function Breadcrumbs({ trail }: Readonly<{ trail: readonly Crumb[] }>) {
  return (
    <nav aria-label="Breadcrumb" className="sw-breadcrumb" data-pagefind-ignore>
      <ol>
        {trail.map((crumb) => (
          <li key={`${crumb.href ?? "current"}|${crumb.label}`}>
            {crumb.href === undefined ? (
              <span aria-current={crumb === trail.at(-1) ? "page" : undefined}>{crumb.label}</span>
            ) : (
              // Ancestors are never the current page; the last crumb owns
              // aria-current="page".
              <Link activeOptions={{ exact: true }} to={crumb.href}>
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * The newest release leads the navigation: a reader who upgrades should not
 * have to open a collapsed group to find what changed.
 */
function LatestReleaseCard({ activeHref }: Readonly<{ activeHref?: string }>) {
  const { href, date, dateLabel, version, summary } = releaseFacts.latest;

  return (
    <Link
      aria-current={activeHref === href ? "page" : undefined}
      className="sw-release-card"
      to={href}
    >
      <span className="sw-release-card__meta">
        <span className="sw-release-card__badge">New</span>
        <time dateTime={date}>{dateLabel}</time>
      </span>
      <strong>Sheetwrite {version}</strong>
      <span className="sw-release-card__summary">{summary}</span>
      <span className="sw-release-card__more">
        Read the release notes <Icon name="arrow-right" />
      </span>
    </Link>
  );
}

const BADGE_TEXT = { new: "New", updated: "Updated" } as const;

/**
 * New/Updated marker for a page changed in the latest release; text, so
 * screen readers announce it. Only page links carry it: a group marker would
 * repeat its pages' markers on a collapsed row.
 */
function NavigationBadgeLabel({ item }: Readonly<{ item: NavigationItem }>) {
  const badge = navigationBadge(item, releaseFacts.latest.version);
  if (badge === undefined) return null;

  return (
    <span className="sw-nav-badge" data-badge={badge}>
      {BADGE_TEXT[badge]}
    </span>
  );
}

interface NavigationEntriesProps {
  items: readonly NavigationItem[];
  current: NavigationLocation | undefined;
}

/**
 * One level of the tree. A group is a collapsible block that opens when the
 * current page is inside it; its own page, if any, is the first link inside,
 * because a link in the toggle row would also toggle the group.
 */
function NavigationEntries({ items, current }: Readonly<NavigationEntriesProps>) {
  return items.map((item) => {
    if (item.items === undefined) {
      return (
        <Link
          activeOptions={{ exact: true }}
          aria-current={current?.href === item.href ? "page" : undefined}
          key={item.href}
          to={item.href}
        >
          <span>{item.label}</span>
          <NavigationBadgeLabel item={item} />
        </Link>
      );
    }

    // A group's own page opens the group too; call its link Overview to avoid repeating the name.
    const open =
      (current?.ancestors.includes(item) ?? false) ||
      (item.href !== undefined && current?.href === item.href);
    const ownPage =
      item.href === undefined
        ? []
        : [
            {
              label: "Overview",
              href: item.href,
              added: item.added,
              updated: item.updated,
            },
          ];
    return (
      <details className="sw-nav-subgroup" key={`${item.label}:${open}`} open={open}>
        <summary>
          <span>{item.label}</span>
          <Icon className="sw-disclosure-icon" name="chevron-right" />
        </summary>
        <div>
          <NavigationEntries current={current} items={[...ownPage, ...item.items]} />
        </div>
      </details>
    );
  });
}

/**
 * The section list itself, shared by the sidebar and the drawer so the two can
 * never advertise different documentation.
 */
function NavigationSections({ activeHref }: Readonly<{ activeHref?: string }>) {
  const current = nearestNavigationItem(activeHref);

  return (
    <nav aria-label="Documentation" className="sw-sidebar__nav">
      <LatestReleaseCard activeHref={activeHref} />
      {DOCS_NAVIGATION.map((section) => (
        <details
          className="sw-nav-group"
          key={`${section.label}:${current?.section}`}
          open={section.label === current?.section}
        >
          <summary>
            <span>{section.label}</span>
            <Icon className="sw-disclosure-icon" name="chevron-right" />
          </summary>
          <div>
            <NavigationEntries
              current={current}
              // A section's own page leads its list, named Overview as a group's is.
              items={
                section.href === undefined
                  ? section.items
                  : [{ label: "Overview", href: section.href }, ...section.items]
              }
            />
          </div>
        </details>
      ))}
      <section>
        <h2>Explore Sheetwrite</h2>
        <Link activeOptions={{ exact: true }} to="/">
          Home
        </Link>
        <Link activeOptions={{ exact: true }} to="/showcases/">
          Showcases
        </Link>
        <a href="https://github.com/chh-ay/sheetwrite">GitHub</a>
      </section>
      <section>
        <h2>For LLMs</h2>
        {/* Plain text endpoints, not routes: no client-side navigation. */}
        <a href="/llms.txt" title="Curated documentation index for AI agents">
          llms.txt
        </a>
        <a href="/llms-full.txt" title="Complete documentation text for AI agents">
          llms-full.txt
        </a>
      </section>
    </nav>
  );
}

/**
 * The section list for viewports without room for the sidebar, as a modal
 * dialog; lib/navigation-drawer.ts opens and closes it.
 */
function NavigationDrawer({ activeHref }: Readonly<{ activeHref?: string }>) {
  return (
    <dialog aria-label="Documentation" className="sw-nav-dialog" id={NAVIGATION_DIALOG_ID}>
      <div className="sw-nav-dialog__head">
        <span className="sw-nav-dialog__title">Documentation</span>
        <button
          aria-label="Close documentation menu"
          className="sw-icon-button"
          data-close-navigation=""
          type="button"
        >
          <Icon name="close" size="md" />
        </button>
      </div>
      <NavigationSections activeHref={activeHref} />
    </dialog>
  );
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

export function DocsShell({
  activeHref,
  children,
  description,
  kind,
  outline: buildOutline = NO_OUTLINE,
  reserveOutline,
  sourcePath,
  title,
}: Readonly<DocsShellProps>) {
  // API page titles arrive as "Symbol | @sheetwrite/pkg"; the package reads
  // better as a chip than as part of a display-size heading.
  const [titleMain, titlePackage] = title.split(" | ", 2);

  const pathname = activeHref ?? "";
  const neighbours = documentNeighbours(activeHref);

  // Static docs pages run the same installer from the islands client.
  useEffect(installNavigationDrawer, []);

  return (
    <div className={`sw-docs${activeHref === "/docs/" ? " sw-docs--overview" : ""}`}>
      <a className="sw-skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteTopbar
        search={<Island component={DocsSearch} name="search" props={{}} />}
        trailing={
          <button
            aria-controls={NAVIGATION_DIALOG_ID}
            aria-expanded={false}
            aria-haspopup="dialog"
            className="sw-icon-button sw-nav-toggle"
            type="button"
          >
            <Icon name="menu" size="md" />
            <span className="sw-visually-hidden">Documentation menu</span>
          </button>
        }
      />
      <aside className="sw-sidebar">
        <NavigationSections activeHref={activeHref} />
      </aside>
      <main
        className="sw-document"
        data-pagefind-body
        // Attribute-value meta works regardless of element nesting; the h1
        // span below captures the clean symbol title.
        data-pagefind-meta={titlePackage ? `package:${titlePackage}` : undefined}
        id="main-content"
      >
        <header className="sw-document__header">
          <Breadcrumbs trail={breadcrumbsFor(activeHref, titleMain ?? title)} />
          <h1>
            <span data-pagefind-meta="title">{titleMain}</span>
            {kind === undefined ? null : (
              <span className="api-status" data-kind={kind} data-pagefind-ignore>
                {kind}
              </span>
            )}
            {titlePackage ? (
              <code className="sw-title-package" data-pagefind-ignore>
                {titlePackage}
              </code>
            ) : null}
          </h1>
          {/* Symbol pages repeat this sentence as the body's opening summary. */}
          {titlePackage === undefined ? <span>{description}</span> : null}
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
        {listsExportedSymbols(pathname) ? (
          <Island component={ApiSymbolFilter} name="api-filter" props={{ pathname }} />
        ) : null}
        {reserveOutline === true ? (
          <Island
            component={OutlineInline}
            name="outline-inline"
            props={{ initial: buildOutline, pathname }}
          />
        ) : null}
        <article
          className={`sw-prose${activeHref === "/docs/reference/compatibility-limits/" ? " sw-prose--resource-limits" : ""}`}
        >
          {children}
        </article>
        {reserveOutline === true ? (
          <Island
            component={OutlineRail}
            name="outline-rail"
            props={{ initial: buildOutline, pathname }}
          />
        ) : null}
        <footer className="sw-document__footer" data-pagefind-ignore>
          <DocumentPager {...neighbours} />
          <div className="sw-document__colophon">
            <span>Sheetwrite is MIT licensed.</span>
            <a href="https://github.com/chh-ay/sheetwrite/issues">Report a documentation issue</a>
          </div>
        </footer>
      </main>
      <NavigationDrawer activeHref={activeHref} />
    </div>
  );
}
