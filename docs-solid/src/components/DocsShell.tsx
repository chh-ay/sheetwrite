import releaseFacts from "@docs/generated/release-facts.json" with { type: "json" };
import {
  breadcrumbsFor,
  type Crumb,
  DOCS_NAVIGATION,
  documentNeighbours,
  type NavigationItem,
  type NavigationLocation,
  navigationBadge,
  nearestNavigationItem,
} from "@docs/lib/navigation.js";
import type { OutlineItem } from "@docs/lib/outline.js";
import { editUrl, reportProblemUrl } from "@docs/lib/page-links.js";
import { For, type JSX, onCleanup, onMount, Show } from "solid-js";

import { Island } from "../islands/Island.js";
import { installNavigationDrawer, NAVIGATION_DIALOG_ID } from "../lib/navigation-drawer.js";
import { ApiSymbolFilter, listsExportedSymbols } from "./ApiSymbolFilter.js";
import { DocsSearch } from "./DocsSearch.js";
import { Icon } from "./Icon.js";
import { SiteTopbar } from "./SiteTopbar.js";
import { OutlineInline, OutlineRail } from "./TableOfContents.js";

/*
 * The docs page layout, ported from docs/src/components/DocsShell.tsx. Links
 * in the shell are plain anchors: in this prototype only three pages exist,
 * and with islands every page is its own document anyway.
 */

interface DocsShellProps {
  readonly activeHref: string;
  readonly children: JSX.Element;
  readonly description: string;
  readonly kind?: string;
  readonly outline: readonly OutlineItem[];
  readonly sourcePath?: string;
  readonly title: string;
}

function Breadcrumbs(props: { trail: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" class="sw-breadcrumb" data-pagefind-ignore>
      <ol>
        <For each={props.trail}>
          {(crumb) => (
            <li>
              <Show
                fallback={
                  <span aria-current={crumb === props.trail.at(-1) ? "page" : undefined}>
                    {crumb.label}
                  </span>
                }
                when={crumb.href}
              >
                {(href) => <a href={href()}>{crumb.label}</a>}
              </Show>
            </li>
          )}
        </For>
      </ol>
    </nav>
  );
}

/** The newest release leads the navigation. */
function LatestReleaseCard(props: { activeHref: string }) {
  const { href, date, dateLabel, version, summary } = releaseFacts.latest;
  return (
    <a
      aria-current={props.activeHref === href ? "page" : undefined}
      class="sw-release-card"
      href={href}
    >
      <span class="sw-release-card__meta">
        <span class="sw-release-card__badge">New</span>
        <time datetime={date}>{dateLabel}</time>
      </span>
      <strong>Sheetwrite {version}</strong>
      <span class="sw-release-card__summary">{summary}</span>
      <span class="sw-release-card__more">
        Read the release notes <Icon name="arrow-right" />
      </span>
    </a>
  );
}

const BADGE_TEXT = { new: "New", updated: "Updated" } as const;

/** New/Updated marker for a page changed in the latest release. */
function NavigationBadgeLabel(props: { item: NavigationItem }) {
  return (
    <Show when={navigationBadge(props.item, releaseFacts.latest.version)}>
      {(badge) => (
        <span class="sw-nav-badge" data-badge={badge()}>
          {BADGE_TEXT[badge()]}
        </span>
      )}
    </Show>
  );
}

/** One level of the tree; a group opens when the current page is inside it. */
function NavigationEntries(props: {
  items: readonly NavigationItem[];
  current: NavigationLocation | undefined;
}) {
  return (
    <For each={props.items}>
      {(item) => {
        const groupItems = item.items;
        if (groupItems === undefined) {
          return (
            <a
              aria-current={props.current?.href === item.href ? "page" : undefined}
              href={item.href}
            >
              <span>{item.label}</span>
              <NavigationBadgeLabel item={item} />
            </a>
          );
        }
        const open =
          (props.current?.ancestors.includes(item) ?? false) ||
          (item.href !== undefined && props.current?.href === item.href);
        const ownPage =
          item.href === undefined
            ? []
            : [{ label: "Overview", href: item.href, added: item.added, updated: item.updated }];
        return (
          <details class="sw-nav-subgroup" open={open}>
            <summary>
              <span>{item.label}</span>
              <Icon class="sw-disclosure-icon" name="chevron-right" />
            </summary>
            <div>
              <NavigationEntries current={props.current} items={[...ownPage, ...groupItems]} />
            </div>
          </details>
        );
      }}
    </For>
  );
}

