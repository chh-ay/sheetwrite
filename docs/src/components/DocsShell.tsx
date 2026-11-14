import {
  type DocumentNeighbours,
  documentNeighbours,
  nearestNavigationItem,
  tabForHref,
} from "@docs/lib/navigation.js";
import type { OutlineItem } from "@docs/lib/outline.js";
import { editUrl, reportProblemUrl } from "@docs/lib/page-links.js";
import { type JSX, Show } from "solid-js";

import { DOCS_CARD_ART } from "../art/docs-art.js";
import { SECTION_HEADER_ART, SECTION_MARKS } from "../art/docs-pictures.js";
import { SectionMark } from "../art/section-marks.js";
import { Island } from "../islands/Island.js";
import { revealCurrentNavigation } from "../lib/shell-ids.js";
import { ApiSymbolFilter, MINIMUM_FILTERABLE_CARDS } from "./ApiSymbolFilter.js";
import { BrandMark } from "./BrandMark.js";
import { NavigationSections } from "./DocsNavigation.js";
import { DocsTopbar } from "./DocsTopbar.js";
import { Icon } from "./Icon.js";
import { InlineTableOfContents, TableOfContents } from "./TableOfContents.js";

/*
 * The documentation page layout, ported from docs/src/components/DocsShell.tsx:
 * the sidebar, the top bar, the page head, the article with its outline, and
 * the footer. It is static markup; search and the API filter are islands, and
 * lib/shell.ts adds the theme toggle, the menu, the outline's current section
 * and the sidebar's scroll position.
 */

interface DocsShellProps {
  readonly activeHref?: string;
  readonly children: JSX.Element;
  readonly description: string;
  /** Declaration kind of an API symbol page, shown as a chip beside the title. */
  readonly kind?: string;
  /** The page's outline from the build. */
  readonly outline?: readonly OutlineItem[];
  /**
   * Include the outline: on the right on wide screens, a collapsible row above
   * the article on narrow ones. Not-found pages omit it.
   */
  readonly reserveOutline?: boolean;
  /** An API entry point's exported symbol count, so its filter renders on the server. */
  readonly symbolCount?: number;
  /** The page's source file in the repository, for Edit on GitHub; generated pages have none. */
  readonly sourcePath?: string;
  readonly title: string;
}

/**
 * Holds the sidebar's links out of sight until REVEAL_SCRIPT has scrolled the
 * current row into view. A browser that paints while the sidebar is still
 * parsing (Firefox can) then shows its surface for that frame, not the list
 * at the top jumping to the current row.
 */
const HOLD_SCRIPT = 'document.documentElement.dataset.navReveal="pending"';
/** Places the current page's sidebar row and tab in view while the page parses. */
const REVEAL_SCRIPT = `(${revealCurrentNavigation.toString()})()`;

