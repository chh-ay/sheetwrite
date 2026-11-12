import { createEffect, createSignal, For } from "solid-js";

import { Icon } from "../../components/Icon.js";
import { Select } from "../../components/Select.js";
import { ActionError, useAction } from "../../lib/use-action.js";
import { ShowcaseControlGroup, ShowcaseReadout, ShowcaseStage } from "../layout/ShowcaseLayout.js";
import { createLiveScenario } from "../lib/live-scenario.js";
import type {
  DataAction,
  DataSnapshot,
  DataToolsScenario,
  ProbeKey,
  ProbeResult,
} from "../scenarios/data-tools.js";
import { Button } from "../ui/Button.js";
import { setDataSnapshot } from "./store.js";

/** Empty region selects no Region filter in the scenario. */
const ALL_REGIONS = "";

/** One guarded column and the probe that tries to break its rule. */
export interface DataRuleProbe {
  readonly key: ProbeKey;
  readonly header: string;
  readonly rule: string;
  readonly tryLabel: string;
}

/** Props of {@link DataToolsStage}, from the scenario's checked data. */
export interface DataToolsStageProps {
  readonly rules: readonly DataRuleProbe[];
}

function probeText(result: ProbeResult | null): string {
  if (result === null) return "Not tried yet.";
  if (result.outcome === "rejected") return `Rejected. Still ${result.stored}.`;
  if (result.outcome === "warned") return `Saved with a warning: ${result.stored}.`;
  return `Saved: ${result.stored}.`;
}

type Snapshot = () => DataSnapshot | null;

/** The Region and Customer filters, and the count of rows they leave. */
function FilterControls(props: {
  readonly snapshot: Snapshot;
  readonly disabled: boolean;
  readonly region: string;
  readonly customer: string;
  readonly onFilter: (region: string, customer: string) => void;
  readonly onClear: () => void;
}) {
  return (
    <ShowcaseControlGroup
      description="Column filters narrow the view; the stored orders stay as they are."
      title="Find the work"
    >
      <Select
        id="data-region"
        label="Region"
        onChange={(value) => props.onFilter(value, props.customer)}
        options={[
          { label: "All regions", value: ALL_REGIONS },
          ...(props.snapshot()?.regions ?? []).map((value) => ({ label: value, value })),
        ]}
        value={props.region}
      />
      <label class="sw-data-field">
        <span>Customer</span>
        <input
          disabled={props.disabled}
          onInput={(event) => props.onFilter(props.region, event.currentTarget.value)}
          placeholder="Name contains, e.g. Northstar"
          value={props.customer}
        />
      </label>
      <ShowcaseReadout
        items={[
          {
            label: "Rows visible",
            value: (
              <span data-testid="data-visible">
                {props.snapshot()?.visible.toLocaleString() ?? "…"} /{" "}
                {props.snapshot()?.total.toLocaleString() ?? "…"} rows visible
              </span>
            ),
          },
          {
            label: "Filters",
            value: props.snapshot()?.filters.length
              ? (props.snapshot()?.filters ?? []).join(" · ")
              : "None",
          },
        ]}
      />
      <Button disabled={props.disabled} onClick={() => props.onClear()} variant="quiet">
        <Icon name="close" />
        Clear view
      </Button>
    </ShowcaseControlGroup>
  );
}

/** Row groups and hidden rows and columns, which compose with the filters. */
function OrganizeControls(props: {
  readonly snapshot: Snapshot;
  readonly disabled: boolean;
  readonly run: (action: DataAction) => void;
}) {
  return (
    <ShowcaseControlGroup
      description="The first dispatch batch is rows 1–24. Groups and hidden rows stay when filters clear."
      title="Organize"
    >
      <div class="sw-data-actions">
        <Button disabled={props.disabled} onClick={() => props.run("group")}>
          <Icon name="layers" />
          {props.snapshot()?.collapsed ? "Expand batch" : "Collapse batch"}
        </Button>
        <Button disabled={props.disabled} onClick={() => props.run("rows")}>
          <Icon name={props.snapshot()?.hiddenRows ? "eye" : "eye-off"} />
          {props.snapshot()?.hiddenRows ? "Unhide rows" : "Hide rows 25–27"}
        </Button>
        <Button disabled={props.disabled} onClick={() => props.run("columns")}>
          <Icon name={props.snapshot()?.hiddenColumns ? "eye" : "eye-off"} />
          {props.snapshot()?.hiddenColumns ? "Unhide columns" : "Hide freight & owner"}
        </Button>
      </div>
      <p class="sw-data-note">
        Hidden: {props.snapshot()?.hiddenRows ?? 0} rows, {props.snapshot()?.hiddenColumns ?? 0}{" "}
        columns
      </p>
    </ShowcaseControlGroup>
  );
}

