// The evidence and labs of the interoperability showcase: a card per lab, and
// the lab a reader opens below the cards. One lab is open at a time, so the
// page grows only by that lab.

import { useSearch } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Icon } from "../../components/Icon.js";
import type { IconName } from "../../icons/icon-names.js";
import type { InteroperabilityWorkbench } from "../InteroperabilityShowcase.js";
import { ADVERSARIAL_FIXTURES, POSITIVE_FIXTURES } from "../scenarios/interoperability.js";
import { DelimitedLab } from "./DelimitedLab.js";
import { EvidenceVault, VAULT_SUMMARY } from "./EvidenceVault.js";
import { OperationEvidence } from "./OperationEvidence.js";
import { RuntimeBoundary } from "./RuntimeBoundary.js";
import { SecurityLab } from "./SecurityLab.js";
import { SourceLibrary } from "./SourceLibrary.js";

type LabId = "vault" | "fixtures" | "warnings" | "delimited" | "security" | "runtime";

interface LabCard {
  readonly id: LabId;
  readonly icon: IconName;
  readonly title: string;
  readonly summary: string;
  /** The lab's headline number, read from its data or its last run. */
  readonly figure: string;
}

/** What each card says, from the checked data and the workbench's latest results. */
function labCards(workbench: InteroperabilityWorkbench): readonly LabCard[] {
  const verified = POSITIVE_FIXTURES.filter(
    (fixture) => workbench.digests[fixture.id]?.state === "verified",
  ).length;
  const reports = Object.values(workbench.rejections);
  const rejected = reports.filter((report) => report.rejected).length;
  const log = workbench.warningLog;
  return [
    {
      id: "vault",
      icon: "compare",
      title: "Evidence vault",
      summary: "The checked compatibility test set, each case with its expected value.",
      figure: VAULT_SUMMARY,
    },
    {
      id: "fixtures",
      icon: "file",
      title: "Source library",
      summary: "Workbooks saved by other software, hashed in your browser before use.",
      figure: `${POSITIVE_FIXTURES.length} fixtures, ${verified} checksums verified`,
    },
    {
      id: "warnings",
      icon: "warning",
      title: "Operation evidence",
      summary: "Every import and export reports what it could not keep, by code and cell.",
      figure:
        log === null
          ? "No operation yet"
          : `${log.warnings.length.toLocaleString("en")} warning${log.warnings.length === 1 ? "" : "s"} · ${log.operation}`,
    },
    {
      id: "delimited",
      icon: "table",
      title: "Delimited-text lab",
      summary: "CSV and TSV out, CSV in, with formula injection neutralized on export.",
      figure:
        workbench.csvPreview === null
          ? "Not exported yet"
          : `${workbench.csvPreview.split(/\r?\n/).filter(Boolean).length.toLocaleString("en")} CSV lines exported`,
    },
    {
      id: "security",
      icon: "shield",
      title: "Security lab",
      summary: "Hand-authored hostile packages and resource ceilings, each with its typed error.",
      figure:
        reports.length === 0
          ? `${ADVERSARIAL_FIXTURES.length} attack packages, not run yet`
          : `${ADVERSARIAL_FIXTURES.length} attack packages, ${rejected} rejected`,
    },
    {
      id: "runtime",
      icon: "layers",
      title: "Runtime boundary",
      summary: "Core ships no XLSX codec; the page loads it on the first XLSX action.",
      figure:
        workbench.probe === null
          ? "Probing…"
          : workbench.probe.registered
            ? "Codec already registered"
            : "Typed error before registration",
    },
  ];
}

function LabPanel({
  id,
  workbench,
}: Readonly<{ id: LabId; workbench: InteroperabilityWorkbench }>): ReactNode {
  switch (id) {
    case "vault":
      return <EvidenceVault />;
    case "fixtures":
      return <SourceLibrary workbench={workbench} />;
    case "warnings":
      return <OperationEvidence workbench={workbench} />;
    case "delimited":
      return <DelimitedLab workbench={workbench} />;
    case "security":
      return <SecurityLab workbench={workbench} />;
    case "runtime":
      return <RuntimeBoundary workbench={workbench} />;
  }
}

export function InteropLabs({ workbench }: Readonly<{ workbench: InteroperabilityWorkbench }>) {
  const [open, setOpen] = useState<LabId | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cards = labCards(workbench);
  const openCard = cards.find((card) => card.id === open);

  // `?compatibility=<record id>` opens the vault on that record.
  const { compatibility } = useSearch({ from: "/showcases/interoperability" });
  useEffect(() => {
    if (compatibility !== undefined) setOpen("vault");
  }, [compatibility]);

  const toggle = (id: LabId) => {
    setOpen((current) => (current === id ? null : id));
    // The lab opens below the cards; bring its top into view.
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: "nearest" }));
  };

  return (
    <section aria-labelledby="interop-evidence" className="sw-si-labs" id="labs">
      <h2 className="sw-showcase__section-title" id="interop-evidence">
        Evidence and labs
      </h2>
      <ul className="sw-si-labs__cards">
        {cards.map((card) => (
          <li key={card.id}>
            <button
              aria-controls="interop-lab-panel"
              aria-expanded={open === card.id}
              className="sw-si-lab-card"
              data-testid={`interop-lab-${card.id}`}
              onClick={() => toggle(card.id)}
              type="button"
            >
              <span className="sw-si-lab-card__icon">
                <Icon name={card.icon} />
              </span>
              <span className="sw-si-lab-card__title">{card.title}</span>
              <span className="sw-si-lab-card__summary">{card.summary}</span>
              <span className="sw-si-lab-card__figure">{card.figure}</span>
              <Icon className="sw-si-lab-card__chevron" name="chevron-down" size="sm" />
            </button>
          </li>
        ))}
      </ul>
      <div
        aria-label={openCard?.title}
        className="sw-si-lab-panel"
        hidden={openCard === undefined}
        id="interop-lab-panel"
        ref={panelRef}
        role="region"
      >
        {openCard && (
          <>
            <header className="sw-si-lab-panel__head">
              <span className="sw-si-lab-card__icon">
                <Icon name={openCard.icon} />
              </span>
              <h3>{openCard.title}</h3>
              <button
                aria-label={`Close ${openCard.title}`}
                className="sw-button"
                data-size="sm"
                data-variant="quiet"
                onClick={() => setOpen(null)}
                type="button"
              >
                <Icon name="close" size="sm" />
              </button>
            </header>
            <LabPanel id={openCard.id} workbench={workbench} />
          </>
        )}
      </div>
    </section>
  );
}
