import { breadcrumbsFor, type Crumb } from "@docs/lib/navigation.js";
import { editUrl, reportProblemUrl } from "@docs/lib/page-links.js";
import { For, type JSX, Show } from "solid-js";

import { Icon } from "./Icon.js";

/*
 * The reading panel of a docs page: breadcrumbs, title, summary, page actions
 * and the article, as docs/src/components/DocsShell.tsx renders its <main>.
 * The site header, sidebar and outline wrap it in the shell step of the
 * migration (#504).
 */

interface DocumentPageProps {
  readonly href: string;
  readonly title: string;
  readonly description: string;
  /** Declaration kind of an API symbol page, shown as a chip beside the title. */
  readonly kind?: string;
  /** The page's source file in the repository, for Edit on GitHub; generated pages have none. */
  readonly sourcePath?: string;
  readonly children: JSX.Element;
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
                  // Ancestors are never the current page; the last crumb owns aria-current.
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

export function DocumentPage(props: DocumentPageProps) {
  // API page titles arrive as "Symbol | @sheetwrite/pkg"; the package reads better as a chip.
  const [titleMain = props.title, titlePackage] = props.title.split(" | ", 2);
  return (
    <main
      class="sw-document"
      data-pagefind-body
      // Attribute-value meta works regardless of element nesting.
      data-pagefind-meta={titlePackage ? `package:${titlePackage}` : undefined}
      id="main-content"
    >
      <header class="sw-document__header">
        <Breadcrumbs trail={breadcrumbsFor(props.href, titleMain)} />
        <h1>
          <span data-pagefind-meta="title">{titleMain}</span>
          <Show when={props.kind}>
            {(kind) => (
              <span class="api-status" data-kind={kind()} data-pagefind-ignore>
                {kind()}
              </span>
            )}
          </Show>
          <Show when={titlePackage}>
            <code class="sw-title-package" data-pagefind-ignore>
              {titlePackage}
            </code>
          </Show>
        </h1>
        {/* Symbol pages repeat this sentence as the body's opening summary. */}
        <Show when={titlePackage === undefined}>
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
          <a class="sw-button" data-size="sm" href={reportProblemUrl(props.title, props.href)}>
            <Icon name="flag" />
            Report a problem
          </a>
        </p>
      </header>
      <article
        class={`sw-prose${props.href === "/docs/reference/compatibility-limits/" ? " sw-prose--resource-limits" : ""}`}
      >
        {props.children}
      </article>
    </main>
  );
}
