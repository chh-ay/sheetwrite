import { formatBytes } from "@docs/lib/format.js";
import { For, onCleanup, onMount, Show } from "solid-js";

import { Icon } from "../../components/Icon.js";
import { ActionError, pendingProps } from "../../lib/use-action.js";
import {
  ShowcaseControlGroup,
  ShowcaseReadout,
  ShowcaseStage,
  ShowcaseStatus,
} from "../layout/ShowcaseLayout.js";
import { whenNearViewport } from "../lib/near-viewport.js";
import type { RoundTripReport } from "../scenarios/interoperability.js";
import { Button } from "../ui/Button.js";
import {
  actionError,
  actionPending,
  bulkReport,
  dragActive,
  engine,
  fileReport,
  gridReady,
  modelChange,
  modelReadout,
  roundTrip,
  run,
  setDragActive,
  setEngine,
  sourceLabel,
  status,
  warningLog,
} from "./state.js";

/** Empty value for an exchange measurement that has not run yet. */
const NOT_RUN = "Not run";

/** "pass" when every cell, formula, sheet, merge and frozen row came back. */
function roundTripOutcome(report: RoundTripReport): "pass" | "partial" {
  return report.formulasPreserved === report.formulasBefore &&
    report.sheetsPreserved &&
    report.mergePreserved &&
    report.frozenRowsPreserved &&
    report.cellsMatched === report.cellsCompared
    ? "pass"
    : "partial";
}

function formatCurrency(value: number | null): string {
  return value === null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(value);
}

function formatPercent(value: number | null): string {
  return value === null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 2 }).format(value);
}

