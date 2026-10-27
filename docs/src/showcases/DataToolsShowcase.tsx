import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { SiteTopbar } from "../components/SiteTopbar.js";
import { ActionError, useAction } from "../lib/use-action.js";
import { CapabilityHero } from "./CapabilityHero.js";
import {
  createDataToolsScenario,
  type DataAction,
  type DataSnapshot,
  type DataToolsScenario,
  type ProbeKey,
  type ProbeResult,
} from "./scenarios/data-tools.js";
import { DemoSelect } from "./ui/DemoSelect.js";

/** The guarded columns, the rule each one carries, and the probe that tests it. */
const RULES: readonly {
  key: ProbeKey;
  column: string;
  rule: string;
  action: DataAction;
  attempt: string;
}[] = [
  {
    key: "units",
    column: "Units",
    rule: "A whole number from 1 to 250. Anything else is rejected.",
    action: "reject",
    attempt: "Try units −5",
  },
  {
    key: "freight",
    column: "Freight",
    rule: "Above $200 is saved, with a warning to review it.",
    action: "warn",
    attempt: "Try freight $350",
  },
  {
    key: "order",
    column: "Order ID",
    rule: "Locked. Only a manager can change it.",
    action: "protected",
    attempt: "Try a new order ID",
  },
];

const ALL_REGIONS = "";

function probeText(result: ProbeResult | null): string {
  if (result === null) return "Not tried yet.";
  if (result.outcome === "rejected") return `Rejected. Still ${result.stored}.`;
  if (result.outcome === "warned") return `Saved with a warning: ${result.stored}.`;
  return `Saved: ${result.stored}.`;
}

import "@sheetwrite/core/styles.css";

