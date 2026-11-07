import {
  type DashboardScenario,
  type DashboardSnapshot,
  REGIONS,
} from "@docs/showcases/scenarios/dashboards.js";
import { createEffect } from "solid-js";

import { ActionError } from "../../lib/use-action.js";
import { ShowcaseControlGroup, ShowcaseReadout, ShowcaseStage } from "../layout/ShowcaseLayout.js";
import { createLiveScenario, createScenarioAction } from "../lib/live-scenario.js";
import { ControlActions, ControlButton, DemoGrid } from "../ui/feature-controls.js";
import { setItemCount } from "./item-count.js";

/** Sheet rows that hold the nine dashboard rows the starting items fill. */
const GRID_ROWS = 18;

/** The dashboards showcase's island: the dashboard sheet, its slicer and its saved layout. */
export function DashboardsStage() {
  const live = createLiveScenario<DashboardScenario, DashboardSnapshot>(() =>
    import("./boot.js").then(({ createDashboardScenario }) => createDashboardScenario),
  );
  const action = createScenarioAction(live.scenario);
  createEffect(() => setItemCount(live.snapshot()?.items.length ?? 0));

  return (
    <ShowcaseStage
      controls={
        <>
          <ShowcaseControlGroup
            description="The slicers filter the KPI cards, the chart and the pivot together."
            title="Filter with a slicer"
          >
            <ControlActions>
              <ControlButton
                disabled={action.disabled()}
                icon="filter"
                onClick={() =>
                  void action.run("The slicer", (current) => current.keepFirstRegion())
                }
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
                      {live.snapshot()?.regionSelection ?? "Every region"}
                    </span>
                  ),
                },
              ]}
            />
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="Drag a header to move an item and its corner to resize it, or use the item's actions menu and the arrow keys."
            title="Arrange the items"
          >
            <ControlActions>
              <ControlButton
                disabled={action.disabled() || (live.snapshot()?.hasProductPivot ?? true)}
                icon="plus"
                onClick={() =>
                  void action.run("The new pivot", (current) => current.addProductPivot())
                }
              >
                Add a product pivot
              </ControlButton>
              <ControlButton
                disabled={action.disabled()}
                icon="layers"
                onClick={() =>
                  void action.run("The swap", (current) => current.swapChartAndPivot())
                }
              >
                Swap the chart and the pivot
              </ControlButton>
              <ControlButton
                disabled={action.disabled()}
                icon="undo"
                onClick={() => void action.run("Undo", (current) => current.undo())}
              >
                Undo
              </ControlButton>
            </ControlActions>
            <ActionError error={action.error()} />
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="Each item's place on the twelve-column grid, as the workbook saves it."
            title="Saved layout"
          >
            <ShowcaseReadout
              items={(live.snapshot()?.items ?? []).map((item) => ({
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
      }
      demo={
        <>
          <DemoGrid
            host={live.host}
            label="Sales dashboard workbook"
            rows={GRID_ROWS}
            testId="dashboard-grid"
          />
          <ActionError error={live.error()} />
        </>
      }
      demoLabel="Live dashboard"
    />
  );
}
