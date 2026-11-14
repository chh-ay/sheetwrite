import { type Component, For, type JSX, Show } from "solid-js";

import { Icon } from "../../components/Icon.js";
import { SiteTopbar } from "../../components/SiteTopbar.js";
import { type ShowcaseCall, showcaseCalls } from "./showcase-calls.js";

/*
 * The showcase page around its island: the header with the task and facts,
 * then the code and the APIs it calls. Server only, and kept apart from
 * ShowcaseLayout.tsx, whose stage and panel pieces the islands ship.
 */

/** One measured fact in the showcase header, such as a row count or a timing. */
export interface ShowcaseFact {
  readonly label: string;
  /**
   * The value, read from the showcase's data or a generated source; never typed
   * by hand. A value the demo measures is an island that renders it.
   */
  readonly value: JSX.Element;
  /** The value is a code token, such as a package path: set in the code face, it wraps only after a "/". */
  readonly code?: boolean;
}

/** The code that produced the demo: an MDX snippet, highlighted at build time. */
export interface ShowcaseCode {
  readonly title: string;
  /** The default export of a `.mdx` snippet file holding one fenced code block. */
  readonly Snippet: Component;
  /** The snippet file's text (`?raw`): the aside lists the calls it makes, and long code folds. */
  readonly source: string;
  /** A picture beside the code, in place of the list of calls (an architecture diagram). */
  readonly figure?: JSX.Element;
  /**
   * What a call does in this example, by the call as written (`grid.setPivot`),
   * where its API summary says less.
   */
  readonly notes?: Readonly<Record<string, string>>;
}

/** A link from the showcase to the guide that explains it. */
export interface ShowcaseGuide {
  readonly href: string;
  readonly label: string;
}

/** Props of {@link ShowcasePage}. */
export interface ShowcasePageProps {
  /** The showcase's path segment, such as `spreadsheet`; marks Showcases in the top bar. */
  readonly id: string;
  /** The capability group, shown above the title. */
  readonly eyebrow: string;
  readonly title: string;
  /** One or two sentences: what the reader can do with the demo. */
  readonly task: JSX.Element;
  readonly facts?: readonly ShowcaseFact[];
  /** The page's island: the demo and its side panel, built with {@link ShowcaseStage}. */
  readonly stage: JSX.Element;
  readonly code?: ShowcaseCode;
  readonly guide?: ShowcaseGuide;
  /** How it works: {@link ShowcaseSection}s with their pictures, between the demo and the code. */
  readonly explain?: JSX.Element;
  /** Further explanation after the code, as {@link ShowcaseSection}s. */
  readonly children?: JSX.Element;
}

export function ShowcasePage(props: ShowcasePageProps) {
  return (
    <div class="sw-showcase">
      <SiteTopbar pathname={`/showcases/${props.id}/`} />
      <main class="sw-showcase__page" id="main-content">
        <header class="sw-showcase__header">
          <div class="sw-showcase__intro">
            <p class="sw-eyebrow">{props.eyebrow}</p>
            <h1 class="sw-showcase__title">{props.title}</h1>
            <p class="sw-showcase__task">{props.task}</p>
          </div>
          <Show when={(props.facts ?? []).length > 0}>
            <ShowcaseFacts facts={props.facts ?? []} />
          </Show>
        </header>
        {props.stage}
        {props.explain}
        <Show when={props.code}>
          {(code) => <ShowcaseCodeBlock code={code()} guide={props.guide} />}
        </Show>
        {props.children}
      </main>
    </div>
  );
}

function ShowcaseFacts(props: { readonly facts: readonly ShowcaseFact[] }) {
  return (
    <dl aria-label="Scenario scope" class="sw-showcase__facts">
      <For each={props.facts}>
        {(fact) => (
          <div class="sw-showcase__fact">
            <dt>{fact.label}</dt>
            <dd>
              {fact.code === true && typeof fact.value === "string" ? (
                <CodeFactValue value={fact.value} />
              ) : (
                fact.value
              )}
            </dd>
          </div>
        )}
      </For>
    </dl>
  );
}

