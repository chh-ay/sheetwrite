// The Evidence vault lab: the checked compatibility test set and the declared
// feature boundaries, each a filterable table with one record opened beside it.

import { Link, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { HighlightedCode } from "../../components/HighlightedCode.js";
import { Icon } from "../../components/Icon.js";
import compatibilityResultsData from "../../generated/compatibility-results.json";
import compatibilityResultsUrl from "../../generated/compatibility-results.json?url";
import compatibilityData from "../../generated/compatibility.json";
import type {
  CompatibilityResultCase,
  CompatibilityResultEvidence,
  CompatibilityResultSource,
  CompatibilityResultStatus,
  CompatibilityResults,
} from "../compatibility-results.js";
import { CopyValue } from "./CopyValue.js";

const COMPATIBILITY_RESULTS = compatibilityResultsData as unknown as CompatibilityResults;
const COMPATIBILITY_PAGE_SIZE = 20;

const RESULT_STATUS_LABELS: Record<CompatibilityResultStatus, string> = {
  "local-pass": "Local check passed",
  "result-unavailable": "Tested app result missing",
  "reviewed-pass": "Reviewed app result passed",
  "known-difference": "Known difference",
  unsupported: "Unsupported / not claimed",
  warning: "Warning behavior",
  regression: "Regression",
};

const BEHAVIOR_LABELS: Record<string, string> = {
  shared: "Shared spreadsheet behavior",
  excel: "Excel-specific behavior",
  "google-sheets": "Google Sheets-specific behavior",
  openformula: "OpenFormula-specific behavior",
};

const TESTED_APPS = [
  { id: "sheetwrite", label: "Sheetwrite captured result" },
  { id: "excel-desktop", label: "Microsoft Excel desktop" },
  { id: "google-sheets", label: "Google Sheets" },
  { id: "libreoffice", label: "LibreOffice" },
] as const;

type ResultFilter = "all" | CompatibilityResultStatus;

type CompatibilityRecord = (typeof compatibilityData.records)[number];
type CompatibilityFilter = "all" | CompatibilityRecord["status"];
const INVENTORY_STATUS_LABELS: Record<CompatibilityRecord["status"], string> = {
  supported: "Supported",
  partial: "Partially supported",
  "roundtrip-only": "Preserved on round-trip only",
  warning: "Supported with warning",
  unsupported: "Unsupported",
};
const RESULT_MODE_LABELS: Record<CompatibilityRecord["resultMode"], string> = {
  evaluated: "Evaluated",
  preserved: "Preserved",
  flattened: "Flattened for interchange",
  warning: "Warning reported",
  unsupported: "Unsupported",
};

function compatibilityStatusSummary(record: CompatibilityRecord): string {
  if (record.status === "unsupported" && record.resultMode === "unsupported") {
    return "Unsupported · not claimed";
  }
  if (record.status === "roundtrip-only" && record.resultMode === "preserved") {
    return "Preserved on round-trip only";
  }
  if (record.status === "warning" && record.resultMode === "warning") {
    return "Supported with warning";
  }
  return `${INVENTORY_STATUS_LABELS[record.status]} · ${RESULT_MODE_LABELS[record.resultMode]}`;
}

const COMPATIBILITY_AREAS = [...new Set(compatibilityData.records.map((record) => record.area))];
/** Reader-facing names for feature areas; unknown areas fall back to their id. */
const AREA_NAMES: Readonly<Record<string, string>> = {
  formula: "Formulas",
  reference: "References",
  worksheet: "Worksheets",
  view: "Views",
  style: "Styles",
  validation: "Validation",
  clipboard: "Clipboard",
  "xlsx-import": "XLSX import",
  "xlsx-export": "XLSX export",
};
const areaName = (area: string): string => AREA_NAMES[area] ?? area.replaceAll("-", " ");
const COMPATIBILITY_DIALECTS = [
  ...new Set(compatibilityData.records.map((record) => record.dialect)),
];

interface CheckedValue {
  readonly type: string;
  readonly value?: unknown;
  readonly error?: string;
}

/** A checked result as a reader sees it in a cell; structured results keep their JSON. */
function ExpectedValue({ result, testId }: { result: CheckedValue; testId?: string }) {
  const scalar =
    result.type === "number" || result.type === "string" || result.type === "boolean"
      ? result.type === "boolean"
        ? String(result.value).toUpperCase()
        : result.type === "string"
          ? `"${String(result.value)}"`
          : String(result.value)
      : result.type === "error"
        ? (result.error ?? String(result.value))
        : result.type === "blank"
          ? "Blank cell"
          : null;
  if (scalar !== null) {
    return (
      <p className="sw-si-value" data-testid={testId} data-type={result.type}>
        <code>{scalar}</code>
        <span>{result.type}</span>
      </p>
    );
  }
  return (
    <pre data-testid={testId}>
      <HighlightedCode code={JSON.stringify(result, null, 2)} language="json" />
    </pre>
  );
}

interface ChoiceOption {
  value: string;
  label: string;
}

/** One choice per page, "1 of N" to "N of N"; a list always has its first page. */
function pageChoices(pageCount: number): readonly [ChoiceOption, ...ChoiceOption[]] {
  const choice = (page: number): ChoiceOption => ({
    value: String(page),
    label: `${page + 1} of ${pageCount}`,
  });

  return [choice(0), ...Array.from({ length: pageCount - 1 }, (_, index) => choice(index + 1))];
}

function ChoiceMenu({
  label,
  value,
  options,
  testId,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly [ChoiceOption, ...ChoiceOption[]];
  testId: string;
  onChange: (value: string) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];
  return (
    <div className="sw-si-choice">
      <span>{label}</span>
      <details ref={detailsRef}>
        <summary aria-label={`${label}: ${selected.label}`} data-testid={testId}>
          {selected.label}
        </summary>
        <fieldset className="sw-si-choice__menu">
          <legend className="sw-visually-hidden">{label}</legend>
          {options.map((option) => (
            <button
              aria-pressed={option.value === value}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                detailsRef.current?.removeAttribute("open");
                detailsRef.current?.querySelector("summary")?.focus();
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      </details>
    </div>
  );
}

const TEST_SET = COMPATIBILITY_RESULTS.testSet;
const SUPPORTED_TESTS = TEST_SET.totalTests - TEST_SET.unsupported;

/** The vault's headline: how many supported tests pass locally. */
export const VAULT_SUMMARY = `${TEST_SET.localPassed.toLocaleString("en")} of ${SUPPORTED_TESTS.toLocaleString("en")} supported tests pass`;

/** Leading hex digits a table row shows; the copy button copies the full digest. */
const DIGEST_SHOWN = 12;

/** The test set at a glance: its pass rate, its parts and its checksum. */
function VaultSummary() {
  const passRate = ((TEST_SET.localPassed / SUPPORTED_TESTS) * 100).toFixed(0);
  return (
    <section
      aria-label="Checked compatibility test set summary"
      className="sw-si-vault__summary"
      data-testid="compatibility-results-summary"
    >
      <dl className="sw-si-stats">
        <div data-tone="accent">
          <dt>Pass locally</dt>
          <dd>{passRate}%</dd>
          <span>
            {TEST_SET.localPassed.toLocaleString("en")} of {SUPPORTED_TESTS.toLocaleString("en")}{" "}
            supported tests
          </span>
        </div>
        <div>
          <dt>Total tests</dt>
          <dd>{TEST_SET.totalTests.toLocaleString("en")}</dd>
          <span>Test set v{TEST_SET.version}</span>
        </div>
        <div>
          <dt>Formula tests</dt>
          <dd>{TEST_SET.formulaTests.toLocaleString("en")}</dd>
        </div>
        <div>
          <dt>Edit sequences</dt>
          <dd>{TEST_SET.editSequenceTests.toLocaleString("en")}</dd>
        </div>
        <div>
          <dt>Workbook tests</dt>
          <dd>{TEST_SET.workbookTests.toLocaleString("en")}</dd>
        </div>
      </dl>
      <aside aria-label="Warning" className="sw-callout" data-tone="warning">
        <Icon name="warning" size="md" />
        <div className="sw-callout__body">
          <p className="sw-callout__title">Results from other apps are still missing</p>
          <p>
            {TEST_SET.reviewedResults.toLocaleString("en")} reviewed results;{" "}
            {TEST_SET.missingReviewedResults.toLocaleString("en")} supported tests have no reviewed
            result from another app yet. The {TEST_SET.unsupported.toLocaleString("en")} unsupported
            tests are stated nonclaims and stay out of the pass rate. The set also has{" "}
            {TEST_SET.warningChecks.toLocaleString("en")} warning checks,{" "}
            {TEST_SET.knownDifferences.toLocaleString("en")} known difference and{" "}
            {TEST_SET.regressions.toLocaleString("en")} reviewed regressions.
          </p>
        </div>
      </aside>
      <p className="sw-si-vault__checksum">
        <span>Test set SHA-256</span>
        <CopyValue
          label="the test set SHA-256"
          testId="compatibility-test-set-checksum"
          value={TEST_SET.checksum}
        />
      </p>
    </section>
  );
}

function ResultRow({
  entry,
  selected,
  onSelect,
}: Readonly<{ entry: CompatibilityResultCase; selected: boolean; onSelect: () => void }>) {
  return (
    <tr data-selected={selected || undefined} data-status={entry.statusTags.join(" ")}>
      <th scope="row">
        <button
          aria-label={`${entry.label}; ${entry.featureLabel}; ${BEHAVIOR_LABELS[entry.behavior]}`}
          aria-pressed={selected}
          data-behavior={entry.behavior}
          data-status={entry.statusTags.join(" ")}
          data-testid={`compatibility-result-${entry.position}`}
          data-tolerance={entry.tolerance.kind}
          onClick={onSelect}
          type="button"
        >
          <strong>{entry.label}</strong>
          <span>
            {entry.featureLabel} · {BEHAVIOR_LABELS[entry.behavior]}
          </span>
        </button>
      </th>
      <td>
        <ExpectedValue result={entry.expected} />
      </td>
      <td>
        <span className="sw-si-compat__tags">
          <ResultStatusTags tags={entry.statusTags} as="i" />
        </span>
      </td>
      <td>
        <CopyValue
          label={`the record SHA-256 of ${entry.label}`}
          shown={`${entry.testChecksum.slice(0, DIGEST_SHOWN)}…`}
          value={entry.testChecksum}
        />
      </td>
    </tr>
  );
}

function RecordRow({
  record,
  selected,
  onSelect,
}: Readonly<{ record: CompatibilityRecord; selected: boolean; onSelect: () => void }>) {
  return (
    <tr data-selected={selected || undefined} data-status={record.status}>
      <th scope="row">
        <button
          aria-label={`${record.label}; ${areaName(record.area)}; ${BEHAVIOR_LABELS[record.dialect]}; ${compatibilityStatusSummary(record)}`}
          aria-pressed={selected}
          data-result={record.resultMode}
          data-status={record.status}
          data-testid={`compatibility-${record.id}`}
          onClick={onSelect}
          type="button"
        >
          <strong>{record.label}</strong>
          <span>
            {areaName(record.area)} · {BEHAVIOR_LABELS[record.dialect]}
          </span>
        </button>
      </th>
      <td>
        <span className="sw-si-compat__record-status" data-state={record.status}>
          {compatibilityStatusSummary(record)}
        </span>
      </td>
    </tr>
  );
}

function RecordDetail({ record }: Readonly<{ record: CompatibilityRecord }>) {
  return (
    <article
      className="sw-si-compat__detail"
      data-result={record.resultMode}
      data-status={record.status}
      data-testid="compatibility-detail"
    >
      <p className="sw-si-compat__mode">
        <span data-mode={record.resultMode} data-state={record.status}>
          {compatibilityStatusSummary(record)}
        </span>
      </p>
      <h4>{record.label}</h4>
      <p>{record.semantics}</p>
      <dl>
        <div>
          <dt>Import</dt>
          <dd>{record.importBehavior}</dd>
        </div>
        <div>
          <dt>Export</dt>
          <dd>{record.exportBehavior}</dd>
        </div>
        <div>
          <dt>Known boundary</dt>
          <dd>{record.divergence}</dd>
        </div>
        <div>
          <dt>Exact source</dt>
          <dd>
            <a href={record.source}>Open the checked source</a>
          </dd>
        </div>
        {record.warningCode && (
          <div>
            <dt>Warning code</dt>
            <dd>
              <code>{record.warningCode}</code>
            </dd>
          </div>
        )}
        <div>
          <dt>Evidence record IDs</dt>
          <dd>
            <code>{record.fixtureIds.join(", ")}</code>
          </dd>
        </div>
      </dl>
    </article>
  );
}

/**
 * The checked test set and the declared feature boundaries, each a filterable
 * table whose selected row opens beside it.
 */
export function EvidenceVault() {
  const [resultStatus, setResultStatus] = useState<ResultFilter>("all");
  const [resultFeature, setResultFeature] = useState("all");
  const [resultBehavior, setResultBehavior] = useState("all");
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [compatibilityStatus, setCompatibilityStatus] = useState<CompatibilityFilter>("all");
  const [compatibilityArea, setCompatibilityArea] = useState("all");
  const [compatibilityDialect, setCompatibilityDialect] = useState("all");
  const [selectedCompatibilityId, setSelectedCompatibilityId] = useState<string | null>(null);
  const [resultPage, setResultPage] = useState(0);
  const [inventoryPage, setInventoryPage] = useState(0);

  // `?compatibility=<record id>` selects that feature boundary record.
  const { compatibility: requestedCompatibility } = useSearch({
    from: "/showcases/interoperability",
  });
  useEffect(() => {
    if (compatibilityData.records.some((record) => record.id === requestedCompatibility)) {
      setSelectedCompatibilityId(requestedCompatibility ?? null);
    }
  }, [requestedCompatibility]);

  const visibleResults = COMPATIBILITY_RESULTS.cases.filter(
    (entry) =>
      (resultStatus === "all" || entry.statusTags.includes(resultStatus)) &&
      (resultFeature === "all" || entry.featureValue === resultFeature) &&
      (resultBehavior === "all" || entry.behavior === resultBehavior),
  );
  const resultPageCount = Math.max(1, Math.ceil(visibleResults.length / COMPATIBILITY_PAGE_SIZE));
  const currentResultPage = Math.min(resultPage, resultPageCount - 1);
  const selectedResult =
    visibleResults.find((entry) => entry.id === selectedResultId) ?? visibleResults[0];
  const selectedResultSource = selectedResult
    ? COMPATIBILITY_RESULTS.sources[selectedResult.sourceIndex]
    : undefined;
  const selectedResultEvidence = selectedResult
    ? COMPATIBILITY_RESULTS.evidence[selectedResult.evidenceIndex]
    : undefined;

  const visibleCompatibility = compatibilityData.records.filter(
    (record) =>
      (compatibilityStatus === "all" || record.status === compatibilityStatus) &&
      (compatibilityArea === "all" || record.area === compatibilityArea) &&
      (compatibilityDialect === "all" || record.dialect === compatibilityDialect),
  );
  const inventoryPageCount = Math.max(
    1,
    Math.ceil(visibleCompatibility.length / COMPATIBILITY_PAGE_SIZE),
  );
  const currentInventoryPage = Math.min(inventoryPage, inventoryPageCount - 1);
  const selectedCompatibility =
    visibleCompatibility.find((record) => record.id === selectedCompatibilityId) ??
    visibleCompatibility[0];

  return (
    <div className="sw-si-lab-body" id="contract">
      <p className="sw-si-lab-body__lede">
        A fixed, checked test set and the product&apos;s declared feature boundaries. It does not
        claim blanket Excel, Google Sheets, LibreOffice or OpenFormula compatibility.{" "}
        <Link to="/docs/$/" params={{ _splat: "reference/compatibility-results" }}>
          The detailed checked results
          <Icon name="arrow-right" size="sm" />
        </Link>
      </p>
      <VaultSummary />

      <h4 className="sw-si-lab-body__title">Test cases</h4>
      <p className="sw-si-lab-body__note">
        The first checked case of every function and feature, plus every result state:{" "}
        {TEST_SET.publishedExamples.toLocaleString("en")} of the{" "}
        {TEST_SET.totalTests.toLocaleString("en")} tests.
      </p>
      <fieldset className="sw-si-compat__filters">
        <legend className="sw-visually-hidden">Filter the test cases</legend>
        <ChoiceMenu
          label="Function or feature"
          onChange={(value) => {
            setResultFeature(value);
            setSelectedResultId(null);
          }}
          options={[
            { value: "all", label: "All functions and features" },
            ...COMPATIBILITY_RESULTS.filterOptions.features,
          ]}
          testId="compatibility-feature-filter"
          value={resultFeature}
        />
        <ChoiceMenu
          label="Behavior"
          onChange={(value) => {
            setResultBehavior(value);
            setSelectedResultId(null);
          }}
          options={[
            { value: "all", label: "All behavior scopes" },
            ...COMPATIBILITY_RESULTS.filterOptions.behaviors.map((behavior) => ({
              value: behavior,
              label: BEHAVIOR_LABELS[behavior] ?? behavior,
            })),
          ]}
          testId="compatibility-behavior-filter"
          value={resultBehavior}
        />
        <ChoiceMenu
          label="Result status"
          onChange={(value) => {
            setResultStatus(value as ResultFilter);
            setSelectedResultId(null);
          }}
          options={[
            { value: "all", label: "All result states" },
            ...COMPATIBILITY_RESULTS.filterOptions.statuses.map((entryStatus) => ({
              value: entryStatus,
              label: RESULT_STATUS_LABELS[entryStatus],
            })),
          ]}
          testId="compatibility-status-filter"
          value={resultStatus}
        />
        {resultPageCount > 1 && (
          <ChoiceMenu
            label="Page"
            value={String(currentResultPage)}
            onChange={(value) => {
              const page = Number(value);
              setResultPage(page);
              setSelectedResultId(visibleResults[page * COMPATIBILITY_PAGE_SIZE]?.id ?? null);
            }}
            testId="compatibility-example-page"
            options={pageChoices(resultPageCount)}
          />
        )}
        <span aria-live="polite" className="sw-si-compat__count">
          {visibleResults.length} of {TEST_SET.publishedExamples} cases
        </span>
      </fieldset>
      <div className="sw-si-compat sw-si-results">
        <div className="sw-si-tablewrap">
          <table
            className="sw-si-table sw-si-vault__table"
            data-testid="compatibility-results-table"
          >
            <caption className="sw-visually-hidden">Checked compatibility test cases</caption>
            <thead>
              <tr>
                <th scope="col">Test</th>
                <th scope="col">Expected</th>
                <th scope="col">Result</th>
                <th scope="col">Record SHA-256</th>
              </tr>
            </thead>
            <tbody className="sw-si-compat__records">
              {visibleResults
                .slice(
                  currentResultPage * COMPATIBILITY_PAGE_SIZE,
                  (currentResultPage + 1) * COMPATIBILITY_PAGE_SIZE,
                )
                .map((entry) => (
                  <ResultRow
                    entry={entry}
                    key={entry.id}
                    onSelect={() => setSelectedResultId(entry.id)}
                    selected={selectedResult?.id === entry.id}
                  />
                ))}
            </tbody>
          </table>
        </div>
        {selectedResult && selectedResultSource && selectedResultEvidence ? (
          <CompatibilityResultDetail
            selectedResult={selectedResult}
            selectedResultSource={selectedResultSource}
            selectedResultEvidence={selectedResultEvidence}
          />
        ) : (
          <p className="sw-si-empty" data-testid="compatibility-results-empty">
            {resultStatus === "regression"
              ? "No reviewed regressions are recorded. Results from other apps are unavailable rather than assumed."
              : "No case matches these filters. Choose a broader function, behavior or status."}
          </p>
        )}
      </div>

      <h4 className="sw-si-lab-body__title">Declared feature boundaries</h4>
      <p className="sw-si-lab-body__note">
        Import, export, preservation, warnings and stated unsupported behavior, each linked to its
        exact source. A missing Excel or Google Sheets result is never turned into a claim.
      </p>
      <fieldset className="sw-si-compat__filters">
        <legend className="sw-visually-hidden">Filter the feature boundary records</legend>
        <ChoiceMenu
          label="Status"
          onChange={(value) => setCompatibilityStatus(value as CompatibilityFilter)}
          options={[
            { value: "all", label: "All statuses" },
            ...Object.entries(INVENTORY_STATUS_LABELS).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
          testId="inventory-status-filter"
          value={compatibilityStatus}
        />
        <ChoiceMenu
          label="Feature area"
          onChange={setCompatibilityArea}
          options={[
            { value: "all", label: "All feature areas" },
            ...COMPATIBILITY_AREAS.map((area) => ({ value: area, label: areaName(area) })),
          ]}
          testId="inventory-area-filter"
          value={compatibilityArea}
        />
        <ChoiceMenu
          label="Behavior"
          onChange={setCompatibilityDialect}
          options={[
            { value: "all", label: "All behavior scopes" },
            ...COMPATIBILITY_DIALECTS.map((behavior) => ({
              value: behavior,
              label: BEHAVIOR_LABELS[behavior] ?? behavior,
            })),
          ]}
          testId="inventory-behavior-filter"
          value={compatibilityDialect}
        />
        {inventoryPageCount > 1 && (
          <ChoiceMenu
            label="Page"
            value={String(currentInventoryPage)}
            onChange={(value) => {
              const page = Number(value);
              setInventoryPage(page);
              setSelectedCompatibilityId(
                visibleCompatibility[page * COMPATIBILITY_PAGE_SIZE]?.id ?? null,
              );
            }}
            testId="compatibility-record-page"
            options={pageChoices(inventoryPageCount)}
          />
        )}
        <span aria-live="polite" className="sw-si-compat__count">
          {visibleCompatibility.length} of {compatibilityData.records.length} records
        </span>
      </fieldset>
      <div className="sw-si-compat sw-si-inventory">
        <div className="sw-si-tablewrap">
          <table className="sw-si-table">
            <caption className="sw-visually-hidden">Declared feature boundary records</caption>
            <thead>
              <tr>
                <th scope="col">Record</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody className="sw-si-compat__records">
              {visibleCompatibility
                .slice(
                  currentInventoryPage * COMPATIBILITY_PAGE_SIZE,
                  (currentInventoryPage + 1) * COMPATIBILITY_PAGE_SIZE,
                )
                .map((record) => (
                  <RecordRow
                    key={record.id}
                    onSelect={() => setSelectedCompatibilityId(record.id)}
                    record={record}
                    selected={selectedCompatibility?.id === record.id}
                  />
                ))}
            </tbody>
          </table>
        </div>
        {selectedCompatibility ? (
          <RecordDetail record={selectedCompatibility} />
        ) : (
          <p className="sw-si-empty">No feature boundary record matches these filters.</p>
        )}
      </div>
    </div>
  );
}

function CompatibilityResultDetail({
  selectedResult,
  selectedResultSource,
  selectedResultEvidence,
}: {
  selectedResult: CompatibilityResultCase;
  selectedResultSource: CompatibilityResultSource;
  selectedResultEvidence: CompatibilityResultEvidence;
}) {
  return (
    <article
      className="sw-si-compat__detail sw-si-results__detail"
      data-behavior={selectedResult.behavior}
      data-status={selectedResult.statusTags.join(" ")}
      data-testid="compatibility-result-detail"
    >
      <p className="sw-si-compat__mode">
        <ResultStatusTags tags={selectedResult.statusTags} as="span" />
      </p>
      <p className="sw-si-results__position">
        Test {selectedResult.position.toLocaleString()} of{" "}
        {COMPATIBILITY_RESULTS.testSet.totalTests.toLocaleString()} ·{" "}
        {BEHAVIOR_LABELS[selectedResult.behavior]}
      </p>
      <h3>{selectedResult.label}</h3>
      <p>{selectedResultEvidence.description}</p>

      {selectedResult.unsupported && (
        <p className="sw-si-results__notice" data-state="unsupported">
          <strong>Unsupported and excluded from the pass percentage.</strong> This is a checked
          nonclaim, not a failed supported feature.
        </p>
      )}
      {selectedResult.statusTags.includes("warning") && (
        <p className="sw-si-results__notice" data-state="warning">
          <strong>Warning behavior check.</strong> This test exercises the warning path; it does not
          claim that an external app emitted a warning.
        </p>
      )}
      {selectedResult.knownDifference && (
        <aside className="sw-si-results__difference" data-testid="known-difference">
          <h4>Known difference</h4>
          <p>{selectedResult.knownDifference.reason}</p>
          <p>
            Recorded for{" "}
            {selectedResult.knownDifference.producers
              .filter((producer) => producer !== "excel-web")
              .map((producer) => TESTED_APPS.find((app) => app.id === producer)?.label ?? producer)
              .join(", ")}
            .
          </p>
          <pre>
            <HighlightedCode
              code={JSON.stringify(selectedResult.knownDifference.alternate, null, 2)}
              language="json"
            />
          </pre>
        </aside>
      )}

      <section aria-labelledby="selected-test-preview" className="sw-si-results__preview">
        <h4 id="selected-test-preview">
          {selectedResult.kind === "formula" ? "Input and expected result" : "Workbook preview"}
        </h4>
        {selectedResult.formula && (
          <p>
            Formula <HighlightedCode code={selectedResult.formula} language="formula" />
            {selectedResult.target ? (
              <>
                {" "}
                at <code>{selectedResult.target}</code>
              </>
            ) : null}
          </p>
        )}
        {selectedResult.inputs && selectedResult.inputs.length > 0 ? (
          <dl className="sw-si-results__inputs">
            {selectedResult.inputs.map((input) => (
              <div key={input.cell}>
                <dt>{input.cell}</dt>
                <dd>
                  <code>{JSON.stringify(input.value)}</code>
                </dd>
              </div>
            ))}
          </dl>
        ) : selectedResult.formula ? (
          <p>No input cells are required.</p>
        ) : null}
        {selectedResult.operations && (
          <pre data-testid="compatibility-workbook-preview">
            <HighlightedCode
              code={JSON.stringify(selectedResult.operations, null, 2)}
              language="json"
            />
          </pre>
        )}
        <dl>
          <div>
            <dt>Expected checked result</dt>
            <dd>
              <ExpectedValue result={selectedResult.expected} />
            </dd>
          </div>
          <div>
            <dt>Comparison tolerance</dt>
            <dd data-testid="compatibility-tolerance">
              {selectedResult.tolerance.kind === "exact"
                ? "Exact type and value"
                : `${selectedResult.tolerance.kind} · ${selectedResult.tolerance.value}`}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="tested-app-results" className="sw-si-results__apps">
        <h4 id="tested-app-results">Tested app results and differences</h4>
        <p>
          Missing results stay unavailable. A source description or expected value never substitutes
          for a reviewed app result.
        </p>
        <ul>
          {TESTED_APPS.map((app) => (
            <TestedAppResult app={app} selectedResult={selectedResult} key={app.id} />
          ))}
        </ul>
      </section>

      <details className="sw-si-results__technical">
        <summary>Technical test details</summary>
        <dl>
          <div>
            <dt>Machine ID</dt>
            <dd>
              <code>{selectedResult.id}</code>
            </dd>
          </div>
          <div>
            <dt>Test record SHA-256</dt>
            <dd>
              <code>{selectedResult.testChecksum}</code>
            </dd>
          </div>
          <div>
            <dt>Exact source</dt>
            <dd>
              <a href={selectedResultSource.url}>
                {selectedResultSource.title}, {selectedResultSource.section}
              </a>
            </dd>
          </div>
          <div>
            <dt>Source record SHA-256</dt>
            <dd>
              <code>{selectedResultSource.sha256}</code>
            </dd>
          </div>
          <div>
            <dt>Source rights</dt>
            <dd>
              {selectedResultSource.authorship} · {selectedResultSource.license}
            </dd>
          </div>
          <div>
            <dt>Generated checked data</dt>
            <dd>
              <a href={compatibilityResultsUrl}>Open exact generated JSON</a>
            </dd>
          </div>
        </dl>
      </details>
    </article>
  );
}

function TestedAppResult({
  app,
  selectedResult,
}: {
  app: (typeof TESTED_APPS)[number];
  selectedResult: CompatibilityResultCase;
}) {
  const isSheetwrite = app.id === "sheetwrite";
  const localPassed = selectedResult.statusTags.includes("local-pass");
  const observation = isSheetwrite
    ? undefined
    : selectedResult.observations.find((entry) => entry.testedApp === app.id);
  const reviewed = observation?.reviewStatus === "reviewed";
  const state = isSheetwrite
    ? localPassed
      ? "local-pass"
      : selectedResult.unsupported
        ? "unsupported"
        : "unavailable"
    : (observation?.reviewStatus ?? "unavailable");
  return (
    <li data-state={state} data-testid={`app-result-${app.id}`} key={app.id}>
      <div>
        <strong>{app.label}</strong>
        <span>
          {isSheetwrite
            ? localPassed
              ? "Local check passed"
              : selectedResult.unsupported
                ? "Unsupported · not claimed"
                : "Local result unavailable"
            : reviewed
              ? "Reviewed result"
              : "Result unavailable"}
        </span>
      </div>
      <dl>
        {isSheetwrite ? (
          <>
            <div>
              <dt>Library version</dt>
              <dd>{COMPATIBILITY_RESULTS.testSet.libraryVersion}</dd>
            </div>
            <div>
              <dt>Checked evidence</dt>
              <dd>
                Test {selectedResult.position.toLocaleString()} in checked set v
                {COMPATIBILITY_RESULTS.testSet.version}
              </dd>
            </div>
            <div>
              <dt>Result comparison</dt>
              <dd>
                {localPassed
                  ? "The local result matched the checked expected value under the published tolerance."
                  : selectedResult.unsupported
                    ? "No supported local behavior is claimed for this checked case."
                    : "No local checked result is attached to this case."}
              </dd>
            </div>
            <div>
              <dt>Test record SHA-256</dt>
              <dd>{selectedResult.testChecksum}</dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>Version</dt>
              <dd>{observation?.version ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Captured</dt>
              <dd>{observation?.capturedAt ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Result differences</dt>
              <dd>
                {!reviewed
                  ? "Unavailable — no reviewed result file is attached to this test."
                  : observation.differences.length === 0
                    ? "No differences after type-aware comparison."
                    : observation.differences.join("; ")}
              </dd>
            </div>
            <div>
              <dt>Evidence file checksum</dt>
              <dd>{observation?.evidenceFileChecksum ?? "Unavailable"}</dd>
            </div>
          </>
        )}
      </dl>
      {isSheetwrite ? (
        <div className="sw-si-results__local">
          <strong>
            {localPassed
              ? "Local checked result"
              : selectedResult.unsupported
                ? "Checked nonclaim result"
                : "Expected checked result"}
          </strong>
          <ExpectedValue result={selectedResult.expected} testId="app-result-sheetwrite-capture" />
        </div>
      ) : (
        observation?.result && (
          <details>
            <summary>Technical captured result</summary>
            <pre>
              <HighlightedCode code={JSON.stringify(observation.result, null, 2)} language="json" />
            </pre>
          </details>
        )
      )}
    </li>
  );
}

function ResultStatusTags({
  tags,
  as: Tag,
}: {
  tags: readonly CompatibilityResultStatus[];
  as: "i" | "span";
}) {
  return tags.map((tag) => (
    <Tag data-state={tag} key={tag}>
      {RESULT_STATUS_LABELS[tag]}
    </Tag>
  ));
}
