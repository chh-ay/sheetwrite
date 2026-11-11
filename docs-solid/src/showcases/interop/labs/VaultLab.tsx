import compatibilityResultsUrl from "@docs/generated/compatibility-results.json?url";
import type { CompatibilityResultCase } from "@docs/showcases/compatibility-results.js";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";

import { HighlightedCode } from "../../../components/HighlightedCode.js";
import { Icon, type IconName } from "../../../components/Icon.js";
import { Select } from "../../../components/Select.js";
import { CopyValue, LabAnswer, LabFigure } from "./LabParts.js";
import {
  APPLICABLE,
  areaName,
  BOUNDARY_GROUPS,
  type BoundaryGroup,
  boundaryRecords,
  CASE_KINDS,
  type CaseKind,
  caseOutcome,
  type CaseOutcome,
  checkKind,
  checkName,
  checkSteps,
  type CompatibilityRecord,
  expectedText,
  NOT_APPLICABLE_REASONS,
  nf,
  OTHER_APPS,
  OUTCOME_CHOICES,
  OUTCOME_LABELS,
  RECORDS,
  RESULTS,
  spokenList,
  TEST_SET,
} from "./vault-data.js";

/** Checks on one page of the table. */
const PAGE_SIZE = 15;
/** Rows a phone shows before "Show more". */
const PHONE_ROWS = 3;
/** Records a boundary column lists before "Show all". */
const COLUMN_ROWS = 5;
/** Below this width the selected check opens as a sheet over the page. */
const PHONE_QUERY = "(max-width: 39.99rem)";

type KindFilter = "all" | CaseKind;
type OutcomeFilter = "any" | CaseOutcome;

const OUTCOME_ICON: Readonly<Record<CaseOutcome, IconName>> = {
  pass: "check",
  warning: "warning",
  difference: "compare",
  regression: "danger",
  "not-applicable": "minus",
};

export function OutcomeBadge(props: Readonly<{ outcome: CaseOutcome }>) {
  return (
    <span class="sw-lab-badge" data-outcome={props.outcome}>
      <Icon name={OUTCOME_ICON[props.outcome]} />
      {OUTCOME_LABELS[props.outcome]}
    </span>
  );
}

/** The vault's headline: the pass figure beside the answer. */
function VaultAnswer() {
  const notApplicable = TEST_SET.unsupported;
  return (
    <LabAnswer
      answer={
        <>
          Sheetwrite passes {TEST_SET.localPassed === APPLICABLE ? "all " : ""}
          {nf(TEST_SET.localPassed)} checks that apply.
          <Show when={notApplicable > 0}>
            {" "}
            The other {nf(notApplicable)} don't apply and aren't counted.
          </Show>
        </>
      }
      figure={
        <LabFigure
          fill={APPLICABLE === 0 ? 0 : TEST_SET.localPassed / APPLICABLE}
          label="checks that apply pass"
          of={`/ ${nf(APPLICABLE)}`}
          stats={
            <>
              <span>
                <b>{nf(TEST_SET.regressions)}</b> regressions
              </span>
              <Show when={TEST_SET.knownDifferences > 0}>
                <span>
                  <b>{nf(TEST_SET.knownDifferences)}</b> known difference
                  {TEST_SET.knownDifferences === 1 ? "" : "s"}
                </span>
              </Show>
              <span>
                <b>{nf(TEST_SET.warningChecks)}</b> expect a warning
              </span>
            </>
          }
          testId="compatibility-results-summary"
          value={nf(TEST_SET.localPassed)}
        />
      }
      headingId="vault-question"
      icon="compare"
      name="Evidence vault"
      question="How compatible is Sheetwrite?"
      term={
        <>
          <strong>A check</strong> runs a formula, edit sequence or workbook and compares the result
          with an expected value from a cited source, not from another app.
        </>
      }
    />
  );
}

/** The plain-word gaps: what is not measured yet, and what does not apply. */
function VaultGaps() {
  return (
    <div class="sw-vault-gaps">
      <Show when={TEST_SET.reviewedResults === 0}>
        <p class="sw-vault-gap">
          <Icon name="info" />
          <span>
            No results from {spokenList(OTHER_APPS.map((app) => app.label))} are recorded yet. Every
            pass compares Sheetwrite with the expected value, not with another app.
          </span>
        </p>
      </Show>
      <For each={NOT_APPLICABLE_REASONS}>
        {(reason) => (
          <p class="sw-vault-gap" data-gap="not-applicable">
            <Icon name="info" />
            <span>
              <b>{nf(reason.tests)} checks don't apply:</b> they {reason.text}. They stay in the
              set, marked not applicable.
            </span>
          </p>
        )}
      </For>
    </div>
  );
}