/** A package path that may wrap after each "/", never inside a name. */
function CodeFactValue(props: { readonly value: string }) {
  return (
    <code>
      <For each={props.value.split("/")}>
        {(part, index) => (
          <>
            {index() > 0 && (
              <>
                /<wbr />
              </>
            )}
            {part}
          </>
        )}
      </For>
    </code>
  );
}

/**
 * Code longer than this folds to about its first 26 lines (26rem in
 * showcase-layout.css), with a control to show it all; shorter code shows
 * whole rather than hide a few lines behind the control.
 */
const FOLDED_LINES = 34;

/** The fenced code of a snippet file, without the fences. */
function fencedCode(source: string): string {
  const fence = source.match(/^(`{3,}|~{3,}).*\n([\s\S]*?)^\1\s*$/m);
  return fence?.[2] ?? source;
}

function ShowcaseCodeBlock(props: {
  readonly code: ShowcaseCode;
  readonly guide: ShowcaseGuide | undefined;
}) {
  const Snippet = props.code.Snippet;
  const code = fencedCode(props.code.source);
  const lines = code.trimEnd().split("\n").length;
  // The client build compiles route modules too; the guard keeps the API
  // manifest out of it.
  const calls = import.meta.env.SSR ? showcaseCalls(code, props.code.notes) : [];
  const hasFigure = "figure" in props.code;
  return (
    <div class="sw-showcase__code-row" data-figure={hasFigure ? "" : undefined}>
      <section aria-labelledby="showcase-code-title" class="sw-showcase__code">
        <header class="sw-showcase__section-header">
          <h2 class="sw-showcase__section-title" id="showcase-code-title">
            <Icon name="code" size="md" />
            {props.code.title}
          </h2>
        </header>
        <div class="sw-showcase__code-body" data-folded={lines > FOLDED_LINES ? "" : undefined}>
          <Snippet />
          <Show when={lines > FOLDED_LINES}>
            {/* Opening it unfolds the code above (showcase-layout.css). */}
            <details class="sw-showcase__code-more">
              <summary class="sw-button">
                <span data-when="closed">Show all {lines} lines</span>
                <span data-when="open">Show the first lines</span>
              </summary>
            </details>
          </Show>
        </div>
      </section>
      <aside aria-label="What this code uses" class="sw-showcase__code-aside">
        <Show
          fallback={
            <>
              <h3 class="sw-showcase__aside-title">APIs in this example</h3>
              <ul class="sw-showcase__calls">
                <For each={calls}>{(call) => <ShowcaseCallRow call={call} />}</For>
              </ul>
              {/* Pointing at or focusing a call tints the code lines that use it. */}
              <style>{callHighlightRules(calls)}</style>
            </>
          }
          when={hasFigure}
        >
          {props.code.figure}
        </Show>
        <Show when={props.guide}>
          {(guide) => (
            <a class="sw-link-arrow" href={guide().href}>
              <Icon name="book" />
              {guide().label}
              <Icon name="arrow-right" />
            </a>
          )}
        </Show>
      </aside>
    </div>
  );
}

/** A call beside the code: its name, linked to its reference, and what it does. */
function ShowcaseCallRow(props: { readonly call: ShowcaseCall }) {
  const name = <code>{props.call.label}</code>;
  return (
    <li class="sw-showcase__call" data-symbol={props.call.symbol}>
      <Show fallback={<span class="sw-showcase__call-name">{name}</span>} when={props.call.href}>
        {(href) => (
          <a class="sw-showcase__call-name" href={href()}>
            {name}
          </a>
        )}
      </Show>
      <Show when={props.call.summary}>
        {(summary) => (
          <p class="sw-showcase__call-summary">
            <For each={summary().split("`")}>
              {(part, index) => (index() % 2 === 1 ? <code>{part}</code> : part)}
            </For>
          </p>
        )}
      </Show>
    </li>
  );
}

/** One rule per listed call: its row, pointed at or focused, tints the code lines naming it. */
function callHighlightRules(calls: readonly ShowcaseCall[]): string {
  const selectors = calls.map(
    ({ symbol }) =>
      `.sw-showcase__code-row:has([data-symbol="${symbol}"]:is(:hover, :focus-within)) .ec-line:has([data-sw-symbol="${symbol}"])`,
  );
  return selectors.length === 0
    ? ""
    : `${selectors.join(",\n")} { background: var(--sw-code-symbol-highlight); }`;
}
