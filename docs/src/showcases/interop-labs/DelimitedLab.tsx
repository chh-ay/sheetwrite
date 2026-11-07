// The Delimited-text lab: CSV in on one side, CSV and TSV out on the other.
// Exported lines whose cells were neutralized against formula injection are marked.

import { pendingProps } from "../../lib/use-action.js";
import type { InteroperabilityWorkbench } from "../InteroperabilityShowcase.js";

/** Characters of exported CSV the page shows. */
const CSV_SHOWN = 2_000;
/**
 * A cell the exporter neutralized: its text starts with an apostrophe before
 * `=`, `+`, `-` or `@`, so a spreadsheet opens it as text, not as a formula.
 */
const NEUTRALIZED_CELL = /(?:^|,)"?'[=+\-@]/u;

function ExportedText({ text, testId }: Readonly<{ text: string; testId: string }>) {
  const lines = text.slice(0, CSV_SHOWN).split(/\r?\n/u);
  return (
    // A scrolling region of text needs a tab stop so keyboard users can scroll it.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <pre className="sw-si-delimited__text" data-testid={testId} tabIndex={0}>
      {lines.map((line, index) => (
        <span
          className="sw-si-delimited__line"
          data-neutralized={NEUTRALIZED_CELL.test(line) || undefined}
          // Lines of exported text have no identity beyond their position.
          key={`${index}:${line}`}
        >
          {line}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

function ExportPane({ workbench }: Readonly<{ workbench: InteroperabilityWorkbench }>) {
  const {
    action,
    run,
    csvPreview,
    tsvPreview,
    handleCsvExport,
    handleCsvDownload,
    handleTsvExport,
  } = workbench;
  const neutralized = csvPreview
    ?.split(/\r?\n/u)
    .filter((line) => NEUTRALIZED_CELL.test(line)).length;
  return (
    <section aria-labelledby="delimited-out" className="sw-si-delimited__pane">
      <h4 id="delimited-out">Out: the grid as text</h4>
      <div aria-label="Export the grid as text" className="sw-si-actions" role="toolbar">
        <button
          className="sw-button"
          data-size="sm"
          data-testid="interop-csv-export"
          data-variant="primary"
          {...pendingProps(action.pending)}
          onClick={() => run(handleCsvExport)}
          type="button"
        >
          Export the sheet as CSV
        </button>
        <button
          className="sw-button"
          data-size="sm"
          data-testid="interop-tsv-export"
          {...pendingProps(action.pending)}
          onClick={() => run(handleTsvExport)}
          type="button"
        >
          Selection as TSV
        </button>
        <button
          className="sw-button"
          data-size="sm"
          data-testid="interop-csv-download"
          data-variant="quiet"
          {...pendingProps(action.pending)}
          onClick={() => run(handleCsvDownload)}
          type="button"
        >
          Download .csv
        </button>
      </div>
      {csvPreview === null ? (
        <p className="sw-si-empty">Export the sheet to see its CSV here.</p>
      ) : (
        <>
          <p className="sw-si-delimited__meta">
            CSV, first {CSV_SHOWN.toLocaleString("en")} characters
            {neutralized !== undefined && neutralized > 0 && (
              <span className="sw-badge" data-size="sm" data-tone="warning">
                {neutralized} line{neutralized === 1 ? "" : "s"} with a neutralized formula
              </span>
            )}
          </p>
          <ExportedText testId="interop-csv-output" text={csvPreview} />
        </>
      )}
      {tsvPreview !== null && (
        <>
          <p className="sw-si-delimited__meta">The selection as TSV</p>
          <ExportedText testId="interop-tsv-output" text={tsvPreview} />
        </>
      )}
      <p className="sw-si-note">
        Text is lossier by design: formulas leave as their values, and styles and merges do not
        exist in CSV or TSV.
      </p>
    </section>
  );
}

function ImportPane({ workbench }: Readonly<{ workbench: InteroperabilityWorkbench }>) {
  const { action, run, pasteText, setPasteText, pasteError, handlePasteImport } = workbench;
  return (
    <section aria-labelledby="delimited-in" className="sw-si-delimited__pane">
      <h4 id="delimited-in">In: CSV into the grid</h4>
      <label className="sw-si-delimited__input">
        <span>CSV with a header row</span>
        <textarea
          data-testid="interop-csv-input"
          onChange={(event) => setPasteText(event.currentTarget.value)}
          placeholder={"region,units,revenue\neu-west,12,3400\nus-east,7,2050"}
          rows={7}
          spellCheck={false}
          value={pasteText}
        />
      </label>
      <div className="sw-si-actions">
        <button
          className="sw-button"
          data-size="sm"
          data-testid="interop-csv-import"
          data-variant="primary"
          {...pendingProps(action.pending)}
          onClick={() => run(handlePasteImport)}
          type="button"
        >
          Import into the grid
        </button>
      </div>
      {pasteError && (
        <p className="sw-si-error" data-testid="interop-csv-error" role="alert">
          {pasteError}
        </p>
      )}
    </section>
  );
}

export function DelimitedLab({ workbench }: Readonly<{ workbench: InteroperabilityWorkbench }>) {
  return (
    <div className="sw-si-lab-body">
      <p className="sw-si-lab-body__lede">
        CSV and TSV export neutralize formula injection: a cell that starts with <code>=</code>,{" "}
        <code>+</code>, <code>-</code> or <code>@</code> leaves with an apostrophe in front, so a
        spreadsheet that opens the file shows text. Marked lines below carry such a cell.
      </p>
      <div className="sw-si-delimited">
        <ImportPane workbench={workbench} />
        <ExportPane workbench={workbench} />
      </div>
    </div>
  );
}
