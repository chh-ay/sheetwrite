import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef } from "react";
import { DOCS_NAVIGATION } from "../lib/navigation.js";
import { DocsSearch } from "./DocsSearch.js";
import { InlineTableOfContents, TableOfContents, useDocumentOutline } from "./TableOfContents.js";
import { ThemeToggle } from "./ThemeToggle.js";

interface DocsShellProps {
  activeHref?: string;
  children: ReactNode;
  description: string;
  /**
   * Reserves the outline slot above the article. Markdown document pages pass
   * true so their outline can arrive after hydration without shifting the
   * text; authored pages (the overview) have no outline and skip the slot.
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
  label: string;
  href: string;
}

/** Deepest navigation entry whose href contains the current page. */
function nearestNavigationItem(activeHref: string | undefined): NavigationLocation | undefined {
  if (activeHref === undefined) return undefined;
  let nearest: NavigationLocation | undefined;
  for (const section of DOCS_NAVIGATION) {
    for (const item of section.items) {
      const matches =
        activeHref === item.href || (item.href !== "/docs/" && activeHref.startsWith(item.href));
      if (matches && (nearest === undefined || item.href.length > nearest.href.length)) {
        nearest = { section: section.label, label: item.label, href: item.href };
      }
    }
  }
  return nearest;
}

interface Crumb {
  href?: string;
  label: string;
}

/**
 * Trail for the page header. Section and package names come from the same
 * navigation model the sidebar renders, so the two never disagree about where
 * a page sits; the page's own name ends the trail.
 */
function breadcrumbsFor(activeHref: string | undefined, title: string): readonly Crumb[] {
  const trail: Crumb[] = [{ href: "/docs/", label: "Documentation" }];
  // The overview is the destination itself.
  if (activeHref === undefined || activeHref === "/docs/") return trail;
  const nearest = nearestNavigationItem(activeHref);
  if (nearest === undefined) return [...trail, { label: title }];
  trail.push({ label: nearest.section });
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

function Sidebar({ activeHref }: Readonly<{ activeHref?: string }>) {
  const currentHref = nearestNavigationItem(activeHref)?.href;
  const nav = useRef<HTMLElement>(null);

  // Below 48rem the sidebar is a horizontal scroller, so the current page is
  // off-screen unless it is brought into view.
  useEffect(() => {
    if (currentHref === undefined) return;
    nav.current
      ?.querySelector('a[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [currentHref]);

  return (
    <nav aria-label="Documentation" className="sw-sidebar__nav" ref={nav}>
      {DOCS_NAVIGATION.map((section) => (
        <section key={section.label}>
          <h2>{section.label}</h2>
          {section.items.map((item) => (
            <Link
              activeOptions={{ exact: true }}
              aria-current={currentHref === item.href ? "page" : undefined}
              key={item.href}
              to={item.href}
            >
              {item.label}
            </Link>
          ))}
        </section>
      ))}
      <section>
        <h2>Live showcases</h2>
        <Link activeOptions={{ exact: true }} to="/showcases/">
          All capabilities
        </Link>
      </section>
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
  return (
    <div className="sw-docs">
      <a className="sw-skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="sw-docs-header">
        <Brand />
        <DocsSearch />
        <nav aria-label="Product links" className="sw-docs-header__links">
          <a href="https://github.com/chh-ay/sheetwrite">GitHub</a>
          <ThemeToggle />
        </nav>
      </header>
      <aside className="sw-sidebar">
        <Sidebar activeHref={activeHref} />
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
          <span>{description}</span>
        </header>
        {reserveOutline === true ? <InlineTableOfContents items={outline} /> : null}
        <article
          className={`sw-prose${activeHref === "/docs/reference/compatibility-limits/" ? " sw-prose--resource-limits" : ""}`}
        >
          {children}
        </article>
        <TableOfContents items={outline} />
        <footer className="sw-document__footer" data-pagefind-ignore>
          <span>Sheetwrite is MIT licensed.</span>
          <a href="https://github.com/chh-ay/sheetwrite/issues">Report a documentation issue</a>
        </footer>
      </main>
    </div>
  );
}
