import { createSignal, For, type JSX, onMount } from "solid-js";

import { Icon, type IconName } from "../../../components/Icon.js";
import { ADVERSARIAL_FIXTURES, POSITIVE_FIXTURES } from "../../scenarios/interop-fixtures.js";
import {
  abortReport,
  attacksRunAt,
  cellCapReport,
  csvCapReport,
  csvPreview,
  digests,
  probe,
  rejections,
  warningLog,
} from "../state.js";
import { DelimitedLab } from "./DelimitedLab.js";
import { OperationEvidence } from "./OperationEvidence.js";
import { RuntimeBoundary } from "./RuntimeBoundary.js";
import { SecurityLab } from "./SecurityLab.js";
import { SourceLibrary } from "./SourceLibrary.js";
import { APPLICABLE, nf, TEST_SET } from "./vault-data.js";
import { VaultLab } from "./VaultLab.js";

/** The limits the security lab runs beside its hostile files. */
const LIMIT_RUNS = 3;

interface Lab {
  readonly id: string;
  readonly icon: IconName;
  readonly name: string;
  readonly question: string;
  /** The tile's one-line figure, from live or checked data. */
  readonly figure: () => string;
  readonly body: () => JSX.Element;
}

const LABS: readonly Lab[] = [
  {
    id: "vault",
    icon: "compare",
    name: "Evidence vault",
    question: "How compatible is it?",
    figure: () => `${nf(TEST_SET.localPassed)} of ${nf(APPLICABLE)} checks pass`,
    body: () => <VaultLab />,
  },
  {
    id: "fixtures",
    icon: "file",
    name: "Source library",
    question: "Does it open files other apps saved?",
    figure: () => {
      const verified = POSITIVE_FIXTURES.filter(
        (fixture) => digests[fixture.id]?.state === "verified",
      ).length;
      return `${nf(POSITIVE_FIXTURES.length)} files · ${nf(verified)} hashes match`;
    },
    body: () => <SourceLibrary />,
  },
  {
    id: "warnings",
    icon: "warning",
    name: "Operation evidence",
    question: "What gets lost on import or export?",
    figure: () => {
      const log = warningLog();
      return log === null
        ? "Every loss listed by cell"
        : `${nf(log.warnings.length)} lost · ${log.operation}`;
    },
    body: () => <OperationEvidence />,
  },
  {
    id: "delimited",
    icon: "table",
    name: "CSV and TSV",
    question: "Is CSV export safe to open?",
    figure: () => {
      const text = csvPreview();
      return text === null
        ? "Not exported yet"
        : `${nf(text.split(/\r?\n/u).filter((line) => line !== "").length)} CSV lines exported`;
    },
    body: () => <DelimitedLab />,
  },
  {
    id: "security",
    icon: "shield",
    name: "Security lab",
    question: "What attacks does import resist?",
    figure: () => {
      if (attacksRunAt() === null) {
        return `${nf(ADVERSARIAL_FIXTURES.length)} attack files, ${nf(LIMIT_RUNS)} limits`;
      }
      const reports = [
        ...ADVERSARIAL_FIXTURES.map((fixture) => rejections[fixture.id]),
        abortReport(),
        cellCapReport(),
        csvCapReport(),
      ];
      const stopped = reports.filter((report) => report?.rejected === true).length;
      return `${nf(stopped)} / ${nf(reports.length)} stopped`;
    },
    body: () => <SecurityLab />,
  },
  {
    id: "runtime",
    icon: "layers",
    name: "Runtime boundary",
    question: "Does XLSX support add bundle size?",
    figure: () => {
      const current = probe();
      return current === null || current.registered
        ? "Loaded on first use"
        : "Core alone: a typed error";
    },
    body: () => <RuntimeBoundary />,
  },
];

/**
 * The Evidence and labs section: six question tiles as tabs, one lab open
 * below them. `?compatibility=<record id>` opens the vault, which shows the
 * record.
 */
export function InteropLabs() {
  const [selected, setSelected] = createSignal("vault");
  const tabs: HTMLButtonElement[] = [];

  onMount(() => {
    if (new URLSearchParams(window.location.search).has("compatibility")) setSelected("vault");
  });

  const focusTab = (index: number) => {
    const count = LABS.length;
    const next = LABS[(index + count) % count];
    if (!next) return;
    setSelected(next.id);
    tabs[(index + count) % count]?.focus();
  };

  return (
    <section aria-labelledby="interop-labs-title" class="sw-labs" data-testid="interop-labs">
      <h2 class="sw-showcase__section-title" id="interop-labs-title">
        Evidence and labs
      </h2>
      <div aria-label="Labs" class="sw-labs__tiles" role="tablist">
        <For each={LABS}>
          {(lab, index) => (
            <button
              aria-controls={`interop-lab-${lab.id}-panel`}
              aria-selected={selected() === lab.id}
              class="sw-labs__tile"
              data-testid={`interop-lab-${lab.id}`}
              id={`interop-lab-${lab.id}`}
              onClick={() => setSelected(lab.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  focusTab(index() + 1);
                } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                  event.preventDefault();
                  focusTab(index() - 1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  focusTab(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  focusTab(LABS.length - 1);
                }
              }}
              ref={(element) => {
                tabs[index()] = element;
              }}
              role="tab"
              tabindex={selected() === lab.id ? 0 : -1}
              type="button"
            >
              <span class="sw-labs__tile-head">
                <Icon name={lab.icon} />
                {lab.name}
              </span>
              <span class="sw-labs__tile-question">{lab.question}</span>
              <span class="sw-labs__tile-figure">{lab.figure()}</span>
            </button>
          )}
        </For>
      </div>
      <For each={LABS}>
        {(lab) => (
          <div
            aria-labelledby={`interop-lab-${lab.id}`}
            class="sw-labs__panel"
            hidden={selected() !== lab.id}
            id={`interop-lab-${lab.id}-panel`}
            role="tabpanel"
            tabindex="0"
          >
            {lab.body()}
          </div>
        )}
      </For>
    </section>
  );
}
