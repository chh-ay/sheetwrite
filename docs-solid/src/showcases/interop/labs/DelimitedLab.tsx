import { formatBytes } from "@docs/lib/format.js";
import { createSignal, For, Show } from "solid-js";

import { Icon } from "../../../components/Icon.js";
import { pendingProps } from "../../../lib/use-action.js";
import { INTEROP_INJECTION_TEXT } from "../../scenarios/interoperability.js";
import {
  actionPending,
  csvPreview,
  engine,
  gridReady,
  pasteError,
  run,
  tsvPreview,
} from "../state.js";
import { LabAnswer, LabFigure } from "./LabParts.js";
import { nf } from "./vault-data.js";

/** Lines of exported text shown before the preview expands. */
const LINES_SHOWN = 8;
/** Characters of exported text the expanded preview shows. */
const CHARS_SHOWN = 2_000;
/**
 * A cell the exporter neutralized: its text starts with an apostrophe before
 * `=`, `+`, `-` or `@`, so a spreadsheet opens it as text, not as a formula.
 */
const NEUTRALIZED_CELL = /(?:^|,)"?'[=+\-@]/u;

const textLines = (text: string): string[] => text.split(/\r?\n/u).filter((line) => line !== "");

/** The first lines of exported text, the rest on demand. */
function ExportedText(props: Readonly<{ text: string; testId: string }>) {
  const [expanded, setExpanded] = createSignal(false);
  const all = () => textLines(props.text);
  const lines = () =>
    expanded() ? textLines(props.text.slice(0, CHARS_SHOWN)) : all().slice(0, LINES_SHOWN);
  return (
    <>
      {/* A scrolling region of text has a tab stop so keyboard users can scroll it. */}
      <pre class="sw-delimited-text" data-testid={props.testId} tabindex="0">
        <For each={lines()}>
          {(line) => (
            <span
              class="sw-delimited-line"
              data-neutralized={NEUTRALIZED_CELL.test(line) || undefined}
            >
              {line}
              {"\n"}
            </span>
          )}
        </For>
      </pre>
      <Show when={all().length > LINES_SHOWN && !expanded()}>
        <button class="sw-lab-more" onClick={() => setExpanded(true)} type="button">
          Show more of the {nf(all().length)} lines
        </button>
      </Show>
    </>
  );
}

/** The injection probe: a formula-like text cell, exported as text. */
function InjectionProbe() {
  const proof = () =>
    csvPreview()
      ?.split(/\r?\n/u)
      .find((line) => line.includes("'=HYPERLINK("));
  return (
    <section aria-labelledby="delimited-probe" class="sw-delimited-probe">
      <h4 class="sw-lab-subhead" id="delimited-probe">
        Try the injection probe
      </h4>
      <p>
        <code>{INTEROP_INJECTION_TEXT}</code> goes into the workbook as plain text. Export it as CSV
        and see the cell that a spreadsheet app will show as text.
      </p>
      <div class="sw-lab-actions">
        <button
          class="sw-button"
          data-size="sm"
          data-testid="interop-injection-load"
          disabled={actionPending() || !gridReady()}
          onClick={() => engine()?.loadInjectionProbe()}
          type="button"
        >
          <Icon name="upload" />
          Load the probe
        </button>
        <button
          class="sw-button"
          data-size="sm"
          data-testid="interop-injection-export"
          {...pendingProps(actionPending())}
          onClick={() => run((current) => current.handleCsvExport())}
          type="button"
        >
          <Icon name="download" />
          Export the probe as CSV
        </button>
      </div>
      <Show when={proof()}>
        {(line) => (
          <p class="sw-delimited-proof" data-testid="interop-injection-proof">
            Exported as <code>{line()}</code>
          </p>
        )}
      </Show>
    </section>
  );
}

