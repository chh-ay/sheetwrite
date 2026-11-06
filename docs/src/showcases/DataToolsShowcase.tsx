import { useEffect, useRef, useState } from "react";

import { Icon } from "../components/Icon.js";
import { ActionError, useAction } from "../lib/use-action.js";
import {
  ShowcaseControlGroup,
  ShowcaseLayout,
  ShowcaseReadout,
  ShowcaseSection,
} from "./layout/ShowcaseLayout.js";
import {
  createDataToolsScenario,
  DATA_COLUMNS,
  DATA_ROWS,
  DATA_RULES,
  probeValue,
  type DataAction,
  type DataSnapshot,
  type DataToolsScenario,
  type ProbeKey,
  type ProbeResult,
} from "./scenarios/data-tools.js";
import DataToolsSnippet from "./snippets/data-tools.mdx";
import { DemoButton } from "./ui/DemoButton.js";
import { DemoSelect } from "./ui/DemoSelect.js";

import "@sheetwrite/core/styles.css";

/** Empty region selects no Region filter in the scenario. */
const ALL_REGIONS = "";

function probeText(result: ProbeResult | null): string {
  if (result === null) return "Not tried yet.";
  if (result.outcome === "rejected") return `Rejected. Still ${result.stored}.`;
  if (result.outcome === "warned") return `Saved with a warning: ${result.stored}.`;
  return `Saved: ${result.stored}.`;
}

/** The Region and Customer filters, and the count of rows they leave. */
function FilterControls({
  snapshot,
  disabled,
  region,
  customer,
  onFilter,
  onClear,
}: {
  readonly snapshot: DataSnapshot | null;
  readonly disabled: boolean;
  readonly region: string;
  readonly customer: string;
  readonly onFilter: (region: string, customer: string) => void;
  readonly onClear: () => void;
}) {
  return (
    <ShowcaseControlGroup
      title="Find the work"
      description="Column filters narrow the view; the stored orders stay as they are."
    >
      <DemoSelect
        disabled={disabled}
        label="Region"
        options={[
          { label: "All regions", value: ALL_REGIONS },
          ...(snapshot?.regions ?? []).map((value) => ({ label: value, value })),
        ]}
        value={region}
        onValueChange={(value) => onFilter(value, customer)}
      />
      <label className="sw-data-field">
        <span>Customer</span>
        <input
          disabled={disabled}
          placeholder="Name contains, e.g. Northstar"
          value={customer}
          onChange={(event) => onFilter(region, event.target.value)}
        />
      </label>
      <ShowcaseReadout
        items={[
          {
            label: "Rows visible",
            value: (
              <span data-testid="data-visible">
                {snapshot?.visible.toLocaleString() ?? "…"} /{" "}
                {snapshot?.total.toLocaleString() ?? "…"} rows visible
              </span>
            ),
          },
          {
            label: "Filters",
            value: snapshot?.filters.length ? snapshot.filters.join(" · ") : "None",
          },
        ]}
      />
      <DemoButton disabled={disabled} onClick={onClear} variant="quiet">
        <Icon name="close" />
        Clear view
      </DemoButton>
    </ShowcaseControlGroup>
  );
}

/** Row groups and hidden rows and columns, which compose with the filters. */
function OrganizeControls({
  snapshot,
  disabled,
  run,
}: {
  readonly snapshot: DataSnapshot | null;
  readonly disabled: boolean;
  readonly run: (action: DataAction) => void;
}) {
  return (
    <ShowcaseControlGroup
      title="Organize"
      description="The first dispatch batch is rows 1–24. Groups and hidden rows stay when filters clear."
    >
      <div className="sw-data-actions">
        <DemoButton disabled={disabled} onClick={() => run("group")}>
          <Icon name="layers" />
          {snapshot?.collapsed ? "Expand batch" : "Collapse batch"}
        </DemoButton>
        <DemoButton disabled={disabled} onClick={() => run("rows")}>
          <Icon name={snapshot?.hiddenRows ? "eye" : "eye-off"} />
          {snapshot?.hiddenRows ? "Unhide rows" : "Hide rows 25–27"}
        </DemoButton>
        <DemoButton disabled={disabled} onClick={() => run("columns")}>
          <Icon name={snapshot?.hiddenColumns ? "eye" : "eye-off"} />
          {snapshot?.hiddenColumns ? "Unhide columns" : "Hide freight & owner"}
        </DemoButton>
      </div>
      <p className="sw-data-note">
        Hidden: {snapshot?.hiddenRows ?? 0} rows, {snapshot?.hiddenColumns ?? 0} columns
      </p>
    </ShowcaseControlGroup>
  );
}

