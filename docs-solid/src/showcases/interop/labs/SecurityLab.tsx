import { For, onMount, Show } from "solid-js";

import { Icon } from "../../../components/Icon.js";
import { pendingProps } from "../../../lib/use-action.js";
import { ADVERSARIAL_FIXTURES, type RejectionReport } from "../../scenarios/interoperability.js";
import {
  abortReport,
  actionPending,
  attacksRunAt,
  cellCapReport,
  csvCapReport,
  gridReady,
  rejections,
  run,
} from "../state.js";
import { CopyButton, LabAnswer, LabFigure } from "./LabParts.js";
import { nf } from "./vault-data.js";

/** Decimals with three or more places, and integers of four or more digits. */
const RAW_NUMBER = /\b\d+\.\d{3,}\b|\b\d{4,}\b/gu;

/** An error message with its numbers grouped and rounded for reading; the copy keeps the raw text. */
function readableMessage(message: string): string {
  return message.replace(RAW_NUMBER, (number) =>
    Number(number).toLocaleString("en", { maximumFractionDigits: 1 }),
  );
}

/** Each attack in plain words: what the input tries, and why refusing it matters. */
const ATTACK_WORDS: Readonly<Record<string, { title: string; why: string }>> = {
  "traversal.xlsx": {
    title: "A ZIP entry that tries to write outside the workbook",
    why: "Unpacking it naively could overwrite files elsewhere on disk.",
  },
  "doctype.xlsx": {
    title: "XML that declares its own entities",
    why: "Entity expansion can blow up memory or pull in outside files.",
  },
  "deep-xml.xlsx": {
    title: "XML nested deeper than the parser allows",
    why: "Deep nesting can exhaust the parser, so the depth is bounded.",
  },
  "compression-ratio.xlsx": {
    title: "A ZIP bomb: a small file that inflates a thousandfold",
    why: "Unpacking it could fill memory, so it is refused before anything is inflated.",
  },
  "corrupt-deflate.xlsx": {
    title: "A damaged compressed sheet",
    why: "Damage must fail cleanly, never return half a workbook.",
  },
};

interface AttackRow {
  readonly id: string;
  readonly input: string;
  readonly title: string;
  readonly why: string;
  readonly report: () => RejectionReport | null | undefined;
  readonly testId: string;
}

const HOSTILE_ROWS: readonly AttackRow[] = ADVERSARIAL_FIXTURES.map((fixture) => ({
  id: fixture.id,
  input: fixture.file,
  title: ATTACK_WORDS[fixture.file]?.title ?? fixture.details.join("; "),
  why: ATTACK_WORDS[fixture.file]?.why ?? "",
  report: () => rejections[fixture.id],
  testId: `hostile-${fixture.id}`,
}));

const LIMIT_ROWS: readonly AttackRow[] = [
  {
    id: "abort",
    input: "AbortSignal",
    title: "An import cancelled before it starts",
    why: "Your app's cancel button has to stop the work at once. Cancelling returns the signal's own reason.",
    report: abortReport,
    testId: "interop-abort-report",
  },
  {
    id: "cells",
    input: "maxCells: 8",
    title: "A workbook with more cells than you allow",
    why: "Limits let you refuse files too big for your app. This run allows 8 cells.",
    report: cellCapReport,
    testId: "interop-cellcap-report",
  },
  {
    id: "csv",
    input: "CSV, maxCells: 1,000",
    title: "CSV text with more cells than you allow",
    why: "The same kind of limit applies to pasted or uploaded CSV.",
    report: csvCapReport,
    testId: "interop-csvcap-report",
  },
];

const ATTACK_COUNT = HOSTILE_ROWS.length + LIMIT_ROWS.length;

type Outcome = "not-run" | "rejected" | "limit" | "stopped" | "accepted";

function outcomeOf(report: RejectionReport | null | undefined): Outcome {
  if (!report) return "not-run";
  if (!report.rejected) return "accepted";
  if (report.limit) return "limit";
  if (report.errorName === "AbortError") return "stopped";
  return "rejected";
}

const OUTCOME_WORDS: Readonly<Record<Outcome, string>> = {
  "not-run": "Not run yet",
  rejected: "Rejected",
  limit: "Stopped at a limit",
  stopped: "Stopped",
  accepted: "Accepted: this is a bug",
};

function AttackOutcome(props: Readonly<{ outcome: Outcome }>) {
  return (
    <span class="sw-lab-badge" data-outcome={props.outcome}>
      <Show when={props.outcome !== "not-run"}>
        <Icon
          name={
            props.outcome === "rejected"
              ? "shield"
              : props.outcome === "accepted"
                ? "danger"
                : "gauge"
          }
        />
      </Show>
      {OUTCOME_WORDS[props.outcome]}
    </span>
  );
}

/** The developer's view of one rejection: its error, code and limit, then its own message. */
function ForDevelopers(props: Readonly<{ row: AttackRow; report: RejectionReport }>) {
  return (
    <>
      <span class="sw-attack-chips">
        <Show when={props.report.errorName}>
          {(name) => (
            <code class="sw-lab-chip" data-kind="name">
              {name()}
            </code>
          )}
        </Show>
        <Show when={props.report.code}>
          {(code) => (
            <code class="sw-lab-chip" data-kind="code">
              {code()}
            </code>
          )}
        </Show>
        <Show when={props.report.limit}>
          {(limit) => (
            <code class="sw-lab-chip" data-kind="limit">
              <Icon name="gauge" />
              {limit()}
            </code>
          )}
        </Show>
      </span>
      <Show when={props.report.message}>
        {(message) => <p class="sw-attack-message">{readableMessage(message())}</p>}
      </Show>
      <p class="sw-attack-input">Input: {props.row.input}</p>
    </>
  );
}

