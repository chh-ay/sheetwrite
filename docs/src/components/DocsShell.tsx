import { Link } from "@tanstack/react-router";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";

import {
  DOCS_NAVIGATION,
  type DocumentNeighbours,
  documentNeighbours,
  type NavigationItem,
  navigationBadge,
} from "../lib/navigation.js";
import {
  LATEST_RELEASE,
  RELEASES_HREF,
  type ReleaseContext,
  releaseContext,
  releaseDate,
  releaseHref,
} from "../lib/releases.js";
import { ApiSymbolFilter } from "./ApiSymbolFilter.js";
import { DocsSearch } from "./DocsSearch.js";
import { PackageCommand } from "./PackageCommand.js";
import { InlineTableOfContents, TableOfContents, useDocumentOutline } from "./TableOfContents.js";
import { ThemeToggle } from "./ThemeToggle.js";

/**
 * Keep the sidebar only when it fits beside the reading panel; smaller
 * viewports use the same navigation in a modal drawer.
 */
const RAIL_VIEWPORT_QUERY = "(min-width: 64rem)";
const NAVIGATION_DIALOG_ID = "sw-docs-navigation";

interface DocsShellProps {
  activeHref?: string;
  children: ReactNode;
  description: string;
  /**
   * Include a collapsible outline above the article on narrow screens.
   * The task-oriented overview omits it.
   */
  reserveOutline?: boolean;
  title: string;
}

function Brand() {
  return (
    <Link aria-label="Sheetwrite home" className="sw-brand" to="/">
      <svg aria-hidden="true" viewBox="0 0 32 32">
        <rect height="26" rx="5" width="26" x="3" y="3" />
        <path d="M3 11h26M11 3v26M20 11v18M11 20h18" />
      </svg>
      <span>Sheetwrite</span>
    </Link>
  );
}

interface NavigationLocation {
  section: string;
  /** Groups between the section and the page, outermost first. */
  ancestors: readonly NavigationItem[];
  label: string;
  href: string;
}

/**
 * Deepest navigation entry whose href contains the current page, with the
 * groups above it, so the sidebar can open exactly that path and the header
 * can show it.
 */
function nearestNavigationItem(activeHref: string | undefined): NavigationLocation | undefined {
  if (activeHref === undefined) return undefined;
  let nearest: NavigationLocation | undefined;
  const visit = (section: string, item: NavigationItem, ancestors: NavigationItem[]): void => {
    const { href } = item;
    if (href !== undefined) {
      const matches = activeHref === href || (href !== "/docs/" && activeHref.startsWith(href));
      if (matches && (nearest === undefined || href.length > nearest.href.length)) {
        nearest = { section, ancestors: [...ancestors], label: item.label, href };
      }
    }
    if (item.items === undefined) return;
    ancestors.push(item);
    for (const child of item.items) visit(section, child, ancestors);
    ancestors.pop();
  };
  for (const section of DOCS_NAVIGATION) {
    for (const item of section.items) visit(section.label, item, []);
  }
  return nearest;
}

interface Crumb {
  href?: string;
  label: string;
}

/**
 * Trail for the page header. Section, group and package names come from the
 * same navigation model the sidebar renders, so the two never disagree about
 * where a page sits; the page's own name ends the trail.
 */
