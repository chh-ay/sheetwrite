import { For, Show } from "solid-js";

import { Icon, type IconName } from "../../../components/Icon.js";
import { probe } from "../state.js";
import { LabAnswer, LabFigure } from "./LabParts.js";

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

/** The Runtime boundary: core ships no XLSX codec; the add-on loads on first use. */
export function RuntimeBoundary() {
  const state = () => {
    const current = probe();
    return current === null ? "pending" : current.registered ? "registered" : "isolated";
  };
  return (
    <div class="sw-lab-body">
      <LabAnswer
        answer={
          <>
            Not until you use it. The core package has no XLSX reader or writer; you add the XLSX
            add-on, and this page loads it the first time you open or save a file.
          </>
        }
        figure={
          <LabFigure
            label={
              state() === "isolated"
                ? "core refused XLSX before the add-on"
                : state() === "registered"
                  ? "the add-on was already installed"
                  : "probing core on its own"
            }
            value={
              state() === "isolated" ? "Typed error" : state() === "registered" ? "Installed" : "…"
            }
          />
        }
        headingId="runtime-question"
        icon="layers"
        name="Runtime boundary"
        question="Does XLSX support make my bundle bigger?"
        term={
          <>
            Before the add-on is registered, an XLSX call fails with the typed error{" "}
            <code>optional-backend-unavailable</code> instead of a missing-module crash.
          </>
        }
      />
      <div class="sw-runtime-probe" data-state={state()} data-testid="interop-isolation">
        <h4 class="sw-lab-subhead">What core said before the add-on was installed</h4>
        <Show fallback={<p class="sw-lab-empty">Probing…</p>} when={probe()}>
          {(current) => (
            <Show
              fallback={
                <div data-testid="interop-isolation-error">
                  <pre class="sw-runtime-error">
                    <code>{current().error}</code>
                  </pre>
                </div>
              }
              when={current().registered}
            >
              <p data-testid="interop-isolation-registered">
                The add-on was already installed when this page probed, which happens after another
                page in this session loaded it. Open this page in a new tab to see the typed error.
              </p>
            </Show>
          )}
        </Show>
      </div>
      <ol aria-label="How the XLSX add-on reaches the page" class="sw-runtime-handoff">
        <For each={HANDOFF}>
          {(step) => (
            <li>
              <span class="sw-runtime-handoff__icon">
                <Icon name={step.icon} />
              </span>
              <strong>{step.title}</strong>
              <code>{step.code}</code>
              <span>{step.note}</span>
            </li>
          )}
        </For>
      </ol>
    </div>
  );
}