function AttackRows(props: Readonly<{ label: string; rows: readonly AttackRow[] }>) {
  return (
    <tbody>
      <tr class="sw-attack-group">
        <th colSpan={4} scope="colgroup">
          {props.label}
        </th>
      </tr>
      <For each={props.rows}>
        {(row) => {
          const outcome = () => outcomeOf(row.report());
          return (
            <tr
              data-state={
                outcome() === "not-run" ? "idle" : row.report()?.rejected ? "rejected" : "accepted"
              }
              data-testid={row.testId}
            >
              <th scope="row">
                <span class="sw-attack-title">{row.title}</span>
                <span class="sw-attack-why">{row.why}</span>
              </th>
              <td class="sw-attack-outcome">
                <AttackOutcome outcome={outcome()} />
              </td>
              <td class="sw-attack-dev">
                <Show
                  fallback={<p class="sw-attack-input">Input: {row.input}</p>}
                  when={row.report()}
                >
                  {(report) => (
                    <details class="sw-attack-details" open>
                      <summary>
                        <Icon name="chevron-right" />
                        <span class="sw-attack-chips">
                          <code class="sw-lab-chip" data-kind="code">
                            {report().code ?? report().errorName}
                          </code>
                          <Show when={report().limit}>
                            {(limit) => (
                              <code class="sw-lab-chip" data-kind="limit">
                                <Icon name="gauge" />
                                {limit()}
                              </code>
                            )}
                          </Show>
                        </span>
                      </summary>
                      <ForDevelopers report={report()} row={row} />
                    </details>
                  )}
                </Show>
              </td>
              <td class="sw-attack-copy">
                <Show when={row.report()?.message}>
                  <CopyButton
                    label={`the raw error for ${row.input}`}
                    value={JSON.stringify(
                      {
                        name: row.report()?.errorName,
                        code: row.report()?.code,
                        limit: row.report()?.limit,
                        message: row.report()?.message,
                      },
                      null,
                      2,
                    )}
                  />
                </Show>
              </td>
            </tr>
          );
        }}
      </For>
    </tbody>
  );
}

/** The Security lab: every hostile file and limit, run through the import your app calls. */
export function SecurityLab() {
  let table!: HTMLTableElement;
  const stopped = () =>
    [...HOSTILE_ROWS, ...LIMIT_ROWS].filter((row) => row.report()?.rejected === true).length;
  const ran = () => attacksRunAt() !== null;

  onMount(() => {
    // Phones show each attack as a card with its developer details folded,
    // all but the first.
    if (!window.matchMedia("(max-width: 39.99rem)").matches) return;
    for (const [index, details] of Array.from(
      table.querySelectorAll<HTMLDetailsElement>(".sw-attack-details"),
    ).entries()) {
      if (index > 0) details.open = false;
    }
  });

  return (
    <div class="sw-lab-body sw-security">
      <LabAnswer
        answer={
          <>
            Import refuses all {nf(HOSTILE_ROWS.length)} hostile test files below and stops at the
            size limits you set, with an error your code can handle. Run them here: they go through
            the same import your app calls.
          </>
        }
        figure={
          <LabFigure
            fill={ran() ? stopped() / ATTACK_COUNT : 0}
            label={ran() ? "attacks stopped in this run" : "attacks, not run yet"}
            of={`/ ${nf(ATTACK_COUNT)}`}
            stats={
              <>
                <span>
                  <b>{nf(HOSTILE_ROWS.length)}</b> hostile files
                </span>
                <span>
                  <b>{nf(LIMIT_ROWS.length)}</b> limits
                </span>
              </>
            }
            testId="interop-attacks-figure"
            value={ran() ? nf(stopped()) : "–"}
          />
        }
        headingId="security-question"
        icon="shield"
        name="Security lab"
        question="What attacks does import resist?"
        term={
          <>
            <strong>A typed error</strong> is a Sheetwrite error with a fixed code, such as{" "}
            <code>xlsx-resource-limit</code>, so your app can tell a hostile or oversized file from
            a bug and show the right message.
          </>
        }
      />
      <div class="sw-attack-runbar">
        <span class="sw-attack-runbar__state" data-ran={ran() || undefined}>
          <Icon name={ran() ? "check" : "info"} />
          {ran() ? "Ran in your browser just now" : "Runs in your browser, on this page's import"}
        </span>
        <button
          class="sw-button"
          data-testid="interop-hostile-run"
          data-variant="primary"
          disabled={!gridReady() || actionPending()}
          {...pendingProps(actionPending())}
          onClick={() => run((current) => current.runAllAttacks())}
          type="button"
        >
          <Icon name="refresh" />
          {ran() ? `Run all ${nf(ATTACK_COUNT)} again` : `Run all ${nf(ATTACK_COUNT)}`}
        </button>
      </div>
      <table class="sw-attack-table" data-testid="interop-hostile-table" ref={table}>
        <caption class="sw-visually-hidden">
          Hostile files and limits, with what happened to each in this run
        </caption>
        <colgroup>
          <col />
          <col class="sw-attack-table__outcome" />
          <col class="sw-attack-table__dev" />
          <col class="sw-attack-table__copy" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Attack and why it matters</th>
            <th scope="col">What happened</th>
            <th scope="col">For developers: error code and message</th>
            <th scope="col">
              <span class="sw-visually-hidden">Copy</span>
            </th>
          </tr>
        </thead>
        <AttackRows label="Hostile files" rows={HOSTILE_ROWS} />
        <AttackRows label="Limits you set" rows={LIMIT_ROWS} />
      </table>
    </div>
  );
}
