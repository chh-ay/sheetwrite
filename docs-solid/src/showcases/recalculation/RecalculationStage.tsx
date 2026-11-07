import {
  FORMULA_COUNT,
  LOOKUPS,
  type MeasuredRun,
  median,
  PRICE_CHANGE_CELL,
  type RecalculationScenario,
  type RecalculationSnapshot,
  ROWS,
  type RunKind,
  SERIES_LENGTH,
} from "@docs/showcases/scenarios/recalculation.js";
import { formatNumber } from "@sheetwrite/core";
import { createEffect, For, Show } from "solid-js";

import { ActionError } from "../../lib/use-action.js";
import {
  ShowcaseControlGroup,
  ShowcaseReadout,
  ShowcaseStage,
  ShowcaseStatus,
} from "../layout/ShowcaseLayout.js";
import { createLiveScenario, createScenarioAction } from "../lib/live-scenario.js";
import { ControlActions, ControlButton, DemoGrid } from "../ui/feature-controls.js";
import { milliseconds, setFirstCalculationMs } from "./timing.js";

const RUN_LABEL: Readonly<Record<RunKind, string>> = {
  "fan-out": "Price change",
  lookups: "Lookups moved",
};

/** The latest run of one kind. */
const latest = (runs: readonly MeasuredRun[], kind: RunKind) =>
  runs.find((run) => run.kind === kind);

const money = (value: unknown) => (typeof value === "number" ? formatNumber(value, "$#,##0") : "…");

/** The recent runs as bars, scaled to the slowest one; before the first, the load progress. */
function RunBars(props: {
  readonly runs: readonly MeasuredRun[];
  readonly snapshot: RecalculationSnapshot | null;
}) {
  const slowest = () => Math.max(...props.runs.map((run) => run.recalcMs + run.paintMs));
  return (
    <Show
      fallback={
        <ShowcaseStatus tone="neutral">
          {props.snapshot?.firstCalculationMs == null
            ? `Calculating ${(props.snapshot?.loadedFormulas ?? 0).toLocaleString("en")} of ${FORMULA_COUNT.toLocaleString("en")} formulas…`
            : "No edits measured yet"}
        </ShowcaseStatus>
      }
      when={props.runs.length > 0}
    >
      <ol class="sw-feature-runs" data-testid="recalc-runs">
        <For each={props.runs}>
          {(run) => (
            <li>
              <span>{RUN_LABEL[run.kind]}</span>
              <span
                aria-hidden="true"
                class="sw-feature-runs__bar"
                style={{ width: `${((run.recalcMs + run.paintMs) / slowest()) * 100}%` }}
              >
                <span
                  style={{ width: `${(run.recalcMs / (run.recalcMs + run.paintMs)) * 100}%` }}
                />
              </span>
              <span>{milliseconds(run.recalcMs)}</span>
            </li>
          )}
        </For>
      </ol>
    </Show>
  );
}

/** The recalculation showcase's island: the 100,000-row model and its timed edits. */
export function RecalculationStage() {
  const live = createLiveScenario<RecalculationScenario, RecalculationSnapshot>(() =>
    import("./boot.js").then(({ createRecalculationScenario }) => createRecalculationScenario),
  );
  const action = createScenarioAction(live.scenario);
  createEffect(() => setFirstCalculationMs(live.snapshot()?.firstCalculationMs ?? null));
  const busy = () => action.disabled() || (live.snapshot()?.running ?? true);
  const runs = () => live.snapshot()?.runs ?? [];
  const fanOut = () =>
    runs()
      .filter((entry) => entry.kind === "fan-out")
      .map((entry) => entry.recalcMs);

  return (
    <ShowcaseStage
      controls={
        <>
          <ShowcaseControlGroup
            description={`Every revenue formula reads the price-change cell ${PRICE_CHANGE_CELL.replaceAll("$", "")}.`}
            title={`Edit under ${ROWS.toLocaleString("en")} formulas`}
          >
            <ControlActions>
              <ControlButton
                disabled={busy()}
                icon="bolt"
                onClick={() =>
                  void action.run("The price change", (current) => current.changePrices())
                }
                variant="primary"
              >
                Change the price
              </ControlButton>
              <ControlButton
                disabled={busy()}
                icon="play"
                onClick={() => void action.run("The series", (current) => current.runSeries())}
              >
                Run {SERIES_LENGTH} changes
              </ControlButton>
            </ControlActions>
            <ShowcaseReadout
              items={[
                {
                  label: "Last recalculation",
                  value: (
                    <span data-testid="recalc-fan-out">
                      {milliseconds(latest(runs(), "fan-out")?.recalcMs)}
                    </span>
                  ),
                },
                {
                  label: "Median of recent",
                  value: fanOut().length > 0 ? milliseconds(median(fanOut())) : "…",
                },
                { label: "Total revenue", value: money(live.snapshot()?.revenue) },
              ]}
            />
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description={`Each XLOOKUP searches ${ROWS.toLocaleString("en")} SKUs; they share one index per recalculation.`}
            title={`${LOOKUPS.toLocaleString("en")} lookups`}
          >
            <ControlActions>
              <ControlButton
                disabled={busy()}
                icon="search"
                onClick={() =>
                  void action.run("The lookup move", (current) => current.moveLookups())
                }
              >
                Move the lookups
              </ControlButton>
            </ControlActions>
            <ShowcaseReadout
              items={[
                {
                  label: "Last recalculation",
                  value: (
                    <span data-testid="recalc-lookups">
                      {milliseconds(latest(runs(), "lookups")?.recalcMs)}
                    </span>
                  ),
                },
                { label: "Looked-up prices", value: money(live.snapshot()?.lookupTotal) },
              ]}
            />
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="Engine time, then the frame after it."
            title="The last edit, in order"
          >
            <Show when={runs()[0]}>
              {(run) => (
                <ShowcaseReadout
                  items={[
                    { label: "1 · Edit applied", value: "0 ms" },
                    { label: "2 · Results readable", value: `+${milliseconds(run().recalcMs)}` },
                    {
                      label: "3 · Frame painted",
                      value: `+${milliseconds(run().recalcMs + run().paintMs)}`,
                    },
                  ]}
                />
              )}
            </Show>
            <RunBars runs={runs()} snapshot={live.snapshot()} />
            <ActionError error={action.error()} />
          </ShowcaseControlGroup>
        </>
      }
      demo={
        <>
          <DemoGrid
            host={live.host}
            label={`${ROWS.toLocaleString("en")}-row model`}
            testId="recalc-grid"
          />
          <ActionError error={live.error()} />
        </>
      }
      demoLabel="Live recalculation model"
    />
  );
}
