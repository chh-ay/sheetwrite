// The Security lab: hostile packages and over-limit inputs run through the
// real import path, one row each with the attack, the typed error and the
// resource limit it hit.

import { pendingProps } from "../../lib/use-action.js";
import type { InteroperabilityWorkbench } from "../InteroperabilityShowcase.js";
import {
  ADVERSARIAL_FIXTURES,
  createInjectionSnapshot,
  delimitedCeilingDemo,
  INTEROP_INJECTION_TEXT,
  type RejectionReport,
} from "../scenarios/interoperability.js";
import { CopyValue } from "./CopyValue.js";

/** Decimals with three or more places, and integers of four or more digits. */
const RAW_NUMBER = /\b\d+\.\d{3,}\b|\b\d{4,}\b/gu;

/** An error message with its numbers grouped and rounded for reading; the copy keeps the raw text. */
function readableMessage(message: string): string {
  return message.replace(RAW_NUMBER, (number) =>
    Number(number).toLocaleString("en", { maximumFractionDigits: 1 }),
  );
}

interface AttackRow {
  readonly id: string;
  readonly input: string;
  readonly attack: string;
  readonly report: RejectionReport | null | undefined;
  readonly testId: string;
  /** Hostile packages mark the run as `rejected`; ceiling checks as `pass`. */
  readonly kind: "package" | "ceiling";
}

function rowState(row: AttackRow): string {
  if (!row.report) return "pending";
  if (row.kind === "package") return row.report.rejected ? "rejected" : "accepted";
  return row.report.rejected ? "pass" : "fail";
}

function Verdict({ report }: Readonly<{ report: RejectionReport | null | undefined }>) {
  if (!report) return <span className="sw-si-muted">Not run yet</span>;
  if (!report.rejected) {
    return (
      <span className="sw-badge" data-size="sm" data-tone="danger">
        Accepted: this is a bug
      </span>
    );
  }
  return (
    <span className="sw-si-verdict">
      <span className="sw-badge" data-size="sm" data-tone="accent">
        Rejected
      </span>
      <code>{report.code ?? report.errorName}</code>
      <span className="sw-si-verdict__name">{report.errorName}</span>
      {report.limit && (
        <span className="sw-si-verdict__limit">
          at <code>{report.limit}</code>
        </span>
      )}
    </span>
  );
}