function breadcrumbsFor(activeHref: string | undefined, title: string): readonly Crumb[] {
  const trail: Crumb[] = [{ href: "/docs/", label: "Documentation" }];
  // The overview is the destination itself.
  if (activeHref === undefined || activeHref === "/docs/") return trail;
  const nearest = nearestNavigationItem(activeHref);
  if (nearest === undefined) return [...trail, { label: title }];
  // A section's index page carries the section's name; one crumb is enough.
  if (nearest.section === title) return [...trail, { label: title }];
  trail.push({ label: nearest.section });
  for (const group of nearest.ancestors) trail.push({ href: group.href, label: group.label });
  // The entry the page itself belongs to is not a step above it.
  if (nearest.href !== activeHref) trail.push({ href: nearest.href, label: nearest.label });
  return [...trail, { label: title }];
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
function LatestReleaseCard({
  activeHref,
  onNavigate,
}: Readonly<{ activeHref?: string; onNavigate?: () => void }>) {
  const href = releaseHref(LATEST_RELEASE.version);
  return (
    <Link
      aria-current={activeHref === href ? "page" : undefined}
      className="sw-release-card"
      onClick={onNavigate}
      to={href}
    >
      <span className="sw-release-card__meta">
        <span className="sw-release-card__badge">New</span>
        <time dateTime={LATEST_RELEASE.date}>{releaseDate(LATEST_RELEASE)}</time>
      </span>
      <strong>Sheetwrite {LATEST_RELEASE.version}</strong>
      <span className="sw-release-card__summary">{LATEST_RELEASE.summary}</span>
      <span className="sw-release-card__more">
        Read the release notes <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}

const BADGE_TEXT = { new: "New", updated: "Updated" } as const;

/** New/Updated marker for the latest release; text, so screen readers announce it. */
function NavigationBadgeLabel({ item }: Readonly<{ item: NavigationItem }>) {
  const badge = navigationBadge(item, LATEST_RELEASE.version);
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
          <NavigationBadgeLabel item={item} />
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

/**
 * The section list itself, shared by the sidebar and the drawer so the two can
 * never advertise different documentation. `onNavigate` lets the drawer close
 * once a reader has picked a destination.
 */
function NavigationSections({
  activeHref,
  onNavigate,
}: Readonly<{ activeHref?: string; onNavigate?: () => void }>) {
  const current = nearestNavigationItem(activeHref);
  return (
    <nav aria-label="Documentation" className="sw-sidebar__nav">
      <LatestReleaseCard activeHref={activeHref} onNavigate={onNavigate} />
      {DOCS_NAVIGATION.map((section) => (
        <details
          className="sw-nav-group"
          key={`${section.label}:${current?.section}`}
          open={section.label === current?.section}
        >
          <summary>
            <span>{section.label}</span>
            <NavigationBadgeLabel item={section} />
          </summary>
          <div>
            <NavigationEntries current={current} items={section.items} onNavigate={onNavigate} />
          </div>
        </details>
      ))}
      <section>
        <h2>Explore Sheetwrite</h2>
        <Link activeOptions={{ exact: true }} onClick={onNavigate} to="/">
          Home
        </Link>
        <Link activeOptions={{ exact: true }} onClick={onNavigate} to="/showcases/">
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

interface NavigationDrawerProps {
  activeHref?: string;
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
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <NavigationSections activeHref={activeHref} onNavigate={onDismiss} />
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

/** The current version is one click from every page: it opens its release post. */
function VersionLink() {
  return (
    <Link
      aria-label={`Release notes for Sheetwrite ${LATEST_RELEASE.version}`}
      className="sw-version-link"
      to={releaseHref(LATEST_RELEASE.version)}
    >
      v{LATEST_RELEASE.version}
    </Link>
  );
}

/** On a release post: its date and a step to the newer and older posts. */
function ReleaseStrip({ release, newer, older }: Readonly<ReleaseContext>) {
  return (
    <nav aria-label="Release versions" className="sw-release-strip" data-pagefind-ignore>
      <span>
        Released <time dateTime={release.date}>{releaseDate(release)}</time>
      </span>
      {release === LATEST_RELEASE ? <span className="sw-release-strip__latest">Latest</span> : null}
      {older === undefined ? null : (
        <Link rel="prev" to={releaseHref(older.version)}>
          ← {older.version}
        </Link>
      )}
      {newer === undefined ? null : (
        <Link rel="next" to={releaseHref(newer.version)}>
          {newer.version} →
        </Link>
      )}
      <Link to={RELEASES_HREF}>All releases</Link>
    </nav>
  );
}

export function DocsShell({
  activeHref,
  children,
  description,
  reserveOutline,
  title,
}: Readonly<DocsShellProps>) {
  // API page titles arrive as "Symbol | @sheetwrite/pkg"; the package reads
  // better as a chip than as part of a display-size heading.
  const [titleMain, titlePackage] = title.split(" | ", 2);
  const outline = useDocumentOutline();
  const neighbours = documentNeighbours(activeHref);
  const release = releaseContext(activeHref);
  // Release notes are their own header section; every other page is Docs.
  const inReleases = activeHref?.startsWith(RELEASES_HREF) ?? false;
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
    <div className={`sw-docs${activeHref === "/docs/" ? " sw-docs--overview" : ""}`}>
      <a className="sw-skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="sw-docs-header">
        <div className="sw-docs-header__brand">
          <Brand />
          <VersionLink />
        </div>
        <DocsSearch />
        <div className="sw-docs-header__actions">
          <nav aria-label="Product links" className="sw-docs-header__links">
            <Link className="sw-docs-header__home" to="/">
              Home
            </Link>
            <Link
              activeOptions={{ exact: true }}
              aria-current={inReleases ? undefined : "page"}
              className="sw-docs-header__docs"
              to="/docs/"
            >
              Docs
            </Link>
            <Link
              aria-current={inReleases ? "page" : undefined}
              className="sw-docs-header__releases"
              to={RELEASES_HREF}
            >
              Releases
            </Link>
            <Link className="sw-docs-header__showcases" to="/showcases/">
              Showcases
            </Link>
            <a
              className="sw-docs-header__ai"
              href="/llms.txt"
              title="Curated documentation index for AI agents"
            >
              llms.txt
            </a>
          </nav>
          <ThemeToggle />
          <button
            aria-controls={NAVIGATION_DIALOG_ID}
            aria-expanded={navigationOpen}
            aria-haspopup="dialog"
            className="sw-icon-button sw-nav-toggle"
            onClick={openNavigation}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <span className="sw-visually-hidden">Documentation menu</span>
          </button>
        </div>
      </header>
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
            {titlePackage ? (
              <code className="sw-title-package" data-pagefind-ignore>
                {titlePackage}
              </code>
            ) : null}
          </h1>
          {/* Symbol pages repeat this sentence as the body's opening summary. */}
          {titlePackage === undefined ? <span>{description}</span> : null}
          {release === undefined ? null : (
            <>
              <ReleaseStrip {...release} />
              <PackageCommand
                note={`Update each adapter and add-on you use to ${release.release.version} too: all packages release together.`}
                packages={`@sheetwrite/core@${release.release.version}`}
              />
            </>
          )}
        </header>
        <ApiSymbolFilter />
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
            <a href="https://github.com/chh-ay/sheetwrite/issues">Report a documentation issue</a>
          </div>
        </footer>
      </main>
      <NavigationDrawer
        activeHref={activeHref}
        dialogRef={navigationDialog}
        onClosed={() => setNavigationOpen(false)}
        onDismiss={() => navigationDialog.current?.close()}
      />
    </div>
  );
}