/** Reading order: the neighbours of this page, when it sits in one. */
function DocumentPager(props: DocumentNeighbours) {
  return (
    <Show when={props.previous !== undefined || props.next !== undefined}>
      <nav aria-label="Documentation pages" class="sw-doc-pager">
        <Show
          // Keeps "Next" in its own column when it is the only neighbour.
          fallback={<span aria-hidden="true" />}
          when={props.previous}
        >
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
        <Show when={props.next}>
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

/**
 * The page's eyebrow: the group it sits in (the nearest group, else its
 * section), or the package of a generated symbol page. None where it would
 * repeat the title: on a tab's landing page, whose section mark and title
 * already name the section, or when it reads the same as the title.
 */
function eyebrowFor(
  activeHref: string | undefined,
  title: string,
  titlePackage: string | undefined,
): string | undefined {
  if (titlePackage !== undefined) return titlePackage;
  if (activeHref !== undefined && activeHref in SECTION_MARKS) return undefined;
  const location = nearestNavigationItem(activeHref);
  if (location === undefined) return "Documentation";
  const group = location.ancestors.at(-1);
  // A group's own page is the group: the section names its place.
  const eyebrow = group === undefined || group.href === activeHref ? location.section : group.label;
  return eyebrow.toLowerCase() === title.toLowerCase() ? undefined : eyebrow;
}

/** A section page's illustration beside its title (art/docs-pictures.ts); nothing elsewhere. */
function SectionArt(props: { readonly href: string | undefined }) {
  const Art = DOCS_CARD_ART[SECTION_HEADER_ART[props.href ?? ""] ?? ""];
  return Art === undefined ? null : (
    <div class="sw-section-art">
      <Art />
    </div>
  );
}

export function DocsShell(props: DocsShellProps) {
  // API page titles arrive as "Symbol | @sheetwrite/pkg"; the package reads
  // better as the eyebrow than as part of a display-size heading.
  const [titleMain = props.title, titlePackage] = props.title.split(" | ", 2);
  const tab = tabForHref(props.activeHref);
  const outline = props.outline ?? [];
  const symbolCount = props.symbolCount ?? 0;

  return (
    <div class={`sw-docs${props.kind === undefined ? "" : " sw-docs--api"}`}>
      <a class="sw-skip-link" href="#main-content">
        Skip to content
      </a>
      <DocsTopbar activeHref={props.activeHref} activeTab={tab} />
      <script innerHTML={HOLD_SCRIPT} />
      <aside class="sw-sidebar">
        <a aria-label="Sheetwrite home" class="sw-sidebar__brand" href="/">
          <BrandMark />
          <span>Sheetwrite</span>
        </a>
        <NavigationSections activeHref={props.activeHref} tab={tab} />
      </aside>
      <script innerHTML={REVEAL_SCRIPT} />
      <main
        class="sw-document"
        data-pagefind-body
        // Attribute-value meta works regardless of element nesting; the h1
        // span below captures the clean symbol title.
        data-pagefind-meta={titlePackage ? `package:${titlePackage}` : undefined}
        id="main-content"
      >
        <header class="sw-document__header">
          <Show when={SECTION_MARKS[props.activeHref ?? ""]}>
            {(mark) => <SectionMark name={mark()} />}
          </Show>
          <Show when={eyebrowFor(props.activeHref, titleMain, titlePackage)}>
            {(eyebrow) => (
              <p class="sw-document__eyebrow" data-pagefind-ignore>
                {eyebrow()}
              </p>
            )}
          </Show>
          <SectionArt href={props.activeHref} />
          <h1>
            <span data-pagefind-meta="title">{titleMain}</span>
            <Show when={props.kind}>
              {(kind) => (
                <span class="api-status" data-kind={kind()} data-pagefind-ignore>
                  {kind()}
                </span>
              )}
            </Show>
          </h1>
          {/* Symbol pages repeat this sentence as the body's opening summary. */}
          <Show when={titlePackage === undefined}>
            <p class="sw-document__lead">{props.description}</p>
          </Show>
          <Show when={props.activeHref}>
            {(activeHref) => (
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
                  href={reportProblemUrl(props.title, activeHref())}
                >
                  <Icon name="flag" />
                  Report a problem
                </a>
              </p>
            )}
          </Show>
        </header>
        <Show when={symbolCount >= MINIMUM_FILTERABLE_CARDS}>
          <Island
            component={ApiSymbolFilter}
            hydrate="interaction"
            name="api-symbol-filter"
            props={{ symbolCount }}
          />
        </Show>
        <Show when={props.reserveOutline === true}>
          <InlineTableOfContents items={outline} />
        </Show>
        <article
          class={`sw-prose${props.activeHref === "/docs/reference/compatibility-limits/" ? " sw-prose--resource-limits" : ""}`}
        >
          {props.children}
        </article>
        <Show when={props.reserveOutline === true}>
          <TableOfContents items={outline} />
        </Show>
        <footer class="sw-document__footer" data-pagefind-ignore>
          <DocumentPager {...documentNeighbours(props.activeHref)} />
          <div class="sw-document__colophon">
            <span>Sheetwrite is MIT licensed.</span>
            <a href="/llms.txt">llms.txt</a>
            <a href="https://github.com/chh-ay/sheetwrite/issues">Report a documentation issue</a>
          </div>
        </footer>
      </main>
    </div>
  );
}
