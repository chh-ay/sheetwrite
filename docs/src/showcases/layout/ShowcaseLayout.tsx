import { For, type JSX, Show } from "solid-js";

import { Icon } from "../../components/Icon.js";

/*
 * The one layout every showcase uses: a short task statement, the live demo as
 * the main element with a side panel of controls, then the code that produced
 * it. On tablets and phones the panel follows the demo.
 *
 * The page itself (`ShowcasePage.tsx`) renders on the server only. The stage
 * (the demo and its panel) is the page's island: `ShowcaseStage` and the panel
 * pieces below render inside it. Styles: @docs/styles/showcase-layout.css.
 */

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
  /** The diagram the text explains, beside it at wide widths. */
  readonly figure?: JSX.Element;
  /**
   * How the text and its figure share the row: the text beside the figure
   * (`beside`, the default), half the row each for a panel of controls
   * (`half`), or the figure under the heading at full width, for a section
   * whose own content is one small control (`stack`).
   */
  readonly layout?: "beside" | "half" | "stack";
}

/** A section of explanation; with a figure, the text sits beside its picture. */
export function ShowcaseSection(props: ShowcaseSectionProps) {
  const hasFigure = "figure" in props;
  const layout = props.layout ?? "beside";
  return (
    <section
      aria-labelledby={props.id}
      class="sw-showcase__section sw-prose"
      data-figure={hasFigure ? layout : undefined}
    >
      <h2 class="sw-showcase__section-title" id={props.id}>
        {props.title}
      </h2>
      <Show fallback={props.children} when={hasFigure}>
        <div class="sw-showcase__section-text">{props.children}</div>
        <figure class="sw-showcase__figure">{props.figure}</figure>
      </Show>
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