function AttackTable({ rows }: Readonly<{ rows: readonly AttackRow[] }>) {
  return (
    <div className="sw-si-tablewrap">
      <table className="sw-si-table sw-si-attacks" data-testid="interop-hostile-table">
        <caption className="sw-visually-hidden">
          Hostile packages and over-limit inputs, with the error each import raised
        </caption>
        <thead>
          <tr>
            <th scope="col">Input</th>
            <th scope="col">Attack</th>
            <th scope="col">Typed rejection</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr data-state={rowState(row)} data-testid={row.testId} key={row.id}>
              <th scope="row">
                <code>{row.input}</code>
              </th>
              <td>{row.attack}</td>
              <td>
                <Verdict report={row.report} />
                {row.report?.message && (
                  <p className="sw-si-errdetail">
                    <CopyValue
                      label={`the error message for ${row.input}`}
                      shown={readableMessage(row.report.message)}
                      value={row.report.message}
                    />
                  </p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InjectionProbe({ workbench }: Readonly<{ workbench: InteroperabilityWorkbench }>) {
  const { action, run, setSource, setRoundTrip, setFileReport, setBulkReport, setCsvPreview } =
    workbench;
  return (
    <section aria-labelledby="security-probe" className="sw-si-probe">
      <h4 id="security-probe">Formula-injection probe</h4>
      <p>
        <code>{INTEROP_INJECTION_TEXT}</code> is stored as literal text, not as a link or a formula.
        Load it into the grid, then export the CSV and see the neutralized cell.
      </p>
      <div className="sw-si-actions">
        <button
          className="sw-button"
          data-size="sm"
          data-testid="interop-injection-load"
          disabled={action.pending}
          onClick={() => {
            setRoundTrip(null);
            setFileReport(null);
            setBulkReport(null);
            setCsvPreview(null);
            setSource({
              kind: "snapshot",
              label: "Security lab · literal injection probe",
              snapshot: createInjectionSnapshot(),
            });
          }}
          type="button"
        >
          Load the probe
        </button>
        <button
          className="sw-button"
          data-size="sm"
          data-testid="interop-injection-export"
          {...pendingProps(action.pending)}
          onClick={() => run(workbench.handleCsvExport)}
          type="button"
        >
          Export the probe as CSV
        </button>
      </div>
      {workbench.injectionCsvLine && (
        <p className="sw-si-probe__proof" data-testid="interop-injection-proof">
          Exported as <code>{workbench.injectionCsvLine}</code>
        </p>
      )}
    </section>
  );
}

export function SecurityLab({ workbench }: Readonly<{ workbench: InteroperabilityWorkbench }>) {
  const {
    action,
    run,
    rejections,
    abortReport,
    cellCapReport,
    csvCapReport,
    setCsvCapReport,
    handleHostileRun,
    handleAbortDemo,
    handleCellCapDemo,
  } = workbench;
  const rows: AttackRow[] = [
    ...ADVERSARIAL_FIXTURES.map((fixture): AttackRow => ({
      id: fixture.id,
      input: fixture.file,
      attack: fixture.details.join("; "),
      report: rejections[fixture.id],
      testId: `hostile-${fixture.id}`,
      kind: "package",
    })),
    {
      id: "abort",
      input: "AbortSignal",
      attack: "An import whose signal is already aborted",
      report: abortReport,
      testId: "interop-abort-report",
      kind: "ceiling",
    },
    {
      id: "cells",
      input: "maxCells: 8",
      attack: "A workbook with more cells than the import allows",
      report: cellCapReport,
      testId: "interop-cellcap-report",
      kind: "ceiling",
    },
    {
      id: "csv",
      input: "CSV, maxCells: 1,000",
      attack: "Delimited text with more cells than the parser allows",
      report: csvCapReport,
      testId: "interop-csvcap-report",
      kind: "ceiling",
    },
  ];

  return (
    <div className="sw-si-lab-body">
      <p className="sw-si-lab-body__lede">
        Import checks its byte, entry, dimension, compression-ratio and cell ceilings before it
        allocates, honors an <code>AbortSignal</code>, and rejects hand-authored hostile packages
        with typed errors.
      </p>
      <div aria-label="Run the attacks" className="sw-si-actions" role="toolbar">
        <button
          className="sw-button"
          data-size="sm"
          data-testid="interop-hostile-run"
          data-variant="primary"
          {...pendingProps(action.pending)}
          onClick={() => run(handleHostileRun)}
          type="button"
        >
          Run the {ADVERSARIAL_FIXTURES.length} hostile packages
        </button>
        <button
          className="sw-button"
          data-size="sm"
          data-testid="interop-abort-demo"
          {...pendingProps(action.pending)}
          onClick={() => run(handleAbortDemo)}
          type="button"
        >
          Import with an aborted signal
        </button>
        <button
          className="sw-button"
          data-size="sm"
          data-testid="interop-cellcap-demo"
          {...pendingProps(action.pending)}
          onClick={() => run(handleCellCapDemo)}
          type="button"
        >
          Import with maxCells: 8
        </button>
        <button
          className="sw-button"
          data-size="sm"
          data-testid="interop-csvcap-demo"
          onClick={() => setCsvCapReport(delimitedCeilingDemo())}
          type="button"
        >
          Parse CSV over the ceiling
        </button>
      </div>
      <AttackTable rows={rows} />
      <InjectionProbe workbench={workbench} />
    </div>
  );
}
