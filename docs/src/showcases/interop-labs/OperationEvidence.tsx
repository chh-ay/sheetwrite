// The Operation evidence lab: the warnings the latest import or export
// reported, one row per warning with its public code and where it applies.

import type { XlsxWorkbookWarning } from "@sheetwrite/core";
import { Link } from "@tanstack/react-router";

import { Icon } from "../../components/Icon.js";
import type { InteroperabilityWorkbench } from "../InteroperabilityShowcase.js";

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

export function OperationEvidence({
  workbench,
}: Readonly<{ workbench: InteroperabilityWorkbench }>) {
  const { warningLog } = workbench;
  return (
    <div className="sw-si-lab-body">
      <p className="sw-si-lab-body__lede">
        Every import and export reports what it could not keep as <code>XlsxWorkbookWarning</code>{" "}
        records, each with a public code and the sheet, cell or package part it applies to.{" "}
        <Link to="/docs/$/" params={{ _splat: "api/core/xlsx-workbook-warning" }}>
          Warning codes
          <Icon name="arrow-right" size="sm" />
        </Link>
      </p>
      <div className="sw-si-warnings" data-testid="interop-warnings">
        {warningLog === null ? (
          <p className="sw-si-empty">
            No import or export has run yet. Run the round trip or load a fixture from the Source
            library, and its warnings appear here.
          </p>
        ) : warningLog.warnings.length === 0 ? (
          <p className="sw-si-empty" data-testid="interop-warnings-none">
            {warningLog.operation}: nothing was lost, so no warning was reported.
          </p>
        ) : (
          <>
            <header className="sw-si-warnings__head">
              <strong>{warningLog.operation}</strong>
              <ul aria-label="Warnings by code" className="sw-si-warnings__codes">
                {codeCounts(warningLog.warnings).map(([code, count]) => (
                  <li key={code}>
                    <code>{code}</code> × {count}
                  </li>
                ))}
              </ul>
            </header>
            <div className="sw-si-tablewrap">
              <table className="sw-si-table">
                <caption className="sw-visually-hidden">
                  The warnings {warningLog.operation} reported
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    <th scope="col">Where</th>
                    <th scope="col">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {warningLog.warnings.map((warning) => (
                    <tr key={[warning.code, warning.message, warningPlace(warning)].join("|")}>
                      <td>
                        <code className="sw-si-warncode">{warning.code}</code>
                      </td>
                      <td>
                        <code>{warningPlace(warning)}</code>
                      </td>
                      <td>{warning.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