/** One check's detail: its formula, values, status, why and source. */
function CheckDetail(props: Readonly<{ entry: CompatibilityResultCase; onClose?: () => void }>) {
  const entry = () => props.entry;
  const outcome = () => caseOutcome(entry());
  const source = () => RESULTS.sources[entry().sourceIndex];
  const evidence = () => RESULTS.evidence[entry().evidenceIndex];
  const reviewed = () =>
    entry().observations.filter((observation) => observation.reviewStatus === "reviewed");
  const expected = () => entry().expected as { displayedText?: string };
  return (
    <article class="sw-vault-detail__body" data-testid="compatibility-result-detail">
      <header class="sw-vault-detail__head">
        <div>
          <h5>{checkName(entry())}</h5>
          <p>{checkKind(entry())}</p>
        </div>
        <Show when={props.onClose}>
          {(close) => (
            <button
              aria-label="Close the check"
              class="sw-icon-button"
              onClick={() => close()()}
              type="button"
            >
              <Icon name="close" />
            </button>
          )}
        </Show>
      </header>
      <div class="sw-vault-codebox">
        <Show fallback={<span>{checkSteps(entry())}</span>} when={entry().formula}>
          {(formula) => <HighlightedCode code={formula()} language="formula" />}
        </Show>
      </div>
      <dl class="sw-vault-kv">
        <dt>Expected</dt>
        <dd data-testid="compatibility-tolerance">
          <code>{expectedText(entry().expected)}</code>
          <Show when={expected().displayedText}>
            {(shown) => (
              <>
                , shown as <code>{shown()}</code>
              </>
            )}
          </Show>
        </dd>
        <dt>Sheetwrite</dt>
        <dd data-testid="app-result-sheetwrite">
          <OutcomeBadge outcome={outcome()} />
        </dd>
        <dt>Other apps</dt>
        <dd>
          <Show fallback="No recorded result yet" when={reviewed().length > 0}>
            {spokenList(
              reviewed().map(
                (observation) =>
                  `${OTHER_APPS.find((app) => app.id === observation.testedApp)?.label ?? observation.testedApp} ${observation.differences.length === 0 ? "matches" : "differs"}`,
              ),
            )}
          </Show>
        </dd>
      </dl>
      <Show when={evidence()?.description}>{(why) => <p class="sw-vault-why">{why()}</p>}</Show>
      <Show when={source()}>
        {(cited) => (
          <p class="sw-vault-source">
            Expected value from <a href={cited().url}>{cited().title}</a>, section "
            {cited().section}".
          </p>
        )}
      </Show>
      <details class="sw-vault-verify">
        <summary>
          <Icon name="chevron-right" />
          Verify it yourself: check ID and SHA-256
        </summary>
        <dl class="sw-vault-kv">
          <dt>Check ID</dt>
          <dd>
            <CopyValue label="the check ID" value={entry().id} />
          </dd>
          <dt>SHA-256</dt>
          <dd>
            <CopyValue
              label="the check's SHA-256"
              shown={`${entry().testChecksum.slice(0, 16)}…`}
              value={entry().testChecksum}
            />
          </dd>
        </dl>
      </details>
    </article>
  );
}

