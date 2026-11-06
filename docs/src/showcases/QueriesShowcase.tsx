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
  createQueriesScenario,
  REPORT_ROWS_USED,
  FEED_BATCH_ROWS,
  FEED_START_ROWS,
  LARGE_ORDER_AMOUNT,
  type QueriesScenario,
  type QueriesSnapshot,
  type StatusFilter,
} from "./scenarios/queries.js";
import QueriesSnippet from "./snippets/queries.mdx";
import { DemoRadioGroup, DemoRadioItem } from "./ui/DemoRadioGroup.js";
import { useLiveScenario, useScenarioAction } from "./use-live-scenario.js";

import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";

function RefreshStatus({ snapshot }: { readonly snapshot: QueriesSnapshot | null }) {
  if (!snapshot || snapshot.refreshing) {
    return <ShowcaseStatus tone="neutral">Refreshing…</ShowcaseStatus>;
  }
  if (snapshot.definitionChanged) {
    return <ShowcaseStatus tone="warn">Query changed: Refresh All to apply it</ShowcaseStatus>;
  }
  if (snapshot.lastRefresh?.status === "applied") {
    return <ShowcaseStatus tone="ok">Tables match the sources</ShowcaseStatus>;
  }
  return <ShowcaseStatus tone="neutral">Not refreshed yet</ShowcaseStatus>;
}

function RefreshReadout({ snapshot }: { readonly snapshot: QueriesSnapshot | null }) {
  const last = snapshot?.lastRefresh;
  return (
    <ShowcaseReadout
      items={[
        { label: "Orders in the feed", value: snapshot?.feedRows.toLocaleString("en") ?? "…" },
        {
          label: "Source loads",
          value: <span data-testid="queries-fetches">{snapshot?.fetches ?? 0}</span>,
        },
        {
          label: "Last refresh",
          value: last ? `${last.status}, ${Math.round(last.milliseconds)} ms` : "None yet",
        },
      ]}
    />
  );
}

function FormulaReadout({ snapshot }: { readonly snapshot: QueriesSnapshot | null }) {
  return (
    <ShowcaseReadout
      items={(snapshot?.formulas ?? []).map((formula) => ({
        label: formula.label,
        value: <span data-testid={`queries-formula-${formula.label}`}>{formula.value}</span>,
      }))}
    />
  );
}

function QueriesControls({
  scenario,
  snapshot,
}: {
  readonly scenario: QueriesScenario | null;
  readonly snapshot: QueriesSnapshot | null;
}) {
  const { run, disabled, error } = useScenarioAction(scenario);
  const busy = disabled || (snapshot?.refreshing ?? true);

  return (
    <>
      <ShowcaseControlGroup
        title="Refresh"
        description="Refresh All loads both sources through the host callback and writes both tables in one undo step."
      >
        <RefreshStatus snapshot={snapshot} />
        <ControlActions>
          <ControlButton
            disabled={busy}
            icon="refresh"
            onClick={() => void run("Refresh All", (current) => current.refreshAll())}
            variant="primary"
          >
            Refresh All
          </ControlButton>
          <ControlButton
            disabled={busy}
            icon="plus"
            onClick={() => void run("New orders", (current) => current.addOrders())}
          >
            {FEED_BATCH_ROWS.toLocaleString("en")} new orders arrive
          </ControlButton>
        </ControlActions>
        <RefreshReadout snapshot={snapshot} />
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        title="Change a step"
        description="The Region totals query filters, merges the region list, then groups."
      >
        <DemoRadioGroup<StatusFilter>
          label="Orders the Region totals query keeps"
          onValueChange={(value) =>
            void run("The query change", (current) => current.setStatuses(value))
          }
          value={snapshot?.statuses ?? "shipped"}
        >
          <DemoRadioItem value="shipped">Shipped only</DemoRadioItem>
          <DemoRadioItem value="all">All statuses</DemoRadioItem>
        </DemoRadioGroup>
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        title="Formulas on the Report sheet"
        description="They read the output tables by name, like any workbook table."
      >
        <FormulaReadout snapshot={snapshot} />
        <ControlActions>
          <ControlButton
            disabled={busy}
            icon="layers"
            onClick={() =>
              void run("Queries & Connections", (current) => current.openQueriesPanel())
            }
          >
            Queries & Connections…
          </ControlButton>
          <ControlButton
            disabled={busy}
            icon="undo"
            onClick={() => void run("Undo", (current) => current.undo())}
          >
            Undo
          </ControlButton>
        </ControlActions>
        <ActionError error={error} />
      </ShowcaseControlGroup>
    </>
  );
}

export default function QueriesShowcase() {
  const { hostRef, scenario, snapshot, error } = useLiveScenario(createQueriesScenario);

  return (
    <ShowcaseLayout
      code={{ title: "The code behind it", Snippet: QueriesSnippet }}
      controls={<QueriesControls scenario={scenario} snapshot={snapshot} />}
      demo={
        <>
          <DemoGrid
            hostRef={hostRef}
            label="Report workbook"
            rows={REPORT_ROWS_USED}
            testId="queries-grid"
          />
          <ActionError error={error} />
        </>
      }
      demoLabel="Live query workbook"
      eyebrow="Data"
      facts={[
        { label: "Orders in the feed", value: FEED_START_ROWS.toLocaleString("en") },
        { label: "Saved queries", value: "Region totals, Large orders" },
        { label: "Package", value: "@sheetwrite/queries" },
      ]}
      guide={{
        href: "/docs/features/data/data-operations/#saved-queries-and-refresh",
        label: "Read the queries guide",
      }}
      id="queries"
      task={
        <>
          Refresh two saved queries that shape an order feed into workbook tables. Let new orders
          arrive, change a step, and refresh again.
        </>
      }
      title="Saved queries that refresh into tables"
    >
      <ShowcaseSection id="queries-rules" title="What a refresh does">
        <ul>
          <li>
            The session loads sources only through your <code>fetchSource</code> callback, so your
            app applies its own credentials and network rules.
          </li>
          <li>
            Undo and redo restore the written values without another source load: watch Source loads
            stay the same.
          </li>
          <li>
            Large orders keeps orders of {LARGE_ORDER_AMOUNT.toLocaleString("en")} or more. A
            refresh that would grow a table over other cells writes nothing.
          </li>
          <li>
            With a Power Query codec, XLSX export writes the saved queries as Power Query parts for
            Excel, and import reads them back.
          </li>
        </ul>
      </ShowcaseSection>
    </ShowcaseLayout>
  );
}
