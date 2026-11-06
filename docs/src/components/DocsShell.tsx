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
import { ApiSymbolFilter } from "./ApiSymbolFilter.js";
import { BrandMark } from "./BrandMark.js";
import { DocsSearch } from "./DocsSearch.js";
import { DocsTopbar } from "./DocsTopbar.js";
import { Icon } from "./Icon.js";
import { InlineTableOfContents, TableOfContents, useDocumentOutline } from "./TableOfContents.js";

/**
 * Keep the sidebar only when it fits beside the reading panel; smaller
 * viewports use the same navigation in a modal drawer.
 */
const RAIL_VIEWPORT_QUERY = "(min-width: 64rem)";
const NAVIGATION_DIALOG_ID = "sw-docs-navigation";

interface DocsShellProps {
  activeHref?: string;
  /** The page's source on GitHub, for "Edit on GitHub". */
  editUrl?: string;
  /** A new GitHub issue about the page, for "Report a problem". */
  issueUrl?: string;
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
  title: string;
}

/**
 * The one sidebar marker: "New" on a page added in the current release; text,
 * so screen readers announce it. Only page links carry it: a group marker
 * would repeat its pages' markers on a collapsed row.
 */
function NavigationBadgeLabel({ item }: Readonly<{ item: NavigationItem }>) {
  if (item.items !== undefined || navigationBadge(item, CURRENT_RELEASE) !== "new") {
    return null;
  }
  return <span className="sw-nav-badge">New</span>;
}

interface NavigationEntriesProps {
  items: readonly NavigationItem[];
  current: NavigationLocation | undefined;
  onNavigate?: () => void;
}

/**
 * One level of the tree. A group is a collapsible block that opens when the
 * current page is inside it; its own page, if any, is the first link inside,
 * because a link in the toggle row would also toggle the group.
 */
function NavigationEntries({ items, current, onNavigate }: Readonly<NavigationEntriesProps>) {
  return items.map((item) => {
    if (item.items === undefined) {
      return (
        <Link
          activeOptions={{ exact: true }}
          aria-current={current?.href === item.href ? "page" : undefined}
          key={item.href}
          onClick={onNavigate}
          to={item.href}
        >
          {item.icon === undefined ? null : <Icon name={item.icon} />}
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
              icon: item.icon,
              added: item.added,
              updated: item.updated,
            },
          ];
    return (
      <details className="sw-nav-subgroup" key={`${item.label}:${open}`} open={open}>
        <summary>
          {item.icon === undefined ? null : <Icon name={item.icon} />}
          <span>{item.label}</span>
          <Icon className="sw-disclosure-icon" name="chevron-right" />
        </summary>
        <div>
          <NavigationEntries
            current={current}
            items={[...ownPage, ...item.items]}
            onNavigate={onNavigate}
          />
        </div>
      </details>
    );
  });
}

/** A section of one page and no overview leads with that page, unlabelled. */
function sectionLabelHidden(section: NavigationSection): boolean {
  return section.href === undefined && section.items.length === 1;
}

/**
 * The current tab's sections, shared by the sidebar and the drawer so the two
 * can never advertise different documentation: each section is a small label
 * over its pages. `onNavigate` lets the drawer close once a reader has picked
 * a destination.
 */
function NavigationSections({
  activeHref,
  tab,
  onNavigate,
}: Readonly<{ activeHref?: string; tab: DocsTabId; onNavigate?: () => void }>) {
  const current = nearestNavigationItem(activeHref);

  return (
    <nav aria-label="Documentation" className="sw-sidebar__nav">
      {tabSections(tab).map((section) => (
        <section className="sw-nav-section" key={section.label}>
          {sectionLabelHidden(section) ? null : <h2>{section.label}</h2>}
          <NavigationEntries
            current={current}
            // A section's own page leads its list, named Overview as a group's is.
            items={
              section.href === undefined
                ? section.items
                : [{ label: "Overview", href: section.href, icon: section.icon }, ...section.items]
            }
            onNavigate={onNavigate}
          />
        </section>
      ))}
    </nav>
  );
}

