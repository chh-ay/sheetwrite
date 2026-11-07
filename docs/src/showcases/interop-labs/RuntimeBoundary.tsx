// The Runtime boundary lab: core ships no XLSX codec. A diagram of the lazy
// handoff, and the typed error core raised before this page installed the codec.

import { Fragment } from "react";

import { Icon } from "../../components/Icon.js";
import type { IconName } from "../../icons/icon-names.js";
import type { InteroperabilityWorkbench } from "../InteroperabilityShowcase.js";

interface HandoffStep {
  readonly icon: IconName;
  readonly title: string;
  readonly code: string;
  readonly note: string;
}

const HANDOFF: readonly HandoffStep[] = [
  {
    icon: "layers",
    title: "Core alone",
    code: "@sheetwrite/core",
    note: "Workbook interchange throws a typed error: no codec is installed.",
  },
  {
    icon: "download",
    title: "First XLSX action",
    code: 'import("@sheetwrite/xlsx")',
    note: "The page loads the codec package only when a reader asks for XLSX.",
  },
  {
    icon: "check",
    title: "Codec installed",
    code: "initSheetwrite({ addons: [xlsxAddon()] })",
    note: "fromXlsxWorkbook and toXlsxWorkbook now read and write files.",
  },
];

function HandoffDiagram() {
  return (
    <ol aria-label="How the XLSX codec reaches the page" className="sw-si-handoff">
      {HANDOFF.map((step, index) => (
        <Fragment key={step.title}>
          {index > 0 && (
            <li aria-hidden="true" className="sw-si-handoff__arrow">
              <Icon name="arrow-right" size="sm" />
            </li>
          )}
          <li className="sw-si-handoff__step">
            <span className="sw-si-lab-card__icon">
              <Icon name={step.icon} />
            </span>
            <strong>{step.title}</strong>
            <code>{step.code}</code>
            <span>{step.note}</span>
          </li>
        </Fragment>
      ))}
    </ol>
  );
}

export function RuntimeBoundary({ workbench }: Readonly<{ workbench: InteroperabilityWorkbench }>) {
  const { probe } = workbench;
  const state = probe === null ? "pending" : probe.registered ? "registered" : "isolated";
  return (
    <div className="sw-si-lab-body">
      <p className="sw-si-lab-body__lede">
        <code>@sheetwrite/core</code> ships no XLSX implementation, so a page that never opens a
        workbook file never downloads one. CSV and TSV need no optional package at all.
      </p>
      <HandoffDiagram />
      <div className="sw-si-boundary" data-state={state} data-testid="interop-isolation">
        <h4>What core said before the codec was installed</h4>
        {probe === null ? (
          <p className="sw-si-empty">Probing…</p>
        ) : probe.registered ? (
          <p data-testid="interop-isolation-registered">
            A codec was already installed when this page probed, which happens after another page in
            this session loaded it. Open this URL in a new tab to see the typed error.
          </p>
        ) : (
          <div data-testid="interop-isolation-error">
            <p>Core refused workbook interchange with this error:</p>
            <pre className="sw-si-boundary__error">
              <code>{probe.error}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
