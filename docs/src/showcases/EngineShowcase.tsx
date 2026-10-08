import type { Grid } from "@sheetwrite/core";
import { createGrid, initSheetwrite } from "@sheetwrite/core";
import workerRendererUrl from "@sheetwrite/core/worker?worker&url";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { SiteTopbar } from "../components/SiteTopbar.js";
import { CapabilityHero } from "./CapabilityHero.js";
import {
  bindEngineEvents,
  createEngineHostSaver,
  createEngineLiveDataSource,
  createEngineLiveWorkbook,
  createEngineTrace,
  ENGINE_ACCOUNT_ROWS,
  ENGINE_ACTUAL_ADJUSTMENT,
  ENGINE_COLUMN_INDEX,
  ENGINE_COLUMN_LETTER,
  ENGINE_FORECAST_UPSIDE,
  ENGINE_LIVE_ROWS,
  ENGINE_LIVE_SHEET,
  ENGINE_LIVE_STORAGE,
  ENGINE_LOADING_MARKER,
  ENGINE_PLAN_COLUMN,
  ENGINE_PLAN_KEY,
  ENGINE_TRACE_LIMIT,
  type EngineAction,
  type EngineColumnBand,
  type EngineEvent,
  type EngineEventBindings,
  type EngineEventInput,
  type EngineHostSaver,
  type EngineRenderer,
  type EngineTrace,
  engineAccountTotalRow,
  engineLiveTheme,
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

/** The four measured steps of one change-to-acknowledgement run. */
const FOLLOW_STEPS = [
  "Requested page + off-screen band",
  "Recalculation down the chain",
  "Browser paint checkpoint",
  "Host acknowledgement",
] as const;

function carriesPlanBand(columns: readonly EngineColumnBand[]): boolean {
  return columns.some((band) => band.keys.includes(ENGINE_PLAN_KEY));
}

function nextEngineFrame(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      cancelAnimationFrame(frame);
      reject(signal.reason);
    };
    const frame = requestAnimationFrame(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export default function EngineShowcase() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const bindingsRef = useRef<EngineEventBindings | null>(null);
  const currentRowRef = useRef(1);
  const jumpInputRef = useRef("24001");
  const requestedRendererRef = useRef<EngineRenderer>("canvas");
  const mountedRef = useRef(true);
  const passiveTraceTimerRef = useRef<number | null>(null);
  const followControllerRef = useRef<AbortController | null>(null);
  const followAnchorRef = useRef(24_000);
  const planRequestRef = useRef<Extract<EngineEvent, { type: "datasource-request" }> | null>(null);

  // One trace and one host boundary live as long as the page does.
  const [trace] = useState<EngineTrace>(createEngineTrace);
  const [saver] = useState<EngineHostSaver>(createEngineHostSaver);

  const [events, setEvents] = useState<readonly EngineEvent[]>([]);
  const [requestedRenderer, setRequestedRenderer] = useState<EngineRenderer>("canvas");
  const [activeRenderer, setActiveRenderer] = useState<EngineRenderer>("canvas");
  const [rendererFallback, setRendererFallback] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingOperations, setPendingOperations] = useState(0);
  const [jumpInput, setJumpInput] = useState("24001");
  const [currentRow, setCurrentRow] = useState(1);
  const [status, setStatus] = useState("Starting the calculation engine…");
  const [following, setFollowing] = useState(false);
  const [followDuration, setFollowDuration] = useState<number | null>(null);
  const [followSteps, setFollowSteps] = useState<readonly number[] | null>(null);
  const [rewriteDuration, setRewriteDuration] = useState<number | null>(null);

  const emit = useCallback(
    (input: EngineEventInput) => {
      const event = trace.push(input);
      if (event.type === "renderer") {
        setActiveRenderer(event.active);
        setRendererFallback(event.fallback);
      }
      if (
        event.type === "datasource-request" &&
        carriesPlanBand(event.columns) &&
        currentRowRef.current >= event.start &&
        currentRowRef.current < event.end
      ) {
        planRequestRef.current = event;
      }
      const passiveViewportEvent =
        event.type === "visible-window" ||
        event.type === "datasource-request" ||
        event.type === "datasource-result" ||
        (event.type === "page-resource" && event.reason === "load");
      if (passiveViewportEvent) {
        if (passiveTraceTimerRef.current !== null) {
          window.clearTimeout(passiveTraceTimerRef.current);
        }
        passiveTraceTimerRef.current = window.setTimeout(() => {
          passiveTraceTimerRef.current = null;
          if (mountedRef.current) setEvents(trace.snapshot());
        }, 120);
        return;
      }
      if (passiveTraceTimerRef.current !== null) {
        window.clearTimeout(passiveTraceTimerRef.current);
        passiveTraceTimerRef.current = null;
      }
      setEvents(trace.snapshot());
    },
    [trace],
  );

  useEffect(() => {
    requestedRendererRef.current = requestedRenderer;
  }, [requestedRenderer]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      followControllerRef.current?.abort();
      if (passiveTraceTimerRef.current !== null) {
        window.clearTimeout(passiveTraceTimerRef.current);
        passiveTraceTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.dataset.generation = String(generation);
    let disposed = false;
    let grid: Grid | null = null;
    let bindings: EngineEventBindings | null = null;
    let loadResourceTimer: number | null = null;
    setReady(false);
    setError(null);
    setRendererFallback(null);
    setStatus("Starting the calculation engine…");

    void initSheetwrite()
      .then(() => {
        if (disposed) return;
        const renderer = requestedRenderer;
        const theme = engineLiveTheme("dark");
        host.dataset.gridTheme = "dark";
        host.style.backgroundColor = theme.bg ?? "";
        grid = createGrid(host, {
          workbook: createEngineLiveWorkbook(),
          datasource: createEngineLiveDataSource(emit, () => {
            if (loadResourceTimer !== null) window.clearTimeout(loadResourceTimer);
            loadResourceTimer = window.setTimeout(() => {
              loadResourceTimer = null;
              if (!disposed) bindings?.sampleResource("load", "ingest");
            }, 160);
          }),
          datasourceStorage: ENGINE_LIVE_STORAGE,
          theme,
          config: { toolbar: false, tabs: false },
          renderer,
          ...(renderer === "worker" ? { workerUrl: workerRendererUrl } : {}),
        });
        grid.setFrozen(1, window.matchMedia("(max-width: 48rem)").matches ? 0 : 2);
        grid.setSelection({
          kind: "cell",
          addr: {
            sheet: ENGINE_LIVE_SHEET,
            row: currentRowRef.current,
            col: ENGINE_COLUMN_INDEX.actual,
          },
        });
        bindings = bindEngineEvents(grid, emit, setPendingOperations);
        gridRef.current = grid;
        bindingsRef.current = bindings;
        bindings.announceRenderer(
          renderer,
          renderer === "worker" && grid.rendererKind() !== "worker"
            ? "Worker drawing was unavailable during startup."
            : null,
        );
        setReady(true);
        setStatus(
          `Live sheet ready. ${ENGINE_LIVE_ROWS.toLocaleString()} rows stay paged; only requested rows are loaded.`,
        );
      })
      .catch((cause: unknown) => {
        if (disposed) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
        setStatus(`The calculation engine could not start: ${message}`);
      });

    return () => {
      disposed = true;
      followControllerRef.current?.abort();
      setReady(false);
      if (loadResourceTimer !== null) {
        window.clearTimeout(loadResourceTimer);
        loadResourceTimer = null;
      }
      bindings?.dispose();
      if (bindingsRef.current === bindings) bindingsRef.current = null;
      if (gridRef.current === grid) gridRef.current = null;
      grid?.destroy();
    };
  }, [emit, generation, requestedRenderer]);

  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 48rem)");
    const updateFrozenColumns = () => gridRef.current?.setFrozen(1, viewport.matches ? 0 : 2);
    viewport.addEventListener("change", updateFrozenColumns);
    return () => viewport.removeEventListener("change", updateFrozenColumns);
  }, []);

  const runAction = useCallback(
    async (action: EngineAction, rowOverride?: number) => {
      const grid = gridRef.current;
      const bindings = bindingsRef.current;
      if (!grid || !bindings) return;

      switch (action) {
        case "jump": {
          const raw =
            rowOverride === undefined ? jumpInputRef.current.trim() : String(rowOverride + 1);
          if (!/^\d+$/.test(raw)) {
            setStatus(`Enter a whole row from 1 to ${ENGINE_LIVE_ROWS.toLocaleString()}.`);
            return;
          }
          const requested = Number(raw);
          if (!Number.isSafeInteger(requested) || requested < 1 || requested > ENGINE_LIVE_ROWS) {
            setStatus(`Enter a whole row from 1 to ${ENGINE_LIVE_ROWS.toLocaleString()}.`);
            return;
          }
          const row = requested - 1;
          grid.scrollToCell({ sheet: ENGINE_LIVE_SHEET, row, col: ENGINE_COLUMN_INDEX.actual });
          grid.setSelection({
            kind: "cell",
            addr: { sheet: ENGINE_LIVE_SHEET, row, col: ENGINE_COLUMN_INDEX.actual },
          });
          currentRowRef.current = row;
          jumpInputRef.current = String(requested);
          setCurrentRow(row);
          setJumpInput(String(requested));
          bindings.sampleResource("jump", "scroll");
          setStatus(
            `Grid moved to row ${requested.toLocaleString()}; its page is loading if needed.`,
          );
          return;
        }
        case "edit": {
          const row = currentRowRef.current;
          const address = { sheet: ENGINE_LIVE_SHEET, row, col: ENGINE_COLUMN_INDEX.actual };
          const current = grid.store.getCell(address).resolved;
          if (
            typeof current !== "number" ||
            row === 0 ||
            row >= ENGINE_LIVE_ROWS - 1 ||
            (row - 1) % ENGINE_ACCOUNT_ROWS === ENGINE_ACCOUNT_ROWS - 1
          ) {
            bindings.announceResult("edit", "noop");
            setStatus("Select a loaded financial data row before editing Actual.");
            return;
          }
          const before = bindings.dependencySnapshot(row);
          const result = grid.applyTransaction({
            patches: [
              {
                op: "set",
                addr: address,
                value: { kind: "literal", value: current + ENGINE_ACTUAL_ADJUSTMENT },
              },
            ],
          });
          if (result.status === "applied") {
            bindings.announceDependencies("edit", row, before);
            grid.scrollToCell({
              sheet: ENGINE_LIVE_SHEET,
              row,
              col: ENGINE_COLUMN_INDEX.variance,
            });
            grid.setSelection({
              kind: "range",
              range: {
                sheet: ENGINE_LIVE_SHEET,
                start: { row, col: ENGINE_COLUMN_INDEX.variance },
                end: { row, col: ENGINE_COLUMN_INDEX.attainment },
              },
            });
          } else {
            bindings.announceResult("edit", result.status);
          }
          setStatus(
            result.status === "applied"
              ? `Actual C${row + 1} increased by $1,250. Variance, attainment and the account's annual totals followed.`
              : `The edit returned ${result.status}.`,
          );
          return;
        }
        case "undo": {
          if (grid.getCommandState("undo").disabled) {
            bindings.announceResult("undo", "noop");
            setStatus("There is no Grid edit to undo.");
            return;
          }
          const row = currentRowRef.current;
          const before = bindings.dependencySnapshot(row);
          grid.undo();
          bindings.announceDependencies("undo", row, before);
          grid.setSelection({
            kind: "range",
            range: {
              sheet: ENGINE_LIVE_SHEET,
              start: { row, col: ENGINE_COLUMN_INDEX.variance },
              end: { row, col: ENGINE_COLUMN_INDEX.attainment },
            },
          });
          setStatus(`The Grid undid the edit; E${row + 1}:F${row + 1} show restored results.`);
          return;
        }
        case "save": {
          const operations = bindings.pendingOperations();
          if (operations.length === 0) {
            setStatus("The host has no new Grid changes to save.");
            return;
          }
          const response = await saver.commit(operations);
          if (!mountedRef.current || bindingsRef.current !== bindings) return;
          bindings.acknowledgeHost(response, operations);
          const version =
            response.status === "conflict" ? response.currentVersion : response.version;
          setStatus(
            `The host acknowledged ${operations.length} change${operations.length === 1 ? "" : "s"} at version ${version}.`,
          );
          return;
        }
        case "renderer": {
          const next = grid.rendererKind() === "canvas" ? "worker" : "canvas";
          requestedRendererRef.current = next;
          setRequestedRenderer(next);
          return;
        }
      }
    },
    [saver],
  );

  const followChange = useCallback(async () => {
    const grid = gridRef.current;
    if (!grid || followControllerRef.current) return;
    const controller = new AbortController();
    followControllerRef.current = controller;
    const startedAt = performance.now();
    let loadedAt = startedAt;
    let recalculatedAt = startedAt;
    let paintedAt = startedAt;
    const anchor = followAnchorRef.current;
    followAnchorRef.current = anchor === 24_000 ? 40_000 : 24_000;
    const totalRow = engineAccountTotalRow(anchor);
    setFollowing(true);
    setFollowDuration(null);
    setFollowSteps(null);
    try {
      await runAction("jump", anchor);
      // The annual total sits twelve rows below the account's first month. Scrolling there
      // keeps the whole account, its annual formulas, and the plan band in one window.
      grid.scrollToCell({
        sheet: ENGINE_LIVE_SHEET,
        row: totalRow,
        col: ENGINE_COLUMN_INDEX.actual,
      });
      const requiredCells = [
        { row: anchor, col: ENGINE_COLUMN_INDEX.actual },
        { row: anchor, col: ENGINE_COLUMN_INDEX.forecast },
        { row: anchor, col: ENGINE_COLUMN_INDEX.variance },
        { row: anchor, col: ENGINE_COLUMN_INDEX.attainment },
        { row: totalRow, col: ENGINE_COLUMN_INDEX.actual },
        { row: totalRow, col: ENGINE_COLUMN_INDEX.forecast },
        { row: totalRow, col: ENGINE_COLUMN_INDEX.variance },
        { row: totalRow, col: ENGINE_COLUMN_INDEX.attainment },
      ];
      while (
        !requiredCells.every(
          (cell) =>
            typeof grid.store.getCell({ sheet: ENGINE_LIVE_SHEET, ...cell }).resolved === "number",
        )
      ) {
        if (performance.now() - startedAt > 8_000)
          throw new Error("The requested forecast page did not settle.");
        await nextEngineFrame(controller.signal);
      }
      controller.signal.throwIfAborted();
      loadedAt = performance.now();
      await runAction("edit");
      grid.refresh();
      recalculatedAt = performance.now();
      const paintStartedAt = performance.now();
      await nextEngineFrame(controller.signal);
      await nextEngineFrame(controller.signal);
      emit({ type: "browser-frame", durationMs: performance.now() - paintStartedAt });
      paintedAt = performance.now();
      await runAction("save");
      controller.signal.throwIfAborted();
      const finishedAt = performance.now();
      setFollowSteps([
        loadedAt - startedAt,
        recalculatedAt - loadedAt,
        paintedAt - recalculatedAt,
        finishedAt - paintedAt,
      ]);
      setFollowDuration(finishedAt - startedAt);
    } catch (cause) {
      if (!controller.signal.aborted && mountedRef.current) {
        setStatus(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (followControllerRef.current === controller) {
        followControllerRef.current = null;
        if (mountedRef.current) setFollowing(false);
      }
    }
  }, [emit, runAction]);

  const rewriteFormula = useCallback(() => {
    const grid = gridRef.current;
    const row = currentRowRef.current;
    if (
      !grid ||
      row === 0 ||
      row >= ENGINE_LIVE_ROWS - 1 ||
      (row - 1) % ENGINE_ACCOUNT_ROWS === ENGINE_ACCOUNT_ROWS - 1
    ) {
      setStatus("Choose a monthly row before you rewrite its forecast formula.");
      return;
    }
    const address = { sheet: ENGINE_LIVE_SHEET, row, col: ENGINE_COLUMN_INDEX.forecast };
    const base = `=${ENGINE_PLAN_COLUMN}${row + 1}`;
    const scenario = `${base}*${ENGINE_FORECAST_UPSIDE}`;
    const current = grid.store.getFormula(address);
    if (current !== base && current !== scenario) {
      setStatus("This row no longer holds the plan formula. Undo or reset it first.");
      return;
    }
    const src = current === scenario ? base : scenario;
    const before = bindingsRef.current?.dependencySnapshot(row);
    const startedAt = performance.now();
    const result = grid.applyTransaction({
      patches: [{ op: "set", addr: address, value: { kind: "formula", src } }],
    });
    const durationMs = performance.now() - startedAt;
    if (result.status === "applied") {
      if (before) bindingsRef.current?.announceDependencies("edit", row, before);
      emit({ type: "formula-rewrite", address: `D${row + 1}`, formula: src, durationMs });
      setRewriteDuration(durationMs);
      setStatus(
        `D${row + 1} is now ${src}. It reads the same cell (${ENGINE_PLAN_COLUMN}${row + 1}); this one-cell browser transaction took ${durationMs.toFixed(2)} ms.`,
      );
    } else {
      setStatus(`The formula rewrite returned ${result.status}.`);
    }
  }, [emit]);

  const reset = useCallback(() => {
    followControllerRef.current?.abort();
    followControllerRef.current = null;
    planRequestRef.current = null;
    setFollowing(false);
    setFollowDuration(null);
    setFollowSteps(null);
    setRewriteDuration(null);
    trace.clear();
    saver.reset();
    followAnchorRef.current = 24_000;
    currentRowRef.current = 1;
    jumpInputRef.current = "24001";
    requestedRendererRef.current = "canvas";
    setEvents([]);
    setPendingOperations(0);
    setCurrentRow(1);
    setJumpInput("24001");
    setRequestedRenderer("canvas");
    setGeneration((value) => value + 1);
  }, [trace, saver]);

  useEffect(() => {
    const handle: EngineShowcaseHandle = {
      grid: () => gridRef.current,
      run: (action) => runAction(action),
      reset,
      traceLength: () => trace.size,
    };
    window.__sheetwriteEngineShowcase = handle;
    return () => {
      if (window.__sheetwriteEngineShowcase === handle) {
        delete window.__sheetwriteEngineShowcase;
      }
    };
  }, [reset, runAction, trace]);

  const latestFormula = eventOfType(events, "formula-update");
  const latestResource = eventOfType(events, "page-resource");
  const latestSave = eventOfType(events, "host-save");
  const planRequest = planRequestRef.current;
  const rowLabel = currentRow + 1;
  const varianceValue = gridRef.current?.store.getCell({
    sheet: ENGINE_LIVE_SHEET,
    row: currentRow,
    col: ENGINE_COLUMN_INDEX.variance,
  }).resolved;
  const varianceFormula = gridRef.current?.store.getFormula({
    sheet: ENGINE_LIVE_SHEET,
    row: currentRow,
    col: ENGINE_COLUMN_INDEX.variance,
  });
  const forecast = gridRef.current?.store.getCell({
    sheet: ENGINE_LIVE_SHEET,
    row: currentRow,
    col: ENGINE_COLUMN_INDEX.forecast,
  }).resolved;
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
              recalculation, the paint checkpoint and the host acknowledgement. In 0.5.0, visible
              formulas also load the far-right Plan column they read.{" "}
              <Link to="/showcases/">Browse every live feature →</Link>
            </>
          }
          eyebrow="CAPABILITY / LIVE ENGINE"
          facts={[
            { label: "Ledger", value: "50,000 rows" },
            { label: "Accounts", value: "3,846 / four regions" },
            { label: "New in 0.5.0", value: "Off-screen formula reads" },
            { label: "Evidence", value: "Measured in your browser" },
          ]}
          title="One change. Watch the whole Grid follow."
        />

        <section
          aria-labelledby="engine-stage-title"
          className="sw-engine-stage"
          data-running={following}
        >
          <header className="sw-engine-stage__head">
            <div className="sw-engine-stage__intro">
              <p className="sw-engine__eyebrow">FY26 regional forecast · USD</p>
              <h2 id="engine-stage-title">From actual to acknowledgement.</h2>
              <p>
                Monthly revenue for one product line in one region. Variance and attainment are
                formulas, and the annual totals are sums of those rows.
              </p>
            </div>
            <div className="sw-engine-run" data-testid="engine-follow-report">
              <div className="sw-engine-run__total">
                <span>Change → host acknowledgement</span>
                <strong data-testid="engine-follow-duration">
                  {followDuration === null ? "—" : followDuration.toFixed(1)}
                  <small>ms</small>
                </strong>
                <span>
                  {following
                    ? "Following this change…"
                    : followDuration === null
                      ? "Not measured yet"
                      : "Rows + recalc + paint + local host"}
                </span>
              </div>
              <ol aria-label="Measured steps of the last run" className="sw-engine-run__steps">
                {FOLLOW_STEPS.map((step, index) => {
                  const stepMs = followSteps?.[index];
                  return (
                    <li data-testid={`engine-follow-step-${index}`} key={step}>
                      <span>{step}</span>
                      <strong>{stepMs === undefined ? "—" : `${stepMs.toFixed(1)} ms`}</strong>
                    </li>
                  );
                })}
              </ol>
            </div>
            <button
              className="sw-engine-primary"
              data-testid="engine-follow"
              disabled={disabled}
              onClick={() => void followChange()}
              type="button"
            >
              {following ? "Following the change…" : "Change an actual and follow it"}
              <span aria-hidden="true">↗</span>
            </button>
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
                <p className="sw-engine__eyebrow">NEW / 0.5.0 · off-screen formula reads</p>
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
                  {[...events].reverse().map((event) => (
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
                        <time>{event.observedAt.toFixed(1)} ms</time>
                      </div>
                      <p>{formatEngineEvent(event)}</p>
                    </li>
                  ))}
                </ol>
              </div>
              <p className="sw-engine-cutaway__resource">
                Latest {ENGINE_TRACE_LIMIT} observations · clock from page navigation.
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
                <button data-testid="engine-jump" disabled={disabled} type="submit">
                  Jump
                </button>
              </form>
            </fieldset>
            <fieldset>
              <legend>Change inputs</legend>
              <div className="sw-engine-controls__actions">
                <button
                  data-testid="engine-edit"
                  disabled={disabled}
                  onClick={() => void runAction("edit")}
                  type="button"
                >
                  Actual +$1,250
                </button>
                <button
                  data-testid="engine-undo"
                  disabled={disabled}
                  onClick={() => void runAction("undo")}
                  type="button"
                >
                  Undo
                </button>
                <button
                  data-testid="engine-save"
                  disabled={disabled || pendingOperations === 0}
                  onClick={() => void runAction("save")}
                  type="button"
                >
                  Save to host
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
                        onChange={() => {
                          requestedRendererRef.current = renderer;
                          setRequestedRenderer(renderer);
                        }}
                        type="radio"
                        value={renderer}
                      />
                      <span>{renderer === "canvas" ? "Main canvas" : "Worker canvas"}</span>
                    </label>
                  ))}
                </div>
                <button data-testid="engine-reset" onClick={reset} type="button">
                  Reset
                </button>
              </div>
            </fieldset>
          </section>

          <section className="sw-engine-rewrite" aria-label="Formula rewrite in Sheetwrite 0.5.0">
            <div>
              <span className="sw-engine__eyebrow">NEW / 0.5.0 · same reads, new constant</span>
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
              disabled={disabled}
              onClick={rewriteFormula}
              type="button"
            >
              Apply the +2% scenario
            </button>
            <output data-testid="engine-rewrite-duration">
              {rewriteDuration === null ? "—" : rewriteDuration.toFixed(2)}{" "}
              <span>ms / one-cell transaction</span>
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
