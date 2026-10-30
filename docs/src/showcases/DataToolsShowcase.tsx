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
} from "./scenarios/data-tools.js";

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
            <label>
              Region · values
              <select
                disabled={disabled}
                value={region}
                onChange={(event) => filter(event.target.value, customer)}
              >
                <option value="">All regions</option>
                {snapshot?.regions.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Customer · contains
              <input
                disabled={disabled}
                placeholder="Try Northstar"
                value={customer}
                onChange={(event) => filter(region, event.target.value)}
              />
            </label>
            <button disabled={disabled} onClick={() => void run("sort")}>
              Sort region → units ↓
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
              Hidden: {snapshot?.hiddenRows ?? 0} rows · {snapshot?.hiddenColumns ?? 0} columns
            </small>
          </div>
        </section>
        <div className="sw-data-lower">
          <section className="sw-data-panel" aria-labelledby="data-guardrails">
            <span className="sw-data-kicker">02 / KEEP THE RULES</span>
            <h2 id="data-guardrails">Try an unsafe edit</h2>
            <p>
              Probes target the first stored order, even while the view is sorted or filtered. You
              can also edit cells directly in the Grid.
            </p>
            <div className="sw-data-probes">
              <button disabled={disabled} onClick={() => void run("reject")}>
                Try units −5 · reject
              </button>
              <button disabled={disabled} onClick={() => void run("warn")}>
                Try freight $350 · warn
              </button>
              <button disabled={disabled} onClick={() => void run("protected")}>
                Try changing order ID
              </button>
              <button
                aria-pressed={snapshot?.manager ?? false}
                disabled={disabled}
                onClick={() => void run("permission")}
              >
                Role: {snapshot?.manager ? "manager" : "operator"}
              </button>
            </div>
            <p className="sw-data-probe" data-testid="data-probe" role="status">
              {snapshot?.probe}
            </p>
            <p className="sw-data-note">
              Units: integer 1–250, rejected otherwise. Freight: over $200 is saved with a warning.
              Order IDs: only the manager resolver allows changes. Client protection is a UX policy,
              not server authorization.
            </p>
          </section>
          <section className="sw-data-panel" aria-labelledby="data-events">
            <span className="sw-data-kicker">03 / READ THE RECEIPT</span>
            <h2 id="data-events">What the Grid reported</h2>
            <p>
              Newest first · bounded to 24 entries. Change events and mutation issues are reported,
              not simulated.
            </p>
            <ol className="sw-data-events" data-testid="data-events">
              {snapshot?.events.map((event) => (
                <li key={event}>{event}</li>
              ))}
            </ol>
          </section>
        </div>
        <p className="sw-data-note">
          Clear view removes sort and filters, not hidden rows or collapsed groups. Sorting and
          filtering change the view; validation and protection apply to the underlying data
          addresses. The Region menu is populated by <code>distinctValues</code>; the filter summary
          reads <code>getColumnFilters</code>.
        </p>
      </main>
    </div>
  );
}
