import type { Grid } from "@sheetwrite/core";
import workerRendererUrl from "@sheetwrite/core/worker?worker&url";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { SiteTopbar } from "../components/SiteTopbar.js";
import { isRepeatClick } from "../lib/action-guard.js";
import { ActionError, useAction } from "../lib/use-action.js";
import { CapabilityHero } from "./CapabilityHero.js";
import {
  ENGINE_COLUMN_LETTER,
  ENGINE_FORECAST_UPSIDE,
  ENGINE_LIVE_ROWS,
  type EngineColumnBand,
  ENGINE_PLAN_COLUMN,
  ENGINE_PLAN_KEY,
} from "./scenarios/engine-live-data.js";
import {
  createEngineScenario,
  ENGINE_LOADING_MARKER,
  ENGINE_TRACE_LIMIT,
  type EngineAction,
  type EngineEvent,
  type EngineScenario,
  type EngineScenarioSnapshot,
  formatEngineEvent,
  formatEngineValue,
} from "./scenarios/engine-live.js";

import "@sheetwrite/core/styles.css";

interface EngineShowcaseHandle {
  grid(): Grid | null;
  run(action: EngineAction): Promise<void>;
  reset(): void;
  traceLength(): number;
}

declare global {
  interface Window {
    __sheetwriteEngineShowcase?: EngineShowcaseHandle;
  }
}

function eventOfType<Type extends EngineEvent["type"]>(
  events: readonly EngineEvent[],
  type: Type,
): Extract<EngineEvent, { type: Type }> | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === type) return event as Extract<EngineEvent, { type: Type }>;
  }
  return undefined;
}

const EVENT_LABELS: Record<EngineEvent["type"], string> = {
  "datasource-request": "Rows requested",
  "datasource-result": "Rows arrived",
  "transaction-result": "Input changed",
  "formula-update": "Formulas followed",
  "page-resource": "Memory sampled",
  "visible-window": "Viewport moved",
  renderer: "Drawing path",
  "host-save": "Host acknowledged",
  "browser-frame": "Browser paint checkpoint",
  "formula-rewrite": "Same reads, new constant",
};

/** Below this width the ledger drops its frozen columns to fit a phone. */
const NARROW_VIEWPORT = "(max-width: 48rem)";

/** The four measured steps of one change-to-acknowledgement run. */
const FOLLOW_STEPS = [
  "Requested page + off-screen band",
  "Recalculation down the chain",
  "Browser paint checkpoint",
  "Host acknowledgement",
] as const;

/** A sub-millisecond step still gets a visible slice of the timing bar. */
const MIN_STEP_SHARE = 0.02;

function carriesPlanBand(columns: readonly EngineColumnBand[]): boolean {
  return columns.some((band) => band.keys.includes(ENGINE_PLAN_KEY));
}

