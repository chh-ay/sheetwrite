import { formatNumber } from "@sheetwrite/core";

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
  createRecalculationScenario,
  FORMULA_COUNT,
  LOOKUPS,
  median,
  PRICE_CHANGE_CELL,
  ROWS,
  SERIES_LENGTH,
  type MeasuredRun,
  type RecalculationScenario,
  type RecalculationSnapshot,
  type RunKind,
} from "./scenarios/recalculation.js";
import RecalculationSnippet from "./snippets/recalculation.mdx";
import { useLiveScenario, useScenarioAction } from "./use-live-scenario.js";

import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";

const milliseconds = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "…"
    : `${value < 10 ? value.toFixed(1) : Math.round(value)} ms`;

const RUN_LABEL: Readonly<Record<RunKind, string>> = {
  "fan-out": "Price change",
  lookups: "Lookups moved",
};

/** The latest run of one kind. */
const latest = (runs: readonly MeasuredRun[], kind: RunKind) =>
  runs.find((run) => run.kind === kind);

/** The recent runs as bars, scaled to the slowest one; before the first, the load progress. */
function RunBars({
  runs,
  snapshot,
}: {
  readonly runs: readonly MeasuredRun[];
  readonly snapshot: RecalculationSnapshot | null;
}) {
  if (runs.length === 0)
    return (
      <ShowcaseStatus tone="neutral">
        {snapshot?.firstCalculationMs == null
          ? `Calculating ${(snapshot?.loadedFormulas ?? 0).toLocaleString("en")} of ${FORMULA_COUNT.toLocaleString("en")} formulas…`
          : "No edits measured yet"}
      </ShowcaseStatus>
    );
  const slowest = Math.max(...runs.map((run) => run.recalcMs + run.paintMs));
  return (
    <ol className="sw-feature-runs" data-testid="recalc-runs">
      {runs.map((run) => (
        <li key={run.id}>
          <span>{RUN_LABEL[run.kind]}</span>
          <span
            aria-hidden="true"
            className="sw-feature-runs__bar"
            style={{ width: `${((run.recalcMs + run.paintMs) / slowest) * 100}%` }}
          >
            <span style={{ width: `${(run.recalcMs / (run.recalcMs + run.paintMs)) * 100}%` }} />
          </span>
          <span>{milliseconds(run.recalcMs)}</span>
        </li>
      ))}
    </ol>
  );
}

/** The order in which the latest edit was applied, recalculated and painted. */
function EventOrder({ run }: { readonly run: MeasuredRun | undefined }) {
  if (!run) return null;
  return (
    <ShowcaseReadout
      items={[
        { label: "1 · Edit applied", value: "0 ms" },
        { label: "2 · Results readable", value: `+${milliseconds(run.recalcMs)}` },
        { label: "3 · Frame painted", value: `+${milliseconds(run.recalcMs + run.paintMs)}` },
      ]}
    />
  );
}

function RecalculationControls({
  scenario,
  snapshot,
}: {
  readonly scenario: RecalculationScenario | null;
  readonly snapshot: RecalculationSnapshot | null;
}) {
  const { run, disabled, error } = useScenarioAction(scenario);
  const busy = disabled || (snapshot?.running ?? true);
  const runs = snapshot?.runs ?? [];
  const fanOut = runs.filter((entry) => entry.kind === "fan-out").map((entry) => entry.recalcMs);

  return (
    <>
      <ShowcaseControlGroup
        title={`Edit under ${ROWS.toLocaleString("en")} formulas`}
        description={`Every revenue formula reads the price-change cell ${PRICE_CHANGE_CELL.replaceAll("$", "")}.`}
      >
        <ControlActions>
          <ControlButton
            disabled={busy}
            icon="bolt"
            onClick={() => void run("The price change", (current) => current.changePrices())}
            variant="primary"
          >
            Change the price
          </ControlButton>
          <ControlButton
            disabled={busy}
            icon="play"
            onClick={() => void run("The series", (current) => current.runSeries())}
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
                  {milliseconds(latest(runs, "fan-out")?.recalcMs)}
                </span>
              ),
            },
            {
              label: "Median of recent",
              value: fanOut.length > 0 ? milliseconds(median(fanOut)) : "…",
            },
            {
              label: "Total revenue",
              value:
                typeof snapshot?.revenue === "number"
                  ? formatNumber(snapshot.revenue, "$#,##0")
                  : "…",
            },
          ]}
        />
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        title={`${LOOKUPS.toLocaleString("en")} lookups`}
        description={`Each XLOOKUP searches ${ROWS.toLocaleString("en")} SKUs; they share one index per recalculation.`}
      >
        <ControlActions>
          <ControlButton
            disabled={busy}
            icon="search"
            onClick={() => void run("The lookup move", (current) => current.moveLookups())}
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
                  {milliseconds(latest(runs, "lookups")?.recalcMs)}
                </span>
              ),
            },
            {
              label: "Looked-up prices",
              value:
                typeof snapshot?.lookupTotal === "number"
                  ? formatNumber(snapshot.lookupTotal, "$#,##0")
                  : "…",
            },
          ]}
        />
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        title="The last edit, in order"
        description="Engine time, then the frame after it."
      >
        <EventOrder run={runs[0]} />
        <RunBars runs={runs} snapshot={snapshot} />
        <ActionError error={error} />
      </ShowcaseControlGroup>
    </>
  );
}

export default function RecalculationShowcase() {
  const { hostRef, scenario, snapshot, error } = useLiveScenario(createRecalculationScenario);

  return (
    <ShowcaseLayout
      code={{ title: "The code behind it", Snippet: RecalculationSnippet }}
      controls={<RecalculationControls scenario={scenario} snapshot={snapshot} />}
      demo={
        <>
          <DemoGrid
            hostRef={hostRef}
            label={`${ROWS.toLocaleString("en")}-row model`}
            testId="recalc-grid"
          />
          <ActionError error={error} />
        </>
      }
      demoLabel="Live recalculation model"
      eyebrow="Performance"
      facts={[
        { label: "Rows", value: ROWS.toLocaleString("en") },
        { label: "Formulas", value: FORMULA_COUNT.toLocaleString("en") },
        { label: "Load and first calculation", value: milliseconds(snapshot?.firstCalculationMs) },
      ]}
      guide={{ href: "/docs/concepts/calculation-engine/", label: "How the engine recalculates" }}
      id="recalculation"
      task={
        <>
          Change one cell that {ROWS.toLocaleString("en")} formulas read, or move{" "}
          {LOOKUPS.toLocaleString("en")} lookups. The page times each recalculation and paint in
          your browser.
        </>
      }
      title={`Recalculate ${ROWS.toLocaleString("en")} formulas, live`}
    >
      <ShowcaseSection id="recalculation-notes" title="What the timings include">
        <ul>
          <li>
            Last recalculation runs from the edit call until a dependent total is readable: the
            engine marks the formulas that read the cell and calculates each once.
          </li>
          <li>
            Frame painted adds the next frame the browser draws. Your device, browser and other tabs
            change every number on this page.
          </li>
          <li>
            The release benchmarks measure the same work on fixed machines; see the performance
            pages for their results.
          </li>
        </ul>
      </ShowcaseSection>
    </ShowcaseLayout>
  );
}
