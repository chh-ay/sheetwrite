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
  REGIONS,
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
        title="Filter with a slicer"
        description="The slicers filter the KPI cards, the chart and the pivot together."
      >
        <ControlActions>
          <ControlButton
            disabled={disabled}
            icon="filter"
            onClick={() => void run("The slicer", (current) => current.keepFirstRegion())}
            variant="primary"
          >
            Keep {REGIONS[0]} in the Region slicer
          </ControlButton>
        </ControlActions>
        <ShowcaseReadout
          items={[
            {
              label: "Region slicer keeps",
              value: (
                <span data-testid="dashboard-region-selection">
                  {snapshot?.regionSelection ?? "Every region"}
                </span>
              ),
            },
          ]}
        />
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        title="Arrange the items"
        description="Drag a header to move an item and its corner to resize it, or use the item's actions menu and the arrow keys."
      >
        <ControlActions>
          <ControlButton
            disabled={disabled || (snapshot?.hasProductPivot ?? true)}
            icon="plus"
            onClick={() => void run("The new pivot", (current) => current.addProductPivot())}
          >
            Add a product pivot
          </ControlButton>
          <ControlButton
            disabled={disabled}
            icon="layers"
            onClick={() => void run("The swap", (current) => current.swapChartAndPivot())}
          >
            Swap the chart and the pivot
          </ControlButton>
          <ControlButton
            disabled={disabled}
            icon="undo"
            onClick={() => void run("Undo", (current) => current.undo())}
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
          {/* Eighteen sheet rows hold the nine dashboard rows the starting items fill. */}
          <DemoGrid
            hostRef={hostRef}
            label="Sales dashboard workbook"
            rows={18}
            testId="dashboard-grid"
          />
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
          Filter a dashboard of KPI cards, a PivotChart and a pivot with its slicers, then move,
          resize and add items. Undo takes back each change.
        </>
      }
      title="A dashboard that filters together"
    >
      <ShowcaseSection id="dashboards-rules" title="How a dashboard works">
        <ul>
          <li>
            A dashboard is a sheet with <code>kind: "dashboard"</code>. Its pivots compute from the
            Orders table without writing output cells.
          </li>
          <li>
            A slicer filters every pivot, PivotChart and KPI card whose table reaches its column, as
            an Excel slicer filters its connected PivotTables. Its selection is saved and undone.
          </li>
          <li>
            A KPI card shows a data model measure in the slicers' filter context. Items never
            overlap: a move or resize into another item's place is refused, and the view says so.
          </li>
        </ul>
      </ShowcaseSection>
    </ShowcaseLayout>
  );
}