function formatSerialDate(value: number | null): string {
  if (value === null) return "Unavailable";
  return new Date(Date.UTC(1899, 11, 30) + Math.trunc(value) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** The workbook in the grid and whether the grid is ready, in the demo window bar. */
function ExchangeSource() {
  return (
    <span class="sw-si-source" data-testid="interop-source">
      <span class="sw-si-source__label">{sourceLabel()}</span>
      <ShowcaseStatus tone={gridReady() ? "ok" : "neutral"}>
        {gridReady() ? "Editable" : "Loading"}
      </ShowcaseStatus>
    </span>
  );
}

/** The lease and cash-flow model in the workbook: two inputs and its results. */
function FormulaModel() {
  const model = modelReadout;
  const results = () => [
    ["XLOOKUP rate", "interop-model-rate", formatPercent(model()?.selectedRate ?? null)],
    ["PMT / month", "interop-model-payment", formatCurrency(model()?.payment ?? null)],
    ["NPV", "interop-model-npv", formatCurrency(model()?.npv ?? null)],
    ["IRR", "interop-model-irr", formatPercent(model()?.irr ?? null)],
    ["STDEV.S", "interop-model-statistical", formatCurrency(model()?.statistical ?? null)],
    ["LET remaining payments", "interop-model-let", formatCurrency(model()?.letResult ?? null)],
    ["Schedule end", "interop-model-date", formatSerialDate(model()?.scheduleEnd ?? null)],
    [
      "SEQUENCE output",
      "interop-model-spill",
      (() => {
        const current = model();
        return current ? current.spill.filter((value) => value !== null).join(", ") : "Unavailable";
      })(),
    ],
  ];
  const input = (row: number, col: number, value: number, label: string) =>
    engine()?.handleModelInput(row, col, value, label);
  return (
    <details class="sw-si-model" data-testid="interop-model-disclosure">
      <summary>
        <Icon name="chevron-right" />
        Change the lease model's inputs and read its formula results
      </summary>
      <p class="sw-si-model__evidence" data-testid="interop-model-evidence">
        The local engine evaluates the model now; the compatibility results below are the checked
        record from other spreadsheet apps.
      </p>
      <fieldset class="sw-si-model__controls">
        <legend class="sw-visually-hidden">Analytical model inputs</legend>
        <fieldset class="sw-si-model__choice" data-testid="interop-rate-input" disabled={!model()}>
          <legend>Base annual rate</legend>
          <div class="sw-si-model__segments">
            <For
              each={[
                { label: "6.0%", value: 0.06 },
                { label: "9.0%", value: 0.09 },
              ]}
            >
              {(option) => (
                <label>
                  <input
                    checked={model()?.selectedRate === option.value}
                    name="interop-base-rate"
                    onChange={(event) =>
                      input(1, 3, Number(event.currentTarget.value), "Base annual rate")
                    }
                    type="radio"
                    value={option.value}
                  />
                  <span>{option.label}</span>
                </label>
              )}
            </For>
          </div>
        </fieldset>
        <fieldset class="sw-si-model__choice" data-testid="interop-spill-input" disabled={!model()}>
          <legend>Projection rows</legend>
          <div class="sw-si-model__segments">
            <For each={[3, 4, 6]}>
              {(periods) => (
                <label>
                  <input
                    checked={model()?.spill.filter((value) => value !== null).length === periods}
                    name="interop-spill-periods"
                    onChange={(event) =>
                      input(4, 1, Number(event.currentTarget.value), "Projection rows")
                    }
                    type="radio"
                    value={periods}
                  />
                  <span>
                    {periods}
                    <span class="sw-visually-hidden"> rows</span>
                  </span>
                </label>
              )}
            </For>
          </div>
        </fieldset>
      </fieldset>
      <dl class="sw-si-model__results" data-testid="interop-model-readout">
        <For each={results()}>
          {([label, testId, value]) => (
            <div>
              <dt>{label}</dt>
              <dd data-testid={testId}>{value}</dd>
            </div>
          )}
        </For>
      </dl>
      <p
        aria-live="polite"
        class="sw-si-model__scope"
        data-change-count={modelChange()?.committedCells ?? 0}
        data-changed-results={modelChange()?.changedResults.join(",") ?? ""}
        data-testid="interop-model-change-scope"
      >
        {(() => {
          const change = modelChange();
          return change
            ? `Public change event: ${change.committedCells} input cell at ${change.address}. Changed dependent results: ${change.changedResults.join(", ") || "none"}.`
            : "Public change event: awaiting an analytical input edit.";
        })()}
      </p>
    </details>
  );
}

/** The side panel: the round trip and its result, your own file, and the streamed import. */
function ExchangeControls() {
  const report = roundTrip;
  return (
    <>
      <ShowcaseControlGroup
        description="Export the workbook to XLSX, import the bytes again and compare every cell."
        title="Round trip"
      >
        <Button
          data-testid="interop-roundtrip"
          {...pendingProps(actionPending())}
          disabled={!gridReady() || actionPending()}
          onClick={() => run((current) => current.handleRoundTrip())}
          variant="primary"
        >
          <Icon name="refresh" />
          {actionPending() ? "Comparing workbook…" : "Export, re-import & compare"}
        </Button>
        <div
          aria-live="polite"
          data-state={(() => {
            const current = report();
            return current ? roundTripOutcome(current) : "ready";
          })()}
          data-testid={report() ? "interop-roundtrip-report" : "interop-fidelity-ledger"}
        >
          <ShowcaseReadout
            items={[
              {
                label: "Cells matched",
                value: (
                  <Show
                    fallback={<span data-testid="interop-cells-compared">{NOT_RUN}</span>}
                    when={report()}
                  >
                    {(current) => (
                      <span data-testid="interop-roundtrip-cells">
                        {current().cellsMatched}/{current().cellsCompared}
                      </span>
                    )}
                  </Show>
                ),
              },
              {
                label: "Formulas preserved",
                value: (
                  <Show fallback={NOT_RUN} when={report()}>
                    {(current) => (
                      <span data-testid="interop-roundtrip-formulas">
                        {current().formulasPreserved}/{current().formulasBefore}
                      </span>
                    )}
                  </Show>
                ),
              },
              {
                label: "Sheets, merges, frozen rows",
                get value() {
                  const current = report();
                  return current
                    ? [current.sheetsPreserved, current.mergePreserved, current.frozenRowsPreserved]
                        .map((kept) => (kept ? "kept" : "lost"))
                        .join(" · ")
                    : NOT_RUN;
                },
              },
              {
                label: "Warnings",
                get value() {
                  const log = warningLog();
                  return log ? log.warnings.length.toLocaleString("en") : NOT_RUN;
                },
              },
              {
                label: "XLSX size",
                get value() {
                  const current = report();
                  return current ? formatBytes(current.exportedBytes, { kib: 1, mib: 2 }) : NOT_RUN;
                },
              },
              {
                label: "Exchange time",
                get value() {
                  const current = report();
                  return current ? `${current.elapsedMs.toFixed(0)} ms` : NOT_RUN;
                },
              },
            ]}
          />
        </div>
        <p aria-live="polite" class="sw-si-status" data-testid="interop-status" role="status">
          {status()}
        </p>
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        description="Drop an .xlsx or .csv on the workbook, or pick one. Download the current workbook as .xlsx."
        title="Your own file"
      >
        <div class="sw-si-actions">
          <label class="sw-button sw-si-file" data-variant="default">
            <Icon name="upload" />
            {actionPending() ? "Importing file…" : "Open .xlsx or .csv"}
            <input
              accept=".xlsx,.csv"
              aria-busy={actionPending() || undefined}
              data-testid="interop-file-input"
              disabled={actionPending()}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                event.currentTarget.value = "";
                run((current) => current.handleFile(file));
              }}
              type="file"
            />
          </label>
          <Button
            data-testid="interop-download"
            {...pendingProps(actionPending())}
            onClick={() => run((current) => current.handleDownload())}
          >
            <Icon name="download" />
            {actionPending() ? "Exporting XLSX…" : "Download .xlsx"}
          </Button>
          <Button
            data-testid="interop-reset"
            disabled={actionPending()}
            onClick={() => engine()?.resetWorkbench()}
            variant="quiet"
          >
            <Icon name="restore" />
            Reset workbench
          </Button>
        </div>
        <Show when={fileReport()}>
          {(file) => (
            <p class="sw-si-report-line" data-testid="interop-file-report" role="status">
              <strong>{file().name}</strong>: {file().sheets}{" "}
              {file().sheets === 1 ? "sheet" : "sheets"} · {file().cells.toLocaleString("en")}{" "}
              stored cells · {file().formulas} formula sources · {file().warnings} import warnings ·{" "}
              {file().bytes.toLocaleString("en")} bytes · {file().ms.toFixed(0)} ms.
            </p>
          )}
        </Show>
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        description="Generate 200,000 sales records and put them through the CSV importer into typed columns. The time is the CSV parse."
        title="Streamed import"
      >
        <Button
          aria-busy={actionPending() || undefined}
          data-testid="interop-bulk-import"
          disabled={actionPending()}
          onClick={() => run((current) => current.handleBulkImport())}
        >
          <Icon name="bolt" />
          {actionPending() ? "Importing rows…" : "Generate & import 200,000 rows"}
        </Button>
        <Show when={bulkReport()}>
          {(bulk) => (
            <p class="sw-si-report-line" data-testid="interop-bulk-report" role="status">
              <strong>
                {bulk().rows.toLocaleString("en")} rows × {bulk().columns} columns
              </strong>{" "}
              · {bulk().ms.toFixed(0)} ms CSV parse · {bulk().bytes.toLocaleString("en")} bytes
            </p>
          )}
        </Show>
      </ShowcaseControlGroup>
    </>
  );
}