/** The published checks: search and filters, a short table, the selected check beside it. */
function CheckBrowser(props: Readonly<{ kind: KindFilter; onKind: (kind: KindFilter) => void }>) {
  let sheet!: HTMLDialogElement;
  const [query, setQuery] = createSignal("");
  const [outcome, setOutcome] = createSignal<OutcomeFilter>("any");
  const [page, setPage] = createSignal(0);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [expanded, setExpanded] = createSignal(false);

  const visible = createMemo(() => {
    const needle = query().trim().toLowerCase();
    return RESULTS.cases.filter(
      (entry) =>
        (props.kind === "all" || entry.kind === props.kind) &&
        (outcome() === "any" || caseOutcome(entry) === outcome()) &&
        (needle === "" ||
          checkName(entry).toLowerCase().includes(needle) ||
          entry.label.toLowerCase().includes(needle) ||
          (entry.formula ?? "").toLowerCase().includes(needle)),
    );
  });
  const pageCount = () => Math.max(1, Math.ceil(visible().length / PAGE_SIZE));
  const currentPage = () => Math.min(page(), pageCount() - 1);
  const rows = () => visible().slice(currentPage() * PAGE_SIZE, (currentPage() + 1) * PAGE_SIZE);
  const selected = () => visible().find((entry) => entry.id === selectedId()) ?? rows()[0];
  const reset = () => {
    setPage(0);
    setSelectedId(null);
    setExpanded(false);
  };
  const choose = (entry: CompatibilityResultCase) => {
    setSelectedId(entry.id);
    if (window.matchMedia(PHONE_QUERY).matches) sheet.showModal();
  };
  const first = () => currentPage() * PAGE_SIZE + 1;
  const last = () => Math.min(visible().length, (currentPage() + 1) * PAGE_SIZE);

  return (
    <section aria-labelledby="vault-browse" class="sw-vault-browse">
      <header class="sw-lab-section-head">
        <h4 id="vault-browse">Browse the checks</h4>
        <p>
          {nf(TEST_SET.publishedExamples)} of the {nf(TEST_SET.totalTests)} checks, with their
          inputs. Choose one to see why it expects that value.
        </p>
      </header>
      <div class="sw-vault-toolbar">
        <label class="sw-vault-search">
          <Icon name="search" />
          <span class="sw-visually-hidden">Search the checks</span>
          <input
            data-testid="compatibility-search"
            onInput={(event) => {
              setQuery(event.currentTarget.value);
              reset();
            }}
            placeholder="Search by name or formula"
            type="search"
            value={query()}
          />
        </label>
        <fieldset class="sw-vault-segments">
          <legend class="sw-visually-hidden">Kind of check</legend>
          <For each={[{ kind: "all", short: "All" } as const, ...CASE_KINDS]}>
            {(item) => (
              <button
                aria-pressed={props.kind === item.kind}
                data-testid={`compatibility-kind-${item.kind}`}
                onClick={() => {
                  props.onKind(item.kind);
                  reset();
                }}
                type="button"
              >
                {item.short}
              </button>
            )}
          </For>
        </fieldset>
        <Select
          class="sw-vault-outcome"
          id="vault-outcome"
          label="Result"
          onChange={(value) => {
            setOutcome(value as OutcomeFilter);
            reset();
          }}
          options={[
            { value: "any", label: "Any result" },
            ...OUTCOME_CHOICES.map((choice) => ({ value: choice, label: OUTCOME_LABELS[choice] })),
          ]}
          value={outcome()}
        />
      </div>
      <div class="sw-vault-browser">
        <div class="sw-vault-table-frame">
          <table
            class="sw-vault-table"
            data-expanded={expanded() || undefined}
            data-testid="compatibility-results-table"
          >
            <caption class="sw-visually-hidden">Published compatibility checks</caption>
            <thead>
              <tr>
                <th scope="col">Check</th>
                <th class="sw-vault-col-expected" scope="col">
                  Expected
                </th>
                <th class="sw-vault-col-result" scope="col">
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              <For
                each={rows()}
                fallback={
                  <tr>
                    <td
                      class="sw-vault-empty"
                      colSpan={3}
                      data-testid="compatibility-results-empty"
                    >
                      No check matches. Clear the search or choose a broader filter.
                    </td>
                  </tr>
                }
              >
                {(entry, index) => (
                  <tr
                    data-extra={index() >= PHONE_ROWS || undefined}
                    data-selected={selected()?.id === entry.id || undefined}
                  >
                    <th scope="row">
                      {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label -- its text is the check's name and steps, rendered below. */}
                      <button
                        aria-pressed={selected()?.id === entry.id}
                        data-testid={`compatibility-result-${entry.position}`}
                        onClick={() => choose(entry)}
                        type="button"
                      >
                        <span class="sw-vault-name">{checkName(entry)}</span>
                        <Show
                          fallback={<span class="sw-vault-steps">{checkSteps(entry)}</span>}
                          when={entry.formula}
                        >
                          {(formula) => (
                            <HighlightedCode
                              class="sw-vault-formula"
                              code={formula()}
                              language="formula"
                            />
                          )}
                        </Show>
                      </button>
                    </th>
                    <td class="sw-vault-col-expected">
                      <code>{expectedText(entry.expected)}</code>
                    </td>
                    <td class="sw-vault-col-result">
                      <OutcomeBadge outcome={caseOutcome(entry)} />
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          <Show when={!expanded() && rows().length > PHONE_ROWS}>
            <div class="sw-vault-more">
              <button class="sw-button" onClick={() => setExpanded(true)} type="button">
                Show {rows().length - PHONE_ROWS} more checks
              </button>
            </div>
          </Show>
          <div class="sw-vault-pager">
            <span aria-live="polite" data-testid="compatibility-example-page">
              {visible().length === 0 ? "0" : `${first()}–${last()}`} of {nf(visible().length)}
            </span>
            <span class="sw-vault-pager__buttons">
              <button
                aria-label="Previous checks"
                class="sw-icon-button"
                disabled={currentPage() === 0}
                onClick={() => {
                  setPage(currentPage() - 1);
                  setSelectedId(null);
                  setExpanded(false);
                }}
                type="button"
              >
                <Icon name="arrow-left" />
              </button>
              <button
                aria-label="Next checks"
                class="sw-icon-button"
                disabled={currentPage() >= pageCount() - 1}
                onClick={() => {
                  setPage(currentPage() + 1);
                  setSelectedId(null);
                  setExpanded(false);
                }}
                type="button"
              >
                <Icon name="arrow-right" />
              </button>
            </span>
          </div>
        </div>
        <aside aria-label="The selected check" class="sw-vault-detail">
          <Show when={selected()}>{(entry) => <CheckDetail entry={entry()} />}</Show>
        </aside>
      </div>
      <dialog
        aria-label="The selected check"
        class="sw-vault-sheet"
        ref={(element) => {
          sheet = element;
        }}
      >
        <span aria-hidden="true" class="sw-vault-sheet__grab" />
        <Show when={selected()}>
          {(entry) => <CheckDetail entry={entry()} onClose={() => sheet.close()} />}
        </Show>
      </dialog>
    </section>
  );
}

/** One feature record's detail: only the fields it has. */
function RecordDetail(props: Readonly<{ record: CompatibilityRecord }>) {
  return (
    <article
      class="sw-vault-record"
      data-status={props.record.status}
      data-testid="compatibility-detail"
    >
      <header class="sw-vault-detail__head">
        <div>
          <h5>{props.record.label}</h5>
          <p>{areaName(props.record.area)}</p>
        </div>
      </header>
      <p>{props.record.semantics}</p>
      <dl class="sw-vault-kv">
        <dt>Import</dt>
        <dd>{props.record.importBehavior}</dd>
        <dt>Export</dt>
        <dd>{props.record.exportBehavior}</dd>
        <dt>Boundary</dt>
        <dd>{props.record.divergence}</dd>
        <Show when={props.record.warningCode}>
          {(code) => (
            <>
              <dt>Warning code</dt>
              <dd>
                <code>{code()}</code>
              </dd>
            </>
          )}
        </Show>
        <dt>Source</dt>
        <dd>
          <a href={props.record.source}>The checked source</a>
        </dd>
      </dl>
    </article>
  );
}

function BoundaryColumn(
  props: Readonly<{
    group: BoundaryGroup;
    selectedId: string | undefined;
    expanded: boolean;
    onExpand: () => void;
    onToggle: () => void;
    onSelect: (id: string) => void;
  }>,
) {
  const records = () => boundaryRecords(props.group);
  const shown = () => (props.expanded ? records() : records().slice(0, COLUMN_ROWS));
  return (
    <section
      aria-labelledby={`vault-bound-${props.group.id}`}
      class="sw-vault-bound"
      data-expanded={props.expanded || undefined}
      data-group={props.group.id}
    >
      <header class="sw-vault-bound__head">
        <h5 id={`vault-bound-${props.group.id}`}>
          <Icon name={props.group.icon} />
          {props.group.title}
        </h5>
        <span class="sw-vault-bound__count">{nf(records().length)}</span>
        <button
          aria-controls={`vault-bound-${props.group.id}-list`}
          aria-expanded={props.expanded}
          aria-label={`${props.expanded ? "Hide" : "Show"} ${props.group.title.toLowerCase()}`}
          class="sw-icon-button sw-vault-bound__toggle"
          onClick={() => props.onToggle()}
          type="button"
        >
          <Icon name="chevron-down" />
        </button>
      </header>
      <ul id={`vault-bound-${props.group.id}-list`}>
        <For each={shown()}>
          {(record) => (
            <li>
              <button
                aria-pressed={props.selectedId === record.id}
                data-testid={`compatibility-${record.id}`}
                onClick={() => props.onSelect(record.id)}
                type="button"
              >
                {record.label}
                <Show when={record.status === "warning"}>
                  <small> (with a warning)</small>
                </Show>
              </button>
            </li>
          )}
        </For>
      </ul>
      <Show when={props.group.note}>{(note) => <p class="sw-vault-bound__note">{note()}</p>}</Show>
      <Show when={records().length > shown().length}>
        <button class="sw-lab-more" onClick={() => props.onExpand()} type="button">
          Show all {nf(records().length)}
          <Icon name="chevron-down" />
        </button>
      </Show>
    </section>
  );
}

/** The declared feature boundaries in three columns, one record open below. */
function Boundaries() {
  const [selectedId, setSelectedId] = createSignal<string | undefined>(undefined);
  const [expanded, setExpanded] = createSignal<string | null>(null);
  onMount(() => {
    // `?compatibility=<record id>` opens one record.
    const requested = new URLSearchParams(window.location.search).get("compatibility");
    const record = RECORDS.find((candidate) => candidate.id === requested);
    if (!record) return;
    setSelectedId(record.id);
    const group = BOUNDARY_GROUPS.find((candidate) =>
      candidate.statuses.some((status) => status === record.status),
    );
    if (group) setExpanded(group.id);
  });
  const selected = () => RECORDS.find((record) => record.id === selectedId());
  return (
    <section aria-labelledby="vault-bounds" class="sw-vault-bounds">
      <header class="sw-lab-section-head">
        <h4 id="vault-bounds">What's supported, partly supported and not claimed</h4>
        <p>{nf(RECORDS.length)} feature areas, each with the limits it states.</p>
      </header>
      <div class="sw-vault-bound-columns">
        <For each={BOUNDARY_GROUPS}>
          {(group) => (
            <BoundaryColumn
              expanded={expanded() === group.id}
              group={group}
              onExpand={() => setExpanded(group.id)}
              onToggle={() => setExpanded(expanded() === group.id ? null : group.id)}
              onSelect={setSelectedId}
              selectedId={selectedId()}
            />
          )}
        </For>
      </div>
      <Show when={selected()}>{(record) => <RecordDetail record={record()} />}</Show>
    </section>
  );
}

/** The Evidence vault: the answer, kinds of check, the gaps, the checks and the boundaries. */
export function VaultLab() {
  const [kind, setKind] = createSignal<KindFilter>("all");
  return (
    <div class="sw-lab-body sw-vault" data-testid="compatibility-vault">
      <VaultAnswer />
      <ul aria-label="Checks by kind" class="sw-vault-kinds">
        <For each={CASE_KINDS}>
          {(item) => (
            <li>
              <button
                aria-pressed={kind() === item.kind}
                onClick={() => setKind(kind() === item.kind ? "all" : item.kind)}
                type="button"
              >
                <span class="sw-vault-kinds__icon">
                  <Icon name={item.icon} size="md" />
                </span>
                <span class="sw-vault-kinds__name">{item.label}</span>
                <span class="sw-vault-kinds__count">{nf(item.count)}</span>
                <span class="sw-vault-kinds__what">{item.what}</span>
              </button>
            </li>
          )}
        </For>
      </ul>
      <VaultGaps />
      <CheckBrowser kind={kind()} onKind={setKind} />
      <Boundaries />
      <p class="sw-vault-verify-set">
        <Icon class="sw-vault-verify-set__icon" name="key" />
        <span>
          <b>Verify it yourself:</b> the SHA-256 of all {nf(TEST_SET.totalTests)} checks is{" "}
          <CopyValue
            label="the check set's SHA-256"
            shown={`${TEST_SET.checksum.slice(0, 12)}…`}
            testId="compatibility-test-set-checksum"
            value={TEST_SET.checksum}
          />
          . The {nf(TEST_SET.publishedExamples)} published checks download as JSON.
        </span>
        <a class="sw-button" download="" href={compatibilityResultsUrl}>
          <Icon name="download" />
          Published checks
        </a>
      </p>
    </div>
  );
}