/** Try each guarded column, as a user editing the stored order would. */
function RuleControls({
  snapshot,
  disabled,
  run,
  probe,
}: {
  readonly snapshot: DataSnapshot | null;
  readonly disabled: boolean;
  readonly run: (action: DataAction) => void;
  readonly probe: (key: ProbeKey) => void;
}) {
  return (
    <ShowcaseControlGroup
      title="Rules on the data"
      description="Each rule guards the stored order, so it holds while the view is filtered."
    >
      <ul className="sw-data-rules">
        {Object.values(DATA_RULES).map((rule) => {
          const result = snapshot?.probes[rule.key] ?? null;
          return (
            <li key={rule.key}>
              <strong>{rule.column.header}</strong>
              <span>{rule.rule}</span>
              <DemoButton disabled={disabled} onClick={() => probe(rule.key)}>
                <Icon name="shield" />
                {rule.key === "order"
                  ? "Try a new order ID"
                  : `Try ${rule.key} ${probeValue(rule.key)}`}
              </DemoButton>
              <output
                className="sw-data-result"
                data-outcome={result?.outcome ?? "idle"}
                data-stored={result?.stored}
                data-testid={`data-probe-${rule.key}`}
              >
                {probeText(result)}
              </output>
            </li>
          );
        })}
      </ul>
      <div aria-labelledby="data-role-label" className="sw-data-role" role="group">
        <span id="data-role-label">Acting as</span>
        <DemoButton
          aria-pressed={!(snapshot?.manager ?? false)}
          data-size="sm"
          disabled={disabled}
          onClick={() => run("operator")}
        >
          Operator
        </DemoButton>
        <DemoButton
          aria-pressed={snapshot?.manager ?? false}
          data-size="sm"
          disabled={disabled}
          onClick={() => run("manager")}
        >
          Manager
        </DemoButton>
      </div>
      <p className="sw-data-note">
        The lock is a UI policy for your users. Enforce the same rule on your server.
      </p>
    </ShowcaseControlGroup>
  );
}

export default function DataToolsShowcase() {
  const host = useRef<HTMLDivElement>(null);
  const scenario = useRef<DataToolsScenario | null>(null);
  const [snapshot, setSnapshot] = useState<DataSnapshot | null>(null);
  const [region, setRegion] = useState(ALL_REGIONS);
  const [customer, setCustomer] = useState("");
  const action = useAction();
  useEffect(() => {
    if (!host.current) return;
    const instance = createDataToolsScenario(host.current);
    scenario.current = instance;
    const update = () => setSnapshot(instance.snapshot());
    const unsubscribe = instance.subscribe(update);
    update();
    return () => {
      unsubscribe();
      instance.dispose();
      scenario.current = null;
    };
  }, []);
  const run = (command: DataAction) =>
    void action.run(
      () => scenario.current?.run(command),
      (cause) => `Data action failed: ${String(cause)}`,
    );
  const probe = (key: ProbeKey) =>
    void action.run(
      () => scenario.current?.probe(key),
      (cause) => `Probe failed: ${String(cause)}`,
    );
  const filter = (nextRegion: string, nextCustomer: string) => {
    setRegion(nextRegion);
    setCustomer(nextCustomer);
    void action.run(
      () => scenario.current?.filter(nextRegion, nextCustomer),
      (cause) => `Filter failed: ${String(cause)}`,
    );
  };
  const clear = () => {
    setRegion(ALL_REGIONS);
    setCustomer("");
    run("clear");
  };
  const disabled = !snapshot?.ready;

  return (
    <ShowcaseLayout
      code={{ title: "How it is built", Snippet: DataToolsSnippet }}
      controls={
        <>
          <FilterControls
            customer={customer}
            disabled={disabled}
            onClear={clear}
            onFilter={filter}
            region={region}
            snapshot={snapshot}
          />
          <OrganizeControls disabled={disabled} run={run} snapshot={snapshot} />
          <RuleControls disabled={disabled} probe={probe} run={run} snapshot={snapshot} />
          <ActionError error={action.error} />
        </>
      }
      demo={
        <>
          <div className="sw-showcase__grid" data-testid="data-grid" ref={host} />
          {snapshot?.error && <p role="alert">{snapshot.error}</p>}
        </>
      }
      demoLabel="Dispatch operations"
      demoTitle="Dispatch queue"
      eyebrow="Data"
      facts={[
        { label: "Orders", value: DATA_ROWS.toLocaleString("en") },
        { label: "Columns", value: DATA_COLUMNS.length.toLocaleString("en") },
        { label: "Rules", value: Object.keys(DATA_RULES).length.toLocaleString("en") },
      ]}
      guide={{
        href: "/docs/features/data/data-operations/",
        label: "Read the data operations guide",
      }}
      id="data-tools"
      task={
        <>
          Narrow {DATA_ROWS.toLocaleString("en")} dispatch orders with filters, groups and hidden
          rows, then try edits that the rules reject, warn about or lock.
        </>
      }
      title="Filter the work, guard the data"
    >
      <ShowcaseSection id="data-events" title="What the grid reported">
        <p>Newest first: grid calls and events, plus labeled host role changes.</p>
        <ol className="sw-data-events" data-testid="data-events">
          {snapshot?.events.map((event) => (
            <li data-tone={event.tone} key={event.id}>
              <span>{event.text}</span>
              <code>{event.api}</code>
            </li>
          ))}
        </ol>
        <p>
          Sorting moved to its own showcase: <a href="/showcases/sort/">sort in place</a>, as Excel
          does, or for the view only.
        </p>
      </ShowcaseSection>
    </ShowcaseLayout>
  );
}
