import type { XlsxWorkbookWarning } from "@sheetwrite/core";
import { createSignal, For, Show } from "solid-js";

import { Icon } from "../../../components/Icon.js";
import { pendingProps } from "../../../lib/use-action.js";
import { actionPending, gridReady, run, warningLog } from "../state.js";
import { LabAnswer, LabFigure } from "./LabParts.js";
import { nf } from "./vault-data.js";

/** Warning rows shown before the list expands. */
const ROWS_SHOWN = 8;

/** Where a warning applies: a cell, a sheet or a package part. */
function warningPlace(warning: XlsxWorkbookWarning): string {
  if (warning.sheet !== undefined) {
    return warning.cell === undefined ? warning.sheet : `${warning.sheet}!${warning.cell}`;
  }
  return warning.part ?? "Workbook";
}

/** The warning codes in the log, each with how many times it occurs. */
function codeCounts(warnings: readonly XlsxWorkbookWarning[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const warning of warnings) counts.set(warning.code, (counts.get(warning.code) ?? 0) + 1);
  return [...counts];
}

function WarningTable(props: Readonly<{ warnings: readonly XlsxWorkbookWarning[] }>) {
  const [expanded, setExpanded] = createSignal(false);
  const rows = () => (expanded() ? props.warnings : props.warnings.slice(0, ROWS_SHOWN));
  return (
    <>
      <ul aria-label="Warnings by code" class="sw-lab-chips sw-lab-chips--codes">
        <For each={codeCounts(props.warnings)}>
          {([code, count]) => (
            <li>
              <code>{code}</code> × {nf(count)}
            </li>
          )}
        </For>
      </ul>
      <table class="sw-lab-table">
        <caption class="sw-visually-hidden">What the operation could not keep</caption>
        <thead>
          <tr>
            <th scope="col">Code</th>
            <th scope="col">Where</th>
            <th scope="col">What was not kept</th>
          </tr>
        </thead>
        <tbody>
          <For each={rows()}>
            {(warning) => (
              <tr>
                <td>
                  <code class="sw-si-warncode">{warning.code}</code>
                </td>
                <td>
                  <code>{warningPlace(warning)}</code>
                </td>
                <td>{warning.message}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Show when={props.warnings.length > ROWS_SHOWN && !expanded()}>
        <button class="sw-lab-more" onClick={() => setExpanded(true)} type="button">
          Show all {nf(props.warnings.length)} warnings
        </button>
      </Show>
    </>
  );
}

/** Before any import or export: the round trip that produces the first list. */
function RoundTripPrompt() {
  return (
    <div class="sw-lab-figure" data-testid="interop-warning-count">
      <p class="sw-lab-figure__label">No import or export yet</p>
      <p class="sw-lab-note">
        The round trip exports this workbook to XLSX and reads it back, or open a workbook from the
        Source library.
      </p>
      <button
        class="sw-button"
        data-variant="primary"
        {...pendingProps(actionPending())}
        disabled={!gridReady() || actionPending()}
        onClick={() => run((current) => current.handleRoundTrip())}
        type="button"
      >
        <Icon name="refresh" />
        Run the round trip
      </button>
    </div>
  );
}

/** Operation evidence: what the latest import or export could not keep, by cell. */
export function OperationEvidence() {
  return (
    <div class="sw-lab-body">
      <LabAnswer
        answer={
          <>
            Each import and export returns a list of what it couldn't keep, with the cell and a
            reason, instead of dropping it silently. Run the round trip or open a workbook to see
            the list for it.
          </>
        }
        figure={
          <Show fallback={<RoundTripPrompt />} when={warningLog()}>
            {(log) => (
              <LabFigure
                label={log().operation}
                stats={
                  <span>
                    <b>{nf(codeCounts(log().warnings).length)}</b> reason codes
                  </span>
                }
                testId="interop-warning-count"
                value={`${nf(log().warnings.length)} lost`}
              />
            )}
          </Show>
        }
        headingId="evidence-question"
        icon="warning"
        name="Operation evidence"
        question="What gets lost when I import or export?"
        term={
          <>
            <strong>A reason code</strong>, such as <code>hyperlink</code>, names the kind of loss
            so your app can react to it.
          </>
        }
      />
      <div class="sw-si-warnings" data-testid="interop-warnings">
        <Show when={warningLog()}>
          {(log) => (
            <Show
              fallback={<WarningTable warnings={log().warnings} />}
              when={log().warnings.length === 0}
            >
              <p class="sw-lab-empty" data-testid="interop-warnings-none">
                {log().operation}: nothing was lost, so no warning was reported.
              </p>
            </Show>
          )}
        </Show>
      </div>
    </div>
  );
}
