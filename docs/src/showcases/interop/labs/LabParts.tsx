import { createSignal, type JSX, onCleanup, Show } from "solid-js";

import { Icon, type IconName } from "../../../components/Icon.js";

/*
 * The parts every interoperability lab opens with: an eyebrow, the reader's
 * question, a short answer, one line on its single technical term, and one
 * figure. Styles: styles/showcases/interoperability.css (`sw-lab-*`).
 */

/** Props of {@link LabAnswer}. */
export interface LabAnswerProps {
  readonly icon: IconName;
  readonly name: string;
  /** The reader's question, as the lab's heading. */
  readonly question: string;
  readonly headingId: string;
  /** One to three sentences that answer the question. */
  readonly answer: JSX.Element;
  /** One line explaining the lab's single technical term. */
  readonly term: JSX.Element;
  /** The lab's figure, beside the answer at desktop widths. */
  readonly figure?: JSX.Element;
}

export function LabAnswer(props: LabAnswerProps) {
  const hasFigure = "figure" in props;
  return (
    <div class="sw-lab-answer" data-has-figure={hasFigure ? "true" : undefined}>
      <div class="sw-lab-answer__text">
        <p class="sw-lab-eyebrow">
          <Icon name={props.icon} />
          {props.name}
        </p>
        <h3 id={props.headingId}>{props.question}</h3>
        <p class="sw-lab-lead">{props.answer}</p>
        <p class="sw-lab-term">
          <Icon name="info" />
          <span>{props.term}</span>
        </p>
      </div>
      {props.figure}
    </div>
  );
}

/** Props of {@link LabFigure}. */
export interface LabFigureProps {
  readonly value: string;
  /** The denominator, shown smaller after the value, such as "/ 2,280". */
  readonly of?: string;
  readonly label: string;
  /** Share of the bar to fill, 0 to 1; no bar when absent. */
  readonly fill?: number;
  /** One line of supporting counts. */
  readonly stats?: JSX.Element;
  readonly testId?: string;
}

/** The lab's one big figure. */
export function LabFigure(props: LabFigureProps) {
  return (
    <div class="sw-lab-figure" data-testid={props.testId}>
      <p class="sw-lab-figure__value">
        {props.value}
        <Show when={props.of}>
          <span> {props.of}</span>
        </Show>
      </p>
      <p class="sw-lab-figure__label">{props.label}</p>
      <Show when={props.fill !== undefined}>
        <span aria-hidden="true" class="sw-lab-bar">
          <span style={{ width: `${Math.round((props.fill ?? 0) * 100)}%` }} />
        </span>
      </Show>
      <Show when={"stats" in props}>
        <p class="sw-lab-figure__stats">{props.stats}</p>
      </Show>
    </div>
  );
}

/** How long "Copied" shows after a copy. */
const COPIED_MS = 1_600;

/** An icon button that copies `value`, and says it did. */
export function CopyButton(props: Readonly<{ value: string; label: string; testId?: string }>) {
  const [copied, setCopied] = createSignal(false);
  let timer: number | undefined;
  onCleanup(() => clearTimeout(timer));
  return (
    <button
      aria-label={copied() ? "Copied" : `Copy ${props.label}`}
      class="sw-icon-button sw-lab-copy"
      data-copied={copied() || undefined}
      data-testid={props.testId}
      onClick={() => {
        void navigator.clipboard.writeText(props.value).then(() => {
          setCopied(true);
          window.clearTimeout(timer);
          timer = window.setTimeout(() => setCopied(false), COPIED_MS);
        });
      }}
      title={`Copy ${props.label}`}
      type="button"
    >
      <Icon name={copied() ? "check" : "copy"} />
    </button>
  );
}

/** A value in the code face beside its copy button, such as a SHA-256 digest. */
export function CopyValue(
  props: Readonly<{ value: string; label: string; shown?: string; testId?: string }>,
) {
  return (
    <span class="sw-lab-copy-value">
      <code data-testid={props.testId} title={props.shown === undefined ? undefined : props.value}>
        {props.shown ?? props.value}
      </code>
      <CopyButton label={props.label} value={props.value} />
    </span>
  );
}
