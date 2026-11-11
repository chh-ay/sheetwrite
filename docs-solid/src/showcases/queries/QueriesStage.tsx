import type {
  QueriesScenario,
  QueriesSnapshot,
  StatusFilter,
} from "@docs/showcases/scenarios/queries.js";
import { Match, Switch } from "solid-js";

import { ActionError } from "../../lib/use-action.js";
import {
  ShowcaseControlGroup,
  ShowcaseReadout,
  ShowcaseStage,
  ShowcaseStatus,
} from "../layout/ShowcaseLayout.js";
import { createLiveScenario, createScenarioAction } from "../lib/live-scenario.js";
import { ControlActions, ControlButton, DemoGrid } from "../ui/feature-controls.js";
import { RadioGroup } from "../ui/RadioGroup.js";

const STATUS_CHOICES: readonly { value: StatusFilter; label: string }[] = [
  { value: "shipped", label: "Shipped only" },
  { value: "all", label: "All statuses" },
];

function RefreshStatus(props: { readonly snapshot: QueriesSnapshot | null }) {
  return (
    <Switch fallback={<ShowcaseStatus tone="neutral">Not refreshed yet</ShowcaseStatus>}>
      <Match when={!props.snapshot || props.snapshot.refreshing}>
        <ShowcaseStatus tone="neutral">Refreshing…</ShowcaseStatus>
      </Match>
      <Match when={props.snapshot?.definitionChanged}>
        <ShowcaseStatus tone="warn">Query changed: Refresh All to apply it</ShowcaseStatus>
      </Match>
      <Match when={props.snapshot?.lastRefresh?.status === "applied"}>
        <ShowcaseStatus tone="ok">Tables match the sources</ShowcaseStatus>
      </Match>
    </Switch>
  );
}

/** The queries showcase's island: the report workbook, its saved queries and refresh. */
/** Props of {@link QueriesStage}. The route passes the scenario's data, so the island imports no scenario code before its grid loads. */
export interface QueriesStageProps {
  /** Orders each "new orders" press adds to the feed. */
  readonly batchRows: number;
  readonly rowsUsed: number;
}

export function QueriesStage(props: QueriesStageProps) {
  const live = createLiveScenario<QueriesScenario, QueriesSnapshot>(() =>
    import("./boot.js").then(({ createQueriesScenario }) => createQueriesScenario),
  );
  const action = createScenarioAction(live.scenario);
  const busy = () => action.disabled() || (live.snapshot()?.refreshing ?? true);
  const last = () => live.snapshot()?.lastRefresh;

  return (
    <ShowcaseStage
      controls={
        <>
          <ShowcaseControlGroup
            description="Refresh All loads both sources through the host callback and writes both tables in one undo step."
            title="Refresh"
          >
            <RefreshStatus snapshot={live.snapshot()} />
            <ControlActions>
              <ControlButton
                disabled={busy()}
                icon="refresh"
                onClick={() => void action.run("Refresh All", (current) => current.refreshAll())}
                variant="primary"
              >
                Refresh All
              </ControlButton>
              <ControlButton
                disabled={busy()}
                icon="plus"
                onClick={() => void action.run("New orders", (current) => current.addOrders())}
              >
                {props.batchRows.toLocaleString("en")} new orders arrive
              </ControlButton>
            </ControlActions>
            <ShowcaseReadout
              items={[
                {
                  label: "Orders in the feed",
                  value: live.snapshot()?.feedRows.toLocaleString("en") ?? "…",
                },
                {
                  label: "Source loads",
                  value: <span data-testid="queries-fetches">{live.snapshot()?.fetches ?? 0}</span>,
                },
                {
                  label: "Last refresh",
                  value: last()
                    ? `${last()?.status}, ${Math.round(last()?.milliseconds ?? 0)} ms`
                    : "None yet",
                },
              ]}
            />
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="The Region totals query filters, merges the region list, then groups."
            title="Change a step"
          >
            <RadioGroup
              label="Orders the Region totals query keeps"
              onChange={(value) =>
                void action.run("The query change", (current) => current.setStatuses(value))
              }
              options={STATUS_CHOICES}
              value={live.snapshot()?.statuses ?? "shipped"}
            />
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="They read the output tables by name, like any workbook table."
            title="Formulas on the Report sheet"
          >
            <ShowcaseReadout
              items={(live.snapshot()?.formulas ?? []).map((formula) => ({
                label: formula.label,
                value: (
                  <span data-testid={`queries-formula-${formula.label}`}>{formula.value}</span>
                ),
              }))}
            />
            <ControlActions>
              <ControlButton
                disabled={busy()}
                icon="layers"
                onClick={() =>
                  void action.run("Queries & Connections", (current) => current.openQueriesPanel())
                }
              >
                Queries & Connections…
              </ControlButton>
              <ControlButton
                disabled={busy()}
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
          <DemoGrid
            host={live.host}
            label="Report workbook"
            rows={props.rowsUsed}
            testId="queries-grid"
          />
          <ActionError error={live.error()} />
        </>
      }
      demoLabel="Live query workbook"
    />
  );
}
