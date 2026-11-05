import type { CommitReason } from "@sheetwrite/core";

import { ActionError } from "../lib/use-action.js";
import { ControlActions, ControlButton, DemoGrid } from "./feature-controls.js";
import {
  ShowcaseControlGroup,
  ShowcaseLayout,
  ShowcaseReadout,
  ShowcaseSection,
  ShowcaseStatus,
} from "./layout/ShowcaseLayout.js";
import {
  createSortScenario,
  FORMULA_COUNT,
  ORDER_COUNT,
  SORTS,
  type SortId,
  type SortScenario,
  type SortSnapshot,
} from "./scenarios/sort.js";
import SortSnippet from "./snippets/sort.mdx";
import { useLiveScenario, useScenarioAction } from "./use-live-scenario.js";

import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";

const SORT_IDS = Object.keys(SORTS) as SortId[];

/** How the side panel names the commit reasons a sort or an undo can produce. */
function reasonLabel(reason: CommitReason | null): string {
  if (reason === null) return "None yet";
  if (reason === "sort") return "Sort (cells moved)";
  if (reason === "structure") return "View sort";
  if (reason === "undo") return "Undo";
  return reason;
}

function CellsStatus({ snapshot }: { readonly snapshot: SortSnapshot }) {
  if (snapshot.movedRows === 0) {
    return <ShowcaseStatus tone="neutral">Cells in their original rows</ShowcaseStatus>;
  }
  return (
    <ShowcaseStatus tone="ok">
      {snapshot.movedRows} of {ORDER_COUNT} orders on new rows
    </ShowcaseStatus>
  );
}

function FormulaReadout({ snapshot }: { readonly snapshot: SortSnapshot | null }) {
  if (!snapshot) return <ShowcaseStatus tone="neutral">Loading the orders…</ShowcaseStatus>;
  return (
    <>
      <CellsStatus snapshot={snapshot} />
      <ShowcaseReadout
        items={[
          ...snapshot.watch.map((reading) => ({
            label: reading.label,
            value: <span data-testid={`sort-watch-${reading.label}`}>{reading.value}</span>,
          })),
          { label: "View sort", value: snapshot.viewSort ?? "None" },
          { label: "Last change", value: reasonLabel(snapshot.lastReason) },
        ]}
      />
    </>
  );
}

function SortControls({
  scenario,
  snapshot,
}: {
  readonly scenario: SortScenario | null;
  readonly snapshot: SortSnapshot | null;
}) {
  const { run, disabled, error } = useScenarioAction(scenario);

  return (
    <>
      <ShowcaseControlGroup
        title="Sort the cells"
        description="The cells move to new rows. Formulas that read row 1 see the new first order."
      >
        <ControlActions>
          {SORT_IDS.map((id) => (
            <ControlButton
              disabled={disabled}
              icon="sort-desc"
              key={id}
              onClick={() => void run("Sort", (current) => current.sortInPlace(id))}
              variant={id === SORT_IDS[0] ? "primary" : "default"}
            >
              {SORTS[id].label}
            </ControlButton>
          ))}
          <ControlButton
            disabled={disabled}
            icon="sliders"
            onClick={() => void run("Custom Sort", (current) => current.openSortPanel())}
          >
            Custom Sort…
          </ControlButton>
        </ControlActions>
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        title="Sort the view only"
        description="The grid shows the rows in a new order. The cells keep their rows."
      >
        <ControlActions>
          {SORT_IDS.map((id) => (
            <ControlButton
              disabled={disabled}
              icon="eye"
              key={id}
              onClick={() => void run("View sort", (current) => current.sortView(id))}
            >
              {SORTS[id].label}
            </ControlButton>
          ))}
          <ControlButton
            disabled={disabled || snapshot?.viewSort === null}
            icon="eye-off"
            onClick={() => void run("Clear view sort", (current) => current.clearViewSort())}
            variant="quiet"
          >
            Clear view sort
          </ControlButton>
        </ControlActions>
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        title="What the formulas read"
        description="The Watch sheet reads the orders by position."
      >
        <FormulaReadout snapshot={snapshot} />
        <ControlActions>
          <ControlButton
            disabled={disabled}
            icon="undo"
            onClick={() => void run("Undo", (current) => current.undo())}
            variant="quiet"
          >
            Undo
          </ControlButton>
        </ControlActions>
        <ActionError error={error} />
      </ShowcaseControlGroup>
    </>
  );
}

export default function SortShowcase() {
  const { hostRef, scenario, snapshot, error } = useLiveScenario(createSortScenario);

  return (
    <ShowcaseLayout
      code={{ title: "The code behind it", Snippet: SortSnippet }}
      controls={<SortControls scenario={scenario} snapshot={snapshot} />}
      demo={
        <>
          <DemoGrid hostRef={hostRef} label="Orders workbook" testId="sort-grid" />
          <ActionError error={error} />
        </>
      }
      demoLabel="Live order list"
      eyebrow="Data"
      facts={[
        { label: "Orders", value: ORDER_COUNT.toLocaleString("en") },
        { label: "Formulas", value: FORMULA_COUNT.toLocaleString("en") },
        { label: "Engine", value: "@sheetwrite/formulas" },
      ]}
      guide={{
        href: "/docs/features/data/data-operations/#sort-cells-in-place",
        label: "Read the sort guide",
      }}
      id="sort"
      task={
        <>
          Sort {ORDER_COUNT} orders in place, as Excel does, or for the view only. Then check what
          the formulas on the Watch sheet read.
        </>
      }
      title="Sort the cells, or just the view"
    >
      <ShowcaseSection id="sort-rules" title="How the sort treats the workbook">
        <ul>
          <li>
            Values, formulas, styles and notes move with their row. A formula that reads its own
            row, like <code>=D1*E1</code>, keeps reading it.
          </li>
          <li>Formulas outside the range keep their references, so they read the new order.</li>
          <li>
            Text sorts without case in Excel's order, and blank cells are last in both directions.
          </li>
          <li>
            Collaborators receive an in-place sort as one transaction. A view sort is saved with the
            sheet and exports to Excel as its sort state.
          </li>
        </ul>
      </ShowcaseSection>
    </ShowcaseLayout>
  );
}