export default function EngineShowcase() {
  const command = useAction();
  const { run: runCommand } = command;
  const hostRef = useRef<HTMLDivElement>(null);
  const scenarioRef = useRef<EngineScenario | null>(null);
  const jumpInputRef = useRef("24001");
  const [jumpInput, setJumpInput] = useState("24001");
  const [snapshot, setSnapshot] = useState<EngineScenarioSnapshot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const viewport = window.matchMedia(NARROW_VIEWPORT);
    const scenario = createEngineScenario(host, {
      workerUrl: workerRendererUrl,
      narrow: () => viewport.matches,
    });
    scenarioRef.current = scenario;
    let previousRow = scenario.snapshot().currentRow;
    const update = () => {
      const next = scenario.snapshot();
      if (next.ready && next.currentRow !== previousRow) {
        jumpInputRef.current = String(next.currentRow + 1);
        setJumpInput(jumpInputRef.current);
      }
      previousRow = next.currentRow;
      setSnapshot(next);
    };
    const unsubscribe = scenario.subscribe(update);
    update();
    const updateFrozenColumns = () => scenario.grid()?.setFrozen(1, viewport.matches ? 0 : 2);
    viewport.addEventListener("change", updateFrozenColumns);
    return () => {
      viewport.removeEventListener("change", updateFrozenColumns);
      unsubscribe();
      scenario.dispose();
      scenarioRef.current = null;
    };
  }, []);

  const runAction = useCallback(
    async (action: EngineAction) => {
      await runCommand(
        () =>
          scenarioRef.current?.run(action, action === "jump" ? jumpInputRef.current : undefined),
        (cause) => `The engine action failed: ${String(cause)}. Try again.`,
      );
    },
    [runCommand],
  );
  const reset = useCallback(() => {
    jumpInputRef.current = "24001";
    setJumpInput("24001");
    scenarioRef.current?.reset();
  }, []);
  const followChange = () => scenarioRef.current?.followChange();
  const rewriteFormula = () => scenarioRef.current?.rewriteFormula();

  useEffect(() => {
    const handle: EngineShowcaseHandle = {
      grid: () => scenarioRef.current?.grid() ?? null,
      run: runAction,
      reset,
      traceLength: () => scenarioRef.current?.traceLength() ?? 0,
    };
    window.__sheetwriteEngineShowcase = handle;
    return () => {
      if (window.__sheetwriteEngineShowcase === handle) delete window.__sheetwriteEngineShowcase;
    };
  }, [reset, runAction]);

  const {
    events = [],
    requestedRenderer = "canvas",
    activeRenderer = "canvas",
    rendererFallback = null,
    ready = false,
    error = null,
    pendingOperations = 0,
    currentRow = 1,
    status = "Starting the calculation engine…",
    following = false,
    followDuration = null,
    followSteps = null,
    rewriteDuration = null,
    planRequest = null,
    varianceValue = null,
    varianceFormula = null,
    forecast = null,
  } = snapshot ?? {};

  const latestFormula = eventOfType(events, "formula-update");
  const latestResource = eventOfType(events, "page-resource");
  const latestSave = eventOfType(events, "host-save");
  const rowLabel = currentRow + 1;
  const offScreenRead = `${ENGINE_PLAN_COLUMN}${rowLabel}`;
  const offScreenResolved = typeof forecast === "number" && typeof varianceValue === "number";
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const disabled = !ready || following;

  return (
    <div className="sw-engine-frame">
      <SiteTopbar active="engine" />
      <main className="sw-engine" id="main-content">
        <CapabilityHero
          description={
            <>
              Follow one revenue change through a real 50,000-row forecast: the requested page, the
              recalculation, the paint checkpoint and the host acknowledgement. Visible formulas
              also load the far-right Plan column they read.{" "}
              <Link to="/showcases/">Browse every live feature →</Link>
            </>
          }
          eyebrow="CAPABILITY / LIVE ENGINE"
          facts={[
            { label: "Ledger", value: "50,000 rows" },
            { label: "Accounts", value: "3,846 / four regions" },
            { label: "Formula reads", value: "Off-screen columns included" },
            { label: "Evidence", value: "Measured in your browser" },
          ]}
          title="One change. Watch the whole Grid follow."
        />

        <section
          aria-labelledby="engine-stage-title"
          className="sw-engine-stage"
          data-running={following}
        >
          <ActionError error={command.error ?? error} />
          <header className="sw-engine-stage__head">
            <div className="sw-engine-stage__intro">
              <p className="sw-engine__eyebrow">FY26 regional forecast · USD</p>
              <h2 id="engine-stage-title">From actual to acknowledgement.</h2>
              <p>
                Monthly revenue for one product line in one region. Variance and attainment are
                formulas, and the annual totals are sums of those rows.
              </p>
              <button
                className="sw-engine-primary"
                data-testid="engine-follow"
                aria-busy={following || undefined}
                disabled={disabled}
                onClick={() => void followChange()}
                type="button"
              >
                {following ? "Following the change…" : "Change an actual and follow it"}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
            <div className="sw-engine-run" data-testid="engine-follow-report">
              <div className="sw-engine-run__total">
                <span>Change → host acknowledgement</span>
                <strong data-testid="engine-follow-duration" data-empty={followDuration === null}>
                  {followDuration === null ? (
                    "Not measured"
                  ) : (
                    <>
                      {followDuration.toFixed(1)}
                      <small>ms</small>
                    </>
                  )}
                </strong>
                <span>
                  {following
                    ? "Following this change…"
                    : followDuration === null
                      ? "Change an actual to time each step below."
                      : "Rows + recalc + paint + local host"}
                </span>
              </div>
              {/* One bar split by step: the reader sees where the time went
                  before reading any number. */}
              <div aria-hidden="true" className="sw-engine-run__bar">
                {followSteps && followDuration
                  ? followSteps.map((stepMs, index) => (
                      <i
                        key={FOLLOW_STEPS[index]}
                        style={{ flexGrow: Math.max(stepMs, followDuration * MIN_STEP_SHARE) }}
                      />
                    ))
                  : null}
              </div>
              <ol aria-label="Measured steps of the last run" className="sw-engine-run__steps">
                {FOLLOW_STEPS.map((step, index) => {
                  const stepMs = followSteps?.[index];
                  return (
                    <li data-testid={`engine-follow-step-${index}`} key={step}>
                      <span>{step}</span>
                      {/* Unmeasured steps stay blank: the total above already says why. */}
                      <strong data-empty={stepMs === undefined}>
                        {stepMs === undefined ? (
                          <span className="sw-visually-hidden">Not measured</span>
                        ) : (
                          `${stepMs.toFixed(1)} ms`
                        )}
                      </strong>
                    </li>
                  );
                })}
              </ol>
            </div>
          </header>

          <div className="sw-engine-stage__workspace" data-testid="engine-workbench">
            <section aria-label="Live Sheetwrite Grid" className="sw-engine-grid-panel">
              <div className="sw-engine-grid-panel__status">
                <span data-state={ready ? "ready" : error ? "error" : "loading"}>
                  {ready ? "Live ledger" : error ? "Grid error" : "Loading Grid"}
                </span>
                <span>Row {(currentRow + 1).toLocaleString()}</span>
                <span>12 months + annual totals / account</span>
              </div>
              <div className="sw-engine-grid" data-testid="engine-grid" ref={hostRef} />
              <dl aria-label="Current runtime facts" className="sw-engine-facts">
                <div>
                  <dt>Drawing</dt>
                  <dd data-testid="engine-active-renderer">{activeRenderer}</dd>
                </div>
                <div>
                  <dt>Loaded cells</dt>
                  <dd data-testid="engine-loaded-cells">
                    {(latestResource?.loadedCells ?? 0).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt>Unsaved</dt>
                  <dd data-testid="engine-pending-operations">{pendingOperations}</dd>
                </div>
              </dl>
            </section>

            <aside
              aria-label="Public evidence for current Grid work"
              className="sw-engine-cutaway"
              data-testid="engine-public-trace"
            >
              <header className="sw-engine-cutaway__head">
                <div>
                  <p className="sw-engine__eyebrow">Live circuit</p>
                  <h3>The work behind the cells</h3>
                </div>
                <span className="sw-engine-live-dot" data-running={following}>
                  {following ? "Running" : "Live"}
                </span>
              </header>
              <div
                className="sw-engine-offscreen"
                data-column={ENGINE_PLAN_COLUMN}
                data-requested={Boolean(planRequest)}
                data-resolved={offScreenResolved}
                data-testid="engine-offscreen-band"
              >
                <p className="sw-engine__eyebrow">OFF-SCREEN FORMULA READS</p>
                <strong>
                  Variance {ENGINE_COLUMN_LETTER.variance}
                  {rowLabel} reads Plan {offScreenRead}
                </strong>
                <dl>
                  <div>
                    <dt>Variance formula</dt>
                    <dd>
                      <code>{varianceFormula ?? "loading"}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Variance</dt>
                    <dd>
                      {typeof varianceValue === "number" ? money.format(varianceValue) : "loading"}
                    </dd>
                  </div>
                  <div>
                    <dt>Forecast from plan</dt>
                    <dd>{typeof forecast === "number" ? money.format(forecast) : "loading"}</dd>
                  </div>
                </dl>
                <p className="sw-engine-offscreen__result" data-plan-band={Boolean(planRequest)}>
                  {planRequest
                    ? `Extra band in the window request: ${ENGINE_PLAN_COLUMN}, rows ${planRequest.start + 1}–${planRequest.end}.`
                    : "The window request has no plan band yet."}{" "}
                  {offScreenResolved
                    ? "Both cells resolved, so neither shows #LOADING!."
                    : "Waiting for the plan band."}
                </p>
              </div>
              <div className="sw-engine-timeline" data-testid="engine-evidence-viewer">
                <ol aria-label="Latest source observations" data-testid="engine-event-log">
                  {[...events].reverse().map((event, index, newestFirst) => {
                    // Each row shows the gap since the observation before it,
                    // which reads as cause and effect; the page-clock time is
                    // kept in the title for exact reference.
                    const previous = newestFirst[index + 1];
                    return (
                      <li
                        data-event={event.type}
                        data-plan-band={
                          event.type === "datasource-request" && carriesPlanBand(event.columns)
                            ? ENGINE_PLAN_COLUMN
                            : undefined
                        }
                        key={event.sequence}
                      >
                        <div>
                          <strong>{EVENT_LABELS[event.type]}</strong>
                          <time title={`${event.observedAt.toFixed(1)} ms after page load`}>
                            {previous === undefined
                              ? "first"
                              : `+${(event.observedAt - previous.observedAt).toFixed(1)} ms`}
                          </time>
                        </div>
                        <p>{formatEngineEvent(event)}</p>
                      </li>
                    );
                  })}
                </ol>
              </div>
              <p className="sw-engine-cutaway__resource">
                Latest {ENGINE_TRACE_LIMIT} observations, newest first. Each time is the gap since
                the observation below it.
                {rendererFallback &&
                  ` ${requestedRenderer} fell back to ${activeRenderer}: ${rendererFallback}`}
              </p>
            </aside>
          </div>

          <section aria-label="Workbook controls" className="sw-engine-controls">
            <fieldset>
              <legend>Navigate</legend>
              <form
                className="sw-engine-controls__jump"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction("jump");
                }}
              >
                <label htmlFor="engine-jump">Row</label>
                <input
                  data-testid="engine-jump-input"
                  id="engine-jump"
                  inputMode="numeric"
                  max={ENGINE_LIVE_ROWS}
                  min="1"
                  onChange={(event) => {
                    jumpInputRef.current = event.target.value;
                    setJumpInput(event.target.value);
                  }}
                  value={jumpInput}
                  disabled={following}
                />
                <button
                  data-testid="engine-jump"
                  disabled={disabled || command.pending}
                  aria-busy={command.pending || undefined}
                  type="submit"
                >
                  {command.pending ? "Moving to row…" : "Jump"}
                </button>
              </form>
            </fieldset>
            <fieldset>
              <legend>Change inputs</legend>
              <div className="sw-engine-controls__actions">
                <button
                  data-testid="engine-edit"
                  aria-busy={command.pending || undefined}
                  disabled={disabled || command.pending}
                  onClick={() => void runAction("edit")}
                  type="button"
                >
                  {command.pending ? "Updating actual…" : "Actual +$1,250"}
                </button>
                <button
                  data-testid="engine-undo"
                  aria-busy={command.pending || undefined}
                  disabled={disabled || command.pending}
                  onClick={() => void runAction("undo")}
                  type="button"
                >
                  {command.pending ? "Undoing…" : "Undo"}
                </button>
                <button
                  data-testid="engine-save"
                  aria-busy={command.pending || undefined}
                  disabled={disabled || command.pending || pendingOperations === 0}
                  onClick={() => void runAction("save")}
                  type="button"
                >
                  {command.pending ? "Saving to host…" : "Save to host"}
                </button>
              </div>
            </fieldset>
            <fieldset>
              <legend>Drawing path</legend>
              <div className="sw-engine-controls__actions">
                <div
                  aria-label="Drawing path"
                  className="sw-engine-renderer"
                  data-testid="engine-renderer"
                  role="radiogroup"
                >
                  {(["canvas", "worker"] as const).map((renderer) => (
                    <label key={renderer}>
                      <input
                        checked={requestedRenderer === renderer}
                        data-testid={`engine-renderer-${renderer}`}
                        disabled={disabled}
                        name="engine-renderer"
                        onChange={() => scenarioRef.current?.requestRenderer(renderer)}
                        type="radio"
                        value={renderer}
                      />
                      <span>{renderer === "canvas" ? "Main canvas" : "Worker canvas"}</span>
                    </label>
                  ))}
                </div>
                <button
                  data-testid="engine-reset"
                  disabled={(!ready && error === null) || command.pending}
                  aria-busy={(!ready && error === null) || undefined}
                  onClick={(event) => {
                    if (!isRepeatClick(event)) reset();
                  }}
                  type="button"
                >
                  {!ready && error === null ? "Resetting…" : "Reset"}
                </button>
              </div>
            </fieldset>
          </section>

          <section className="sw-engine-rewrite" aria-label="Formula rewrite">
            <div>
              <span className="sw-engine__eyebrow">SAME READS, NEW CONSTANT</span>
              <p>
                Rewrite the forecast formula in {ENGINE_COLUMN_LETTER.forecast}
                {rowLabel} from <code>=${offScreenRead}</code> to{" "}
                <code>
                  =${offScreenRead}*{ENGINE_FORECAST_UPSIDE}
                </code>
                . It keeps reading {offScreenRead}, so the engine reuses its dependency index.
              </p>
            </div>
            <button
              data-testid="engine-rewrite"
              aria-busy={command.pending || undefined}
              disabled={disabled || command.pending}
              onClick={() =>
                void command.run(
                  rewriteFormula,
                  (cause) => `Cannot update the formula: ${String(cause)}. Try again.`,
                )
              }
              type="button"
            >
              {command.pending ? "Updating formula…" : "Apply the +2% scenario"}
            </button>
            <output data-testid="engine-rewrite-duration" data-empty={rewriteDuration === null}>
              {rewriteDuration === null ? (
                "Not measured"
              ) : (
                <>
                  {rewriteDuration.toFixed(2)} <span>ms / one-cell transaction</span>
                </>
              )}
            </output>
          </section>

          <p aria-live="polite" className="sw-engine-status" data-testid="engine-status">
            {status}
          </p>

          {latestFormula && (
            <section className="sw-engine-results" aria-label="Observed formula results">
              <header>
                <p className="sw-engine__eyebrow">The change reached these formulas</p>
                <span>
                  {latestSave
                    ? `Host version ${latestSave.version} · ${latestSave.status}`
                    : "Not saved to the host yet"}
                </span>
              </header>
              <ol
                aria-label="Recalculated formula dependencies"
                className="sw-engine-dependency"
                data-action={latestFormula.action}
                data-testid="engine-dependency-readout"
              >
                {latestFormula.dependencies.map((dependency) => {
                  const loaded =
                    dependency.before !== ENGINE_LOADING_MARKER &&
                    dependency.after !== ENGINE_LOADING_MARKER;
                  const changed = loaded && dependency.before !== dependency.after;
                  return (
                    <li
                      data-address={dependency.address}
                      data-changed={changed}
                      data-loaded={loaded}
                      key={dependency.address}
                    >
                      <span>
                        {dependency.address} <small>{dependency.label}</small>
                      </span>
                      <strong>
                        {loaded
                          ? `${formatEngineValue(dependency.kind, dependency.before)} → ${formatEngineValue(dependency.kind, dependency.after)}`
                          : "Not loaded in this window"}
                      </strong>
                      <code>{dependency.formula}</code>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </section>
        <p className="sw-engine-method">
          Measured here, not a benchmark claim. The datasource and host are local to this page. A
          paint checkpoint observes two browser animation frames; it is not a Grid renderer
          acknowledgement. Paging stays bounded by a 2 MiB cache and the Grid's formula-read
          prefetch limit. Local page deliveries yield to the browser between arrivals so
          recalculation does not block scrolling.
        </p>
      </main>
    </div>
  );
}