interface NavigationDrawerProps {
  activeHref?: string;
  tab: DocsTabId;
  dialogRef: RefObject<HTMLDialogElement | null>;
  /** Asks the modal to close; Escape and the browser's own close report via onClosed. */
  onDismiss: () => void;
  onClosed: () => void;
}

/**
 * The section list for viewports without room for the sidebar. A modal dialog
 * brings the focus trap, Escape handling, backdrop, and focus restore with it;
 * the header button only opens it.
 */
function NavigationDrawer({
  activeHref,
  tab,
  dialogRef,
  onDismiss,
  onClosed,
}: Readonly<NavigationDrawerProps>) {
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- a modal dialog already closes on Escape, so the backdrop click needs no second key handler.
    <dialog
      aria-label="Documentation"
      className="sw-nav-dialog"
      id={NAVIGATION_DIALOG_ID}
      onClick={(event) => {
        // Only the backdrop targets the dialog itself: its children fill it.
        if (event.target === event.currentTarget) onDismiss();
      }}
      onClose={onClosed}
      ref={dialogRef}
    >
      <div className="sw-nav-dialog__head">
        <span className="sw-nav-dialog__title">Documentation</span>
        <button
          aria-label="Close documentation menu"
          className="sw-icon-button"
          onClick={onDismiss}
          type="button"
        >
          <Icon name="close" size="md" />
        </button>
      </div>
      <NavigationSections activeHref={activeHref} onNavigate={onDismiss} tab={tab} />
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

export function DocsShell({
  activeHref,
  children,
  description,
  editUrl,
  issueUrl,
  kind,
  outline: buildOutline,
  reserveOutline,
  symbolCount,
  title,
}: Readonly<DocsShellProps>) {
  // API page titles arrive as "Symbol | @sheetwrite/pkg"; the package reads
  // better as the eyebrow than as part of a display-size heading.
  const [titleMain, titlePackage] = title.split(" | ", 2);
  const tab = tabForHref(activeHref);

  const outline = useDocumentOutline(buildOutline);
  const neighbours = documentNeighbours(activeHref);

  const navigationDialog = useRef<HTMLDialogElement>(null);
  const [navigationOpen, setNavigationOpen] = useState(false);

  // A drawer left open while the viewport grows would sit on top of the rail.
  useEffect(() => {
    const rail = window.matchMedia(RAIL_VIEWPORT_QUERY);
    const closeWhenRailFits = (event: MediaQueryListEvent) => {
      if (event.matches) navigationDialog.current?.close();
    };
    rail.addEventListener("change", closeWhenRailFits);
    return () => rail.removeEventListener("change", closeWhenRailFits);
  }, []);

  const openNavigation = () => {
    const dialog = navigationDialog.current;
    if (dialog === null) return;

    dialog.showModal();
    setNavigationOpen(true);
    // The current page can sit far down a long section list.
    requestAnimationFrame(() => {
      dialog
        .querySelector<HTMLElement>('a[aria-current="page"]')
        ?.scrollIntoView({ block: "nearest" });
    });
  };

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
        menu={
          <button
            aria-controls={NAVIGATION_DIALOG_ID}
            aria-expanded={navigationOpen}
            aria-haspopup="dialog"
            className="sw-icon-button sw-nav-toggle"
            onClick={openNavigation}
            type="button"
          >
            <Icon name="menu" size="md" />
            <span className="sw-visually-hidden">Documentation menu</span>
          </button>
        }
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
          {editUrl === undefined && issueUrl === undefined ? null : (
            <p className="sw-page-actions" data-pagefind-ignore>
              {editUrl === undefined ? null : (
                <a className="sw-button" data-size="sm" href={editUrl}>
                  <Icon name="edit" />
                  Edit on GitHub
                </a>
              )}
              {issueUrl === undefined ? null : (
                <a className="sw-button" data-size="sm" href={issueUrl}>
                  <Icon name="flag" />
                  Report a problem
                </a>
              )}
            </p>
          )}
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
      <NavigationDrawer
        activeHref={activeHref}
        dialogRef={navigationDialog}
        onClosed={() => setNavigationOpen(false)}
        onDismiss={() => navigationDialog.current?.close()}
        tab={tab}
      />
    </div>
  );
}
