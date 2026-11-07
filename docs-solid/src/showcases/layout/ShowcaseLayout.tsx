import { type Component, For, type JSX, Show } from "solid-js";

import { Icon } from "../../components/Icon.js";
import { SiteTopbar } from "../../components/SiteTopbar.js";

/*
 * The one layout every showcase uses: a short task statement, the live demo as
 * the main element with a side panel of controls, then the code that produced
 * it. On tablets and phones the panel follows the demo.
 *
 * `ShowcasePage` renders on the server only. The stage (the demo and its
 * panel) is the page's island: `ShowcaseStage` and the panel pieces below
 * render inside it. Styles: @docs/styles/showcase-layout.css.
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

function ShowcaseCodeBlock(props: {
  readonly code: ShowcaseCode;
  readonly guide: ShowcaseGuide | undefined;
}) {
  const Snippet = props.code.Snippet;
  return (
    <section aria-labelledby="showcase-code-title" class="sw-showcase__code">
      <header class="sw-showcase__section-header">
        <h2 class="sw-showcase__section-title" id="showcase-code-title">
          <Icon name="code" size="md" />
          {props.code.title}
        </h2>
        <Show when={props.guide}>
          {(guide) => (
            <a class="sw-link-arrow" href={guide().href}>
              <Icon name="book" />
              {guide().label}
              <Icon name="arrow-right" />
            </a>
          )}
        </Show>
      </header>
      <Snippet />
    </section>
  );
}

/** Props of {@link ShowcaseStage}. */
export interface ShowcaseStageProps {
  /** Accessible name of the demo region. */
  readonly demoLabel: string;
  /** The workbook or app the demo shows, named in a window bar above it. */
  readonly demoTitle?: string;
  /** Small controls that belong to the demo window itself (a width toggle, a status). */
  readonly demoActions?: JSX.Element;
  /** The live demo: the page's main element, given the full stage width. */
  readonly demo: JSX.Element;
  /** The side panel: one or more {@link ShowcaseControlGroup}s. */
  readonly controls?: JSX.Element;
}

/** The demo and its side panel, rendered inside the showcase's island. */
export function ShowcaseStage(props: ShowcaseStageProps) {
  // JSX props are getters that create their elements on each read, and a
  // hydrating island must create each element once: test for a prop by its
  // key, and read it only where it renders.
  const hasControls = "controls" in props;
  return (
    <div class="sw-showcase__stage" data-has-controls={hasControls}>
      <section aria-label={props.demoLabel} class="sw-showcase__demo">
        <Show when={props.demoTitle !== undefined}>
          <header class="sw-showcase__demo-bar">
            <span class="sw-showcase__demo-title">
              <Icon name="sheet" />
              {props.demoTitle}
            </span>
            {props.demoActions}
          </header>
        </Show>
        {props.demo}
      </section>
      <Show when={hasControls}>
        <aside aria-label="Controls" class="sw-showcase__controls">
          {props.controls}
        </aside>
      </Show>
    </div>
  );
}

/** Props of {@link ShowcaseControlGroup}. */
export interface ShowcaseControlGroupProps {
  readonly title: string;
  /** One short sentence on what the controls change. */
  readonly description?: JSX.Element;
  readonly children: JSX.Element;
}

/** A titled group of controls in the side panel. */
export function ShowcaseControlGroup(props: ShowcaseControlGroupProps) {
  return (
    <section class="sw-showcase__control-group">
      <h2 class="sw-showcase__control-title">{props.title}</h2>
      <Show when={"description" in props}>
        <p class="sw-showcase__control-description">{props.description}</p>
      </Show>
      <div class="sw-showcase__control-body">{props.children}</div>
    </section>
  );
}

/** Props of {@link ShowcaseSection}. */
export interface ShowcaseSectionProps {
  readonly id: string;
  readonly title: string;
  readonly children: JSX.Element;
}

/** A section of explanation after the demo and its code. */
export function ShowcaseSection(props: ShowcaseSectionProps) {
  return (
    <section aria-labelledby={props.id} class="sw-showcase__section sw-prose">
      <h2 class="sw-showcase__section-title" id={props.id}>
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

/** One label and live value in a {@link ShowcaseReadout}. */
export interface ShowcaseReadoutItem {
  readonly label: string;
  readonly value: JSX.Element;
}

/** A live label → value list for the side panel, such as timings or the current selection. */
export function ShowcaseReadout(props: { readonly items: readonly ShowcaseReadoutItem[] }) {
  return (
    <dl class="sw-showcase__readout">
      <For each={props.items}>
        {(item) => (
          <div>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        )}
      </For>
    </dl>
  );
}

/** Tone of a {@link ShowcaseStatus}. */
export type ShowcaseStatusTone = "ok" | "warn" | "error" | "neutral";

const STATUS_BADGE_TONE: Readonly<Record<ShowcaseStatusTone, string | undefined>> = {
  ok: "accent",
  warn: "warning",
  error: "danger",
  neutral: undefined,
};

/** A short status badge, announced politely when it changes. */
export function ShowcaseStatus(props: {
  readonly tone: ShowcaseStatusTone;
  readonly children: JSX.Element;
}) {
  return (
    <span
      aria-live="polite"
      class="sw-badge"
      data-tone={STATUS_BADGE_TONE[props.tone]}
      role="status"
    >
      {props.children}
    </span>
  );
}

/** One step of a showcase's walkthrough: what to do, how, and what happens. */
export interface ShowcaseStep {
  readonly action: string;
  readonly how: JSX.Element;
  readonly result: JSX.Element;
  /** A control that performs or prepares the step, such as "Go to the order". */
  readonly control?: JSX.Element;
}

/** The "Try it" walkthrough in the side panel: numbered steps with their results. */
export function ShowcaseSteps(props: { readonly steps: readonly ShowcaseStep[] }) {
  return (
    <ol class="sw-showcase__steps">
      <For each={props.steps}>
        {(step) => (
          <li>
            <strong>{step.action}</strong>
            <span>{step.how}</span>
            {step.control}
            <span class="sw-showcase__step-result">
              <Icon name="arrow-right" />
              {step.result}
            </span>
          </li>
        )}
      </For>
    </ol>
  );
}

/** One keyboard shortcut and what it does. */
export interface ShowcaseKey {
  readonly keys: readonly string[];
  readonly does: string;
}

/** The demo's keyboard model, as key caps beside what each does. */
export function ShowcaseKeys(props: { readonly keys: readonly ShowcaseKey[] }) {
  return (
    <dl class="sw-showcase__keys">
      <For each={props.keys}>
        {(entry) => (
          <div>
            <dt>
              <For each={entry.keys}>{(key) => <kbd>{key}</kbd>}</For>
            </dt>
            <dd>{entry.does}</dd>
          </div>
        )}
      </For>
    </dl>
  );
}