export default function DataToolsShowcase() {
  const host = useRef<HTMLDivElement>(null);
  const scenario = useRef<DataToolsScenario | null>(null);
  const [snapshot, setSnapshot] = useState<DataSnapshot | null>(null);
  const [region, setRegion] = useState("");
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
    action.run(
      () => {
        scenario.current?.run(command);
        if (command === "clear") {
          setRegion("");
          setCustomer("");
        }
      },
      (cause) => `Data action failed: ${String(cause)}`,
    );
  const filter = (nextRegion: string, nextCustomer: string) => {
    setRegion(nextRegion);
    setCustomer(nextCustomer);
    void action.run(
      () => scenario.current?.filter(nextRegion, nextCustomer),
      (cause) => `Filter failed: ${String(cause)}`,
    );
  };
  const disabled = !snapshot?.ready;

  return (
    <div className="sw-data-frame">
      <SiteTopbar />
      <main className="sw-data" id="main-content">
        <CapabilityHero
          eyebrow="CAPABILITY / DATA TOOLS"
          title="A busy dispatch desk. A calmer view."
          description={
            <>
              Sort, narrow and organize 4,800 orders without losing the underlying records. Then
              test the guardrails on real edits.{" "}
              <Link to="/showcases/">Browse every live feature →</Link>
            </>
          }
          facts={[
            { label: "Dataset", value: "4,800 orders" },
            { label: "View", value: "Composable filters" },
            { label: "Guardrails", value: "Reject · warn · protect" },
            { label: "Evidence", value: "Live Grid events" },
          ]}
        />
        <section className="sw-data-workspace" aria-label="Dispatch operations">
          <div className="sw-data-controls">
            <div>
              <span className="sw-data-kicker">01 / FIND THE WORK</span>
              <h2>Dispatch queue</h2>
            </div>
            <DemoSelect
              className="sw-data-region"
              disabled={disabled}
              label="Region"
              options={[
                { label: "All regions", value: ALL_REGIONS },
                ...(snapshot?.regions ?? []).map((value) => ({ label: value, value })),
              ]}
              value={region}
              onValueChange={(value) => filter(value, customer)}
            />
            <label>
              Customer
              <input
                disabled={disabled}
                placeholder="Name contains, e.g. Northstar"
                value={customer}
                onChange={(event) => filter(region, event.target.value)}
              />
            </label>
            <button disabled={disabled} onClick={() => void run("sort")}>
              Sort by region, then units
            </button>
            <button disabled={disabled} onClick={() => void run("clear")}>
              Clear view
            </button>
          </div>
          <div className="sw-data-status" role="status">
            <strong data-testid="data-visible">
              {snapshot?.visible.toLocaleString() ?? "…"} /{" "}
              {snapshot?.total.toLocaleString() ?? "…"} rows visible
            </strong>
            <span>
              {snapshot?.filters.length ? snapshot.filters.join(" · ") : "No active column filters"}
            </span>
            <span className="sw-data-columns" id="data-column-guide">
              A Order ID · B Region · C Customer · D Status · E Units · F Freight $ · G Owner
            </span>
          </div>
          <div
            aria-describedby="data-column-guide"
            className="sw-data-grid"
            data-testid="data-grid"
            ref={host}
          />
          {snapshot?.error && <p role="alert">{snapshot.error}</p>}
          <ActionError error={action.error} />
          <div className="sw-data-organize">
            <span>First dispatch batch: rows 1–24</span>
            <button disabled={disabled} onClick={() => void run("group")}>
              {snapshot?.collapsed ? "Expand batch" : "Collapse batch"}
            </button>
            <button disabled={disabled} onClick={() => void run("rows")}>
              {snapshot?.hiddenRows ? "Unhide rows" : "Hide rows 25–27"}
            </button>
            <button disabled={disabled} onClick={() => void run("columns")}>
              {snapshot?.hiddenColumns ? "Unhide columns" : "Hide freight & owner"}
            </button>
            <small>
              Hidden: {snapshot?.hiddenRows ?? 0} rows, {snapshot?.hiddenColumns ?? 0} columns
            </small>
          </div>
        </section>
        <div className="sw-data-lower">
          <section className="sw-data-panel" aria-labelledby="data-guardrails">
            <h2 id="data-guardrails">Rules on the data</h2>
            <p>
              Each rule guards the stored order, so it holds while the view is sorted or filtered.
              Try one, or type into the Grid.
            </p>
            <ul className="sw-data-rules">
              {RULES.map((rule) => {
                const result = snapshot?.probes[rule.key] ?? null;
                return (
                  <li key={rule.key}>
                    <div className="sw-data-rule">
                      <strong>{rule.column}</strong>
                      <span>{rule.rule}</span>
                    </div>
                    <button disabled={disabled} onClick={() => void run(rule.action)}>
                      {rule.attempt}
                    </button>
                    <output
                      className="sw-data-result"
                      data-outcome={result?.outcome ?? "idle"}
                      data-testid={`data-probe-${rule.key}`}
                    >
                      {probeText(result)}
                    </output>
                  </li>
                );
              })}
            </ul>
            <div className="sw-data-role" role="group" aria-labelledby="data-role-label">
              <span id="data-role-label">Acting as</span>
              <button
                aria-pressed={!(snapshot?.manager ?? false)}
                disabled={disabled}
                onClick={() => void run("operator")}
              >
                Operator
              </button>
              <button
                aria-pressed={snapshot?.manager ?? false}
                disabled={disabled}
                onClick={() => void run("manager")}
              >
                Manager
              </button>
            </div>
            <p className="sw-data-note">
              The lock is a UI policy for your users. Enforce the same rule on your server.
            </p>
          </section>
          <section className="sw-data-panel" aria-labelledby="data-events">
            <h2 id="data-events">What the Grid reported</h2>
            <p>Newest first. Every line comes from a real Grid call or event.</p>
            <ol className="sw-data-events" data-testid="data-events">
              {snapshot?.events.map((event) => (
                <li data-tone={event.tone} key={event.id}>
                  <span>{event.text}</span>
                  <code>{event.api}</code>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>
    </div>
  );
}
