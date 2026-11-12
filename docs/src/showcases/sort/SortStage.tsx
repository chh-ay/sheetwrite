import type { SortId, SortScenario, SortSnapshot } from "@docs/showcases/scenarios/sort.js";
import type { CommitReason } from "@sheetwrite/core";
import { For, Show } from "solid-js";

import { ActionError } from "../../lib/use-action.js";
import {
  ShowcaseControlGroup,
  ShowcaseReadout,
  ShowcaseStage,
  ShowcaseStatus,
} from "../layout/ShowcaseLayout.js";
import { createLiveScenario, createScenarioAction } from "../lib/live-scenario.js";
import { ControlActions, ControlButton, DemoGrid } from "../ui/feature-controls.js";

/** One sort the panel offers, by its id in the scenario. */
export interface SortChoice {
  readonly id: SortId;
  readonly label: string;
}

/** Props of {@link SortStage}, from the scenario's data. */
export interface SortStageProps {
  readonly sorts: readonly SortChoice[];
  readonly orderCount: number;
}

/** How the side panel names the commit reasons a sort or an undo can produce. */
function reasonLabel(reason: CommitReason | null): string {
  if (reason === null) return "None yet";
  if (reason === "sort") return "Sort (cells moved)";
  if (reason === "structure") return "View sort";
  if (reason === "undo") return "Undo";
  return reason;
}

function FormulaReadout(props: { readonly snapshot: SortSnapshot; readonly orderCount: number }) {
  return (
    <>
      <Show
        fallback={
          <ShowcaseStatus tone="ok">
            {props.snapshot.movedRows} of {props.orderCount} orders on new rows
          </ShowcaseStatus>
        }
        when={props.snapshot.movedRows === 0}
      >
        <ShowcaseStatus tone="neutral">Cells in their original rows</ShowcaseStatus>
      </Show>
      <ShowcaseReadout
        items={[
          ...props.snapshot.watch.map((reading) => ({
            label: reading.label,
            value: <span data-testid={`sort-watch-${reading.label}`}>{reading.value}</span>,
          })),
          { label: "View sort", value: props.snapshot.viewSort ?? "None" },
          { label: "Last change", value: reasonLabel(props.snapshot.lastReason) },
        ]}
      />
    </>
  );
}

/** The sort showcase's island: the order list, its sorts and what the formulas read. */
export function SortStage(props: SortStageProps) {
  const live = createLiveScenario<SortScenario, SortSnapshot>(() =>
    import("./boot.js").then(({ createSortScenario }) => createSortScenario),
  );
  const action = createScenarioAction(live.scenario);
  const firstSort = () => props.sorts[0]?.id;

  return (
    <ShowcaseStage
      controls={
        <>
          <ShowcaseControlGroup
            description="The cells move to new rows. Formulas that read row 1 see the new first order."
            title="Sort the cells"
          >
            <ControlActions>
              <For each={props.sorts}>
                {(sort) => (
                  <ControlButton
                    disabled={action.disabled()}
                    icon="sort-desc"
                    onClick={() =>
                      void action.run("Sort", (current) => current.sortInPlace(sort.id))
                    }
                    variant={sort.id === firstSort() ? "primary" : "default"}
                  >
                    {sort.label}
                  </ControlButton>
                )}
              </For>
              <ControlButton
                disabled={action.disabled()}
                icon="sliders"
                onClick={() => void action.run("Custom Sort", (current) => current.openSortPanel())}
              >
                Custom Sort…
              </ControlButton>
            </ControlActions>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="The grid shows the rows in a new order. The cells keep their rows."
            title="Sort the view only"
          >
            <ControlActions>
              <For each={props.sorts}>
                {(sort) => (
                  <ControlButton
                    disabled={action.disabled()}
                    icon="eye"
                    onClick={() =>
                      void action.run("View sort", (current) => current.sortView(sort.id))
                    }
                  >
                    {sort.label}
                  </ControlButton>
                )}
              </For>
              <ControlButton
                disabled={action.disabled() || live.snapshot()?.viewSort === null}
                icon="eye-off"
                onClick={() =>
                  void action.run("Clear view sort", (current) => current.clearViewSort())
                }
              >
                Clear view sort
              </ControlButton>
            </ControlActions>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="The Watch sheet reads the orders by position."
            title="What the formulas read"
          >
            <Show
              fallback={<ShowcaseStatus tone="neutral">Loading the orders…</ShowcaseStatus>}
              when={live.snapshot()}
            >
              {(snapshot) => <FormulaReadout orderCount={props.orderCount} snapshot={snapshot()} />}
            </Show>
            <ControlActions>
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
        </>
      }
      demo={
        <>
          <DemoGrid host={live.host} label="Orders workbook" testId="sort-grid" />
          <ActionError error={live.error()} />
        </>
      }
      demoLabel="Live order list"
    />
  );
}