/** The CSV and TSV lab: the grid out as text, injection neutralized, and CSV back in. */
export function DelimitedLab() {
  const [pasteText, setPasteText] = createSignal("");
  const lines = () => {
    const text = csvPreview();
    return text === null ? [] : textLines(text);
  };
  const neutralized = () => lines().filter((line) => NEUTRALIZED_CELL.test(line)).length;
  return (
    <div class="sw-lab-body">
      <LabAnswer
        answer={
          <>
            Yes. Text that starts with <code>=</code>, <code>+</code>, <code>-</code>,{" "}
            <code>@</code>, a tab or a return is exported with a leading apostrophe, so a
            spreadsheet app shows it as text instead of running it. Numbers, including negative
            ones, are exported unchanged.
          </>
        }
        figure={
          <Show
            fallback={
              <div class="sw-lab-figure">
                <p class="sw-lab-figure__label">Not exported yet</p>
                <p class="sw-lab-note">
                  Export the sheet below to count its lines and the cells exported as text.
                </p>
              </div>
            }
            when={csvPreview()}
          >
            {(text) => (
              <LabFigure
                label="CSV lines exported"
                stats={
                  <>
                    <span>
                      <b>{nf(neutralized())}</b> neutralized
                    </span>
                    <span>
                      <b>
                        {formatBytes(new TextEncoder().encode(text()).byteLength, {
                          kib: 1,
                          mib: 2,
                        })}
                      </b>
                    </span>
                  </>
                }
                value={nf(lines().length)}
              />
            )}
          </Show>
        }
        headingId="delimited-question"
        icon="table"
        name="CSV and TSV"
        question="Is CSV export safe to open in a spreadsheet app?"
        term={
          <>
            <strong>Formula injection:</strong> a cell like <code>=HYPERLINK(…)</code> that runs
            when someone opens the file.
          </>
        }
      />
      <div class="sw-delimited">
        <section aria-labelledby="delimited-out" class="sw-delimited-pane">
          <h4 class="sw-lab-subhead" id="delimited-out">
            Out: the grid as text
          </h4>
          <div aria-label="Export the grid as text" class="sw-lab-actions" role="toolbar">
            <button
              class="sw-button"
              data-size="sm"
              data-testid="interop-csv-export"
              data-variant="primary"
              {...pendingProps(actionPending())}
              onClick={() => run((current) => current.handleCsvExport())}
              type="button"
            >
              Export the sheet as CSV
            </button>
            <button
              class="sw-button"
              data-size="sm"
              data-testid="interop-tsv-export"
              {...pendingProps(actionPending())}
              onClick={() => run((current) => current.handleTsvExport())}
              type="button"
            >
              Selection as TSV
            </button>
            <button
              class="sw-button"
              data-size="sm"
              data-testid="interop-csv-download"
              data-variant="quiet"
              {...pendingProps(actionPending())}
              onClick={() => run((current) => current.handleCsvDownload())}
              type="button"
            >
              <Icon name="download" />
              Download .csv
            </button>
          </div>
          <Show
            fallback={<p class="sw-lab-empty">Export the sheet to see its CSV here.</p>}
            when={csvPreview()}
          >
            {(text) => <ExportedText testId="interop-csv-output" text={text()} />}
          </Show>
          <Show when={tsvPreview()}>
            {(text) => (
              <>
                <p class="sw-delimited-meta">The selection as TSV</p>
                <ExportedText testId="interop-tsv-output" text={text()} />
              </>
            )}
          </Show>
          <p class="sw-lab-note">
            Text is lossier by design: formulas leave as their values, and styles and merges do not
            exist in CSV or TSV.
          </p>
        </section>
        <section aria-labelledby="delimited-in" class="sw-delimited-pane">
          <h4 class="sw-lab-subhead" id="delimited-in">
            In: CSV into the grid
          </h4>
          <label class="sw-delimited-input">
            <span>CSV with a header row</span>
            <textarea
              data-testid="interop-csv-input"
              onInput={(event) => setPasteText(event.currentTarget.value)}
              placeholder={"region,units,revenue\neu-west,12,3400\nus-east,7,2050"}
              rows={4}
              spellcheck={false}
              value={pasteText()}
            />
          </label>
          <div class="sw-lab-actions">
            <button
              class="sw-button"
              data-size="sm"
              data-testid="interop-csv-import"
              data-variant="primary"
              {...pendingProps(actionPending())}
              onClick={() => run((current) => current.handlePasteImport(pasteText()))}
              type="button"
            >
              Import into the grid
            </button>
          </div>
          <Show when={pasteError()}>
            {(message) => (
              <p class="sw-lab-error" data-testid="interop-csv-error" role="alert">
                {message()}
              </p>
            )}
          </Show>
        </section>
      </div>
      <InjectionProbe />
    </div>
  );
}