/** The interoperability showcase's island: the exchange workbook and its panel. */
export function InteropStage() {
  let gridHost!: HTMLDivElement;
  let formulaRow!: HTMLDivElement;
  let statusRow!: HTMLDivElement;

  onMount(() => {
    let disposed = false;
    const stopWaiting = whenNearViewport(gridHost, () => {
      void import("./engine.js").then(({ createInteropEngine }) => {
        if (!disposed) {
          setEngine(createInteropEngine({ grid: gridHost, formulaRow, statusRow }));
        }
      });
    });
    onCleanup(() => {
      disposed = true;
      stopWaiting();
      engine()?.dispose();
      setEngine(null);
    });
  });

  return (
    <ShowcaseStage
      controls={<ExchangeControls />}
      demo={
        // A file drop target; the file picker is the keyboard path.
        <section
          aria-label="Live workbook and spreadsheet drop target"
          class="sw-si-workbench"
          data-dragging={dragActive() || undefined}
          data-ready={gridReady() || undefined}
          data-testid="interop-drop-stage"
          id="xlsx"
          onDragLeave={() => setDragActive(false)}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            const file = event.dataTransfer?.files[0] ?? null;
            run((current) => current.handleFile(file));
          }}
        >
          <ActionError error={actionError()} />
          {/* shell.css sizes .sheetwrite-shell at height:100%, so the definite
              height lives on this owned wrapper. */}
          <div class="sw-si-stage">
            <div class="sheetwrite-shell">
              <div class="sheetwrite-shell-row sheetwrite-shell-formula-row" ref={formulaRow} />
              {/* Sheetwrite upgrades this host into a virtualized ARIA grid. */}
              <div
                aria-label="Interoperability workbench grid"
                class="sheetwrite-shell-grid sw-si-grid"
                ref={gridHost}
                role="grid"
              />
              <div class="sheetwrite-shell-row sheetwrite-shell-bottom-row" ref={statusRow} />
            </div>
          </div>
          <FormulaModel />
        </section>
      }
      demoActions={<ExchangeSource />}
      demoLabel="Live XLSX and CSV exchange workbook"
      demoTitle="Exchange workbook"
    />
  );
}
