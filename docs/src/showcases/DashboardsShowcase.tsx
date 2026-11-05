import { ActionError } from "../lib/use-action.js";
import { ControlActions, ControlButton, DemoGrid } from "./feature-controls.js";
import {
  ShowcaseControlGroup,
  ShowcaseLayout,
  ShowcaseReadout,
  ShowcaseSection,
} from "./layout/ShowcaseLayout.js";
import {
  createDashboardScenario,
  ORDER_ROWS,
  type DashboardScenario,
  type DashboardSnapshot,
} from "./scenarios/dashboards.js";
import DashboardsSnippet from "./snippets/dashboards.mdx";
import { useLiveScenario, useScenarioAction } from "./use-live-scenario.js";

import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";

function DashboardControls({
  scenario,
  snapshot,
}: {
  readonly scenario: DashboardScenario | null;
  readonly snapshot: DashboardSnapshot | null;
}) {
  const { run, disabled, error } = useScenarioAction(scenario);

  return (
    <>
      <ShowcaseControlGroup
        title="Arrange the items"
        description="Drag a header to move an item and its corner to resize it, or use the item's actions menu and the arrow keys."
      >
        <ControlActions>
          <ControlButton
            disabled={disabled || (snapshot?.hasProductPivot ?? true)}
            icon="plus"
            onClick={() => void run("The new pivot", (current) => current.addProductPivot())}
            variant="primary"
          >
            Add a product pivot
          </ControlButton>
          <ControlButton
            disabled={disabled}
            icon="layers"
            onClick={() => void run("The swap", (current) => current.swapPivots())}
          >
            Swap the two pivots
          </ControlButton>
          <ControlButton
            disabled={disabled}
            icon="filter"
            onClick={() => void run("The slicer", (current) => current.keepFirstRegion())}
          >
            Keep one region in the slicer
          </ControlButton>
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
      <ShowcaseControlGroup
        title="Saved layout"
        description="Each item's place on the twelve-column grid, as the workbook saves it."
      >
        <ShowcaseReadout
          items={(snapshot?.items ?? []).map((item) => ({
            label: item.label,
            value: (
              <span data-testid={`dashboard-item-${item.id}`}>
                {item.selected === null ? item.place : `${item.place} · ${item.selected}`}
              </span>
            ),
          }))}
        />
      </ShowcaseControlGroup>
    </>
  );
}

export default function DashboardsShowcase() {
  const { hostRef, scenario, snapshot, error } = useLiveScenario(createDashboardScenario);

  return (
    <ShowcaseLayout
      code={{ title: "The code behind it", Snippet: DashboardsSnippet }}
      controls={<DashboardControls scenario={scenario} snapshot={snapshot} />}
      demo={
        <>
          <DemoGrid hostRef={hostRef} label="Sales dashboard workbook" testId="dashboard-grid" />
          <ActionError error={error} />
        </>
      }
      demoLabel="Live dashboard"
      eyebrow="Analysis"
      facts={[
        { label: "Orders", value: ORDER_ROWS.toLocaleString("en") },
        { label: "Items", value: (snapshot?.items.length ?? 0).toLocaleString("en") },
        { label: "Layout", value: "Twelve-column grid" },
      ]}
      guide={{ href: "/docs/features/analysis/dashboards/", label: "Read the dashboards guide" }}
      id="dashboards"
      task={
        <>
          Arrange pivots and slicers on a dashboard sheet: move and resize them, add a pivot, and
          pick slicer values. Undo takes back each change.
        </>
      }
      title="A dashboard of pivots and slicers"
    >
      <ShowcaseSection id="dashboards-rules" title="How a dashboard is kept">
        <ul>
          <li>
            A dashboard is a sheet with <code>kind: "dashboard"</code>. Its pivots compute from the
            Orders table without writing output cells.
          </li>
          <li>
            Items never overlap: a move or resize into another item's place is refused, and the view
            says so.
          </li>
          <li>
            A slicer saves the values it keeps, as Excel saves slicer state. It does not filter the
            pivots yet.
          </li>
        </ul>
      </ShowcaseSection>
    </ShowcaseLayout>
  );
}