/** Try each guarded column, as a user editing the stored order would. */
function RuleControls(props: {
  readonly rules: readonly DataRuleProbe[];
  readonly snapshot: Snapshot;
  readonly disabled: boolean;
  readonly run: (action: DataAction) => void;
  readonly probe: (key: ProbeKey) => void;
}) {
  const manager = () => props.snapshot()?.manager ?? false;
  return (
    <ShowcaseControlGroup
      description="Each rule guards the stored order, so it holds while the view is filtered."
      title="Rules on the data"
    >
      <ul class="sw-data-rules">
        <For each={props.rules}>
          {(rule) => {
            const result = () => props.snapshot()?.probes[rule.key] ?? null;
            return (
              <li>
                <strong>{rule.header}</strong>
                <span>{rule.rule}</span>
                <Button disabled={props.disabled} onClick={() => props.probe(rule.key)}>
                  <Icon name="shield" />
                  {rule.tryLabel}
                </Button>
                <output
                  class="sw-data-result"
                  data-outcome={result()?.outcome ?? "idle"}
                  data-stored={result()?.stored}
                  data-testid={`data-probe-${rule.key}`}
                >
                  {probeText(result())}
                </output>
              </li>
            );
          }}
        </For>
      </ul>
      <div aria-labelledby="data-role-label" class="sw-data-role" role="group">
        <span id="data-role-label">Acting as</span>
        <Button
          aria-pressed={!manager()}
          data-size="sm"
          disabled={props.disabled}
          onClick={() => props.run("operator")}
        >
          Operator
        </Button>
        <Button
          aria-pressed={manager()}
          data-size="sm"
          disabled={props.disabled}
          onClick={() => props.run("manager")}
        >
          Manager
        </Button>
      </div>
      <p class="sw-data-note">
        The lock is a UI policy for your users. Enforce the same rule on your server.
      </p>
    </ShowcaseControlGroup>
  );
}

/** The data tools showcase's island: the dispatch queue and its filters, groups and rules. */
export function DataToolsStage(props: DataToolsStageProps) {
  const live = createLiveScenario<DataToolsScenario, DataSnapshot>(() =>
    import("./boot.js").then(({ createDataToolsScenario }) => createDataToolsScenario),
  );
  const [region, setRegion] = createSignal(ALL_REGIONS);
  const [customer, setCustomer] = createSignal("");
  const action = useAction();
  createEffect(() => setDataSnapshot(live.snapshot()));

  const run = (command: DataAction) =>
    void action.run(
      () => live.scenario()?.run(command),
      (cause) => `Data action failed: ${String(cause)}`,
    );
  const probe = (key: ProbeKey) =>
    void action.run(
      () => live.scenario()?.probe(key),
      (cause) => `Probe failed: ${String(cause)}`,
    );
  const filter = (nextRegion: string, nextCustomer: string) => {
    setRegion(nextRegion);
    setCustomer(nextCustomer);
    void action.run(
      () => live.scenario()?.filter(nextRegion, nextCustomer),
      (cause) => `Filter failed: ${String(cause)}`,
    );
  };
  const clear = () => {
    setRegion(ALL_REGIONS);
    setCustomer("");
    run("clear");
  };
  const disabled = () => !live.snapshot()?.ready;

  return (
    <ShowcaseStage
      controls={
        <>
          <FilterControls
            customer={customer()}
            disabled={disabled()}
            onClear={clear}
            onFilter={filter}
            region={region()}
            snapshot={live.snapshot}
          />
          <OrganizeControls disabled={disabled()} run={run} snapshot={live.snapshot} />
          <RuleControls
            disabled={disabled()}
            probe={probe}
            rules={props.rules}
            run={run}
            snapshot={live.snapshot}
          />
          <ActionError error={action.error} />
        </>
      }
      demo={
        <>
          <div class="sw-showcase__grid" data-testid="data-grid" ref={live.host} />
          <p hidden={!(live.snapshot()?.error ?? live.error())} role="alert">
            {live.snapshot()?.error ?? live.error()}
          </p>
        </>
      }
      demoLabel="Dispatch operations"
      demoTitle="Dispatch queue"
    />
  );
}