/** The section list, shared by the sidebar and the drawer. */
function NavigationSections(props: { activeHref: string }) {
  const current = nearestNavigationItem(props.activeHref);
  return (
    <nav aria-label="Documentation" class="sw-sidebar__nav">
      <LatestReleaseCard activeHref={props.activeHref} />
      <For each={DOCS_NAVIGATION}>
        {(section) => (
          <details class="sw-nav-group" open={section.label === current?.section}>
            <summary>
              <span>{section.label}</span>
              <Icon class="sw-disclosure-icon" name="chevron-right" />
            </summary>
            <div>
              <NavigationEntries
                current={current}
                items={
                  section.href === undefined
                    ? section.items
                    : [{ label: "Overview", href: section.href }, ...section.items]
                }
              />
            </div>
          </details>
        )}
      </For>
      <section>
        <h2>Explore Sheetwrite</h2>
        <a href="/">Home</a>
        <a href="/showcases/">Showcases</a>
        <a href="https://github.com/chh-ay/sheetwrite">GitHub</a>
      </section>
      <section>
        <h2>For LLMs</h2>
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

/** The section list as a modal drawer; lib/navigation-drawer.ts opens and closes it. */
function NavigationDrawer(props: { activeHref: string }) {
  return (
    <dialog aria-label="Documentation" class="sw-nav-dialog" id={NAVIGATION_DIALOG_ID}>
      <div class="sw-nav-dialog__head">
        <span class="sw-nav-dialog__title">Documentation</span>
        <button
          aria-label="Close documentation menu"
          class="sw-icon-button"
          data-close-navigation=""
          type="button"
        >
          <Icon name="close" size="md" />
        </button>
      </div>
      <NavigationSections activeHref={props.activeHref} />
    </dialog>
  );
}

/** Reading order: the neighbours of this page, when it sits in one. */
function DocumentPager(props: { activeHref: string }) {
  const neighbours = documentNeighbours(props.activeHref);
  return (
    <Show when={neighbours.previous !== undefined || neighbours.next !== undefined}>
      <nav aria-label="Documentation pages" class="sw-doc-pager">
        <Show fallback={<span aria-hidden="true" />} when={neighbours.previous}>
          {(previous) => (
            <a
              class="sw-doc-pager__link sw-doc-pager__link--previous"
              href={previous().href}
              rel="prev"
            >
              <span>Previous</span>
              <strong>{previous().label}</strong>
            </a>
          )}
        </Show>
        <Show when={neighbours.next}>
          {(next) => (
            <a class="sw-doc-pager__link sw-doc-pager__link--next" href={next().href} rel="next">
              <span>Next</span>
              <strong>{next().label}</strong>
            </a>
          )}
        </Show>
      </nav>
    </Show>
  );
}

export function DocsShell(props: DocsShellProps) {
  // API page titles arrive as "Symbol | @sheetwrite/pkg"; the package reads better as a chip.
  const titleParts = () => props.title.split(" | ", 2);
  onMount(() => onCleanup(installNavigationDrawer()));

  return (
    <div class="sw-docs">
      <a class="sw-skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteTopbar
        pathname={props.activeHref}
        search={<Island component={DocsSearch} name="search" props={{}} />}
        trailing={
          <button
            aria-controls={NAVIGATION_DIALOG_ID}
            aria-expanded="false"
            aria-haspopup="dialog"
            class="sw-icon-button sw-nav-toggle"
            type="button"
          >
            <Icon name="menu" size="md" />
            <span class="sw-visually-hidden">Documentation menu</span>
          </button>
        }
      />
      <aside class="sw-sidebar">
        <NavigationSections activeHref={props.activeHref} />
      </aside>
      <main
        class="sw-document"
        data-pagefind-body
        data-pagefind-meta={titleParts()[1] ? `package:${titleParts()[1]}` : undefined}
        id="main-content"
      >
        <header class="sw-document__header">
          <Breadcrumbs trail={breadcrumbsFor(props.activeHref, titleParts()[0] ?? props.title)} />
          <h1>
            <span data-pagefind-meta="title">{titleParts()[0]}</span>
            <Show when={props.kind}>
              {(kind) => (
                <span class="api-status" data-kind={kind()} data-pagefind-ignore>
                  {kind()}
                </span>
              )}
            </Show>
            <Show when={titleParts()[1]}>
              {(titlePackage) => (
                <code class="sw-title-package" data-pagefind-ignore>
                  {titlePackage()}
                </code>
              )}
            </Show>
          </h1>
          <Show when={titleParts()[1] === undefined}>
            <span>{props.description}</span>
          </Show>
          <p class="sw-page-actions" data-pagefind-ignore>
            <Show when={props.sourcePath}>
              {(sourcePath) => (
                <a class="sw-button" data-size="sm" href={editUrl(sourcePath())}>
                  <Icon name="edit" />
                  Edit on GitHub
                </a>
              )}
            </Show>
            <a
              class="sw-button"
              data-size="sm"
              href={reportProblemUrl(props.title, props.activeHref)}
            >
              <Icon name="flag" />
              Report a problem
            </a>
          </p>
        </header>
        <Show when={listsExportedSymbols(props.activeHref)}>
          <Island
            component={ApiSymbolFilter}
            name="api-filter"
            props={{ pathname: props.activeHref }}
          />
        </Show>
        <Island
          component={OutlineInline}
          name="outline-inline"
          props={{ initial: props.outline, pathname: props.activeHref }}
        />
        <article class="sw-prose">{props.children}</article>
        <Island
          component={OutlineRail}
          name="outline-rail"
          props={{ initial: props.outline, pathname: props.activeHref }}
        />
        <footer class="sw-document__footer" data-pagefind-ignore>
          <DocumentPager activeHref={props.activeHref} />
          <div class="sw-document__colophon">
            <span>Sheetwrite is MIT licensed.</span>
            <a href="https://github.com/chh-ay/sheetwrite/issues">Report a documentation issue</a>
          </div>
        </footer>
      </main>
      <NavigationDrawer activeHref={props.activeHref} />
    </div>
  );
}
