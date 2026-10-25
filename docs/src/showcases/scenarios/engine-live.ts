import { cellA1 } from "@sheetwrite/core";
import type {
  ChangeEvent,
  DataSource,
  DocumentOp,
  Grid,
  PersistenceCommitRequest,
  PersistenceCommitResponse,
  RuntimeResourceOperation,
  Theme,
} from "@sheetwrite/core";
import { SheetwriteStore } from "@sheetwrite/core";
import { createGrid, initSheetwrite } from "@sheetwrite/core";

import { errorText } from "../../lib/errors.js";
import { formatBytes } from "../../lib/format.js";
import {
  createEngineLiveWorkbook,
  ENGINE_ACCOUNT_ROWS,
  ENGINE_ACTUAL_ADJUSTMENT,
  ENGINE_FORECAST_UPSIDE,
  ENGINE_LIVE_ROWS,
  ENGINE_LIVE_STORAGE,
  ENGINE_PLAN_COLUMN,
  ENGINE_PLAN_KEY,
  ENGINE_COLUMN_INDEX,
  ENGINE_LIVE_SHEET,
  type EngineColumnBand,
  engineAccountTotalRow,
  engineLiveRow,
} from "./engine-live-data.js";

export const ENGINE_TRACE_LIMIT = 40;
export const ENGINE_PENDING_LIMIT = 16;

/** What the engine resolves a cell to while its page has not arrived. */
export const ENGINE_LOADING_MARKER = "#LOADING!";

const ENGINE_THEME_BASE = {
  font: '500 13px "Inter Variable", Inter, system-ui, sans-serif',
  rowHeight: 30,
  headerHeight: 32,
  rowHeaderWidth: 48,
} as const;

export function engineLiveTheme(mode: "light" | "dark"): Partial<Theme> {
  return mode === "dark"
    ? {
        ...ENGINE_THEME_BASE,
        bg: "#0d1522",
        fg: "#dce5f3",
        gridLine: "#26364f",
        headerBg: "#121f30",
        headerFg: "#a8b7cd",
        selection: "rgb(52 211 153 / 18%)",
        selectionBorder: "#34d399",
        searchMatch: "rgb(251 191 36 / 24%)",
        searchActiveMatch: "#fbbf24",
        highlight: "rgb(96 165 250 / 24%)",
      }
    : {
        ...ENGINE_THEME_BASE,
        bg: "#fbfcfe",
        fg: "#1b2435",
        gridLine: "#d9e0e9",
        headerBg: "#e9eef5",
        headerFg: "#46546a",
        selection: "rgb(4 120 87 / 14%)",
        selectionBorder: "#047857",
        searchMatch: "rgb(180 83 9 / 18%)",
        searchActiveMatch: "#a34d08",
        highlight: "rgb(37 99 235 / 16%)",
      };
}

export type EngineRenderer = "canvas" | "worker";
export type EngineAction = "jump" | "edit" | "undo" | "save" | "renderer";
export type EngineResourceReason = "load" | "jump" | "edit" | "undo" | "save";

const RESOURCE_OPERATION_BY_REASON: Readonly<
  Record<EngineResourceReason, RuntimeResourceOperation>
> = {
  load: "ingest",
  jump: "scroll",
  edit: "formula-recompute",
  undo: "formula-recompute",
  save: "persistence",
};

interface EngineEventBase {
  readonly sequence: number;
  readonly observedAt: number;
}

export type EngineEvent =
  | (EngineEventBase & {
      readonly type: "datasource-request";
      readonly requestId: number;
      readonly start: number;
      readonly end: number;
      readonly columns: readonly EngineColumnBand[];
    })
  | (EngineEventBase & {
      readonly type: "datasource-result";
      readonly requestId: number;
      readonly rows: number;
      readonly durationMs: number;
      readonly columns: readonly EngineColumnBand[];
    })
  | (EngineEventBase & {
      readonly type: "transaction-result";
      readonly action: "edit" | "undo" | "grid-edit";
      readonly status: "applied" | "noop" | "rejected" | "conflict";
      readonly changedCells: number;
      readonly epoch: number | null;
    })
  | (EngineEventBase & {
      readonly type: "page-resource";
      readonly reason: EngineResourceReason;
      readonly loadedCells: number;
      readonly dirtyCells: number;
      readonly pageBytes: number;
      readonly engineBytes: number;
    })
  | (EngineEventBase & {
      readonly type: "formula-update";
      readonly action: "edit" | "undo";
      readonly row: number;
      readonly dependencies: readonly {
        readonly address: string;
        readonly label: string;
        readonly kind: "money" | "percent";
        readonly formula: string;
        readonly before: string | number | boolean | null;
        readonly after: string | number | boolean | null;
      }[];
    })
  | (EngineEventBase & {
      readonly type: "visible-window";
      readonly firstRow: number;
      readonly lastRow: number;
      readonly scrollTop: number;
    })
  | (EngineEventBase & {
      readonly type: "renderer";
      readonly requested: EngineRenderer;
      readonly active: EngineRenderer;
      readonly fallback: string | null;
    })
  | (EngineEventBase & {
      readonly type: "host-save";
      readonly saveId: string;
      readonly status: PersistenceCommitResponse["status"];
      readonly version: number;
      readonly operations: number;
    })
  | (EngineEventBase & {
      readonly type: "browser-frame";
      readonly durationMs: number;
    })
  | (EngineEventBase & {
      readonly type: "formula-rewrite";
      readonly address: string;
      readonly formula: string;
      readonly durationMs: number;
    });

type EngineEventInput = EngineEvent extends infer Event
  ? Event extends EngineEvent
    ? Omit<Event, "sequence" | "observedAt">
    : never
  : never;

interface EngineTrace {
  push(event: EngineEventInput): EngineEvent;
  clear(): void;
  snapshot(): readonly EngineEvent[];
  readonly size: number;
}

/** Scenario-local fixed-size event storage; this is not a core event bus. */
function createEngineTrace(limit = ENGINE_TRACE_LIMIT): EngineTrace {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError("trace limit must be positive");
  const events = new Array<EngineEvent>(limit);
  let sequence = 0;
  let start = 0;
  let size = 0;

  return {
    push(input) {
      sequence += 1;
      const event = { ...input, sequence, observedAt: performance.now() } as EngineEvent;
      const index = (start + size) % limit;
      events[index] = event;
      if (size < limit) {
        size += 1;
      } else {
        start = (start + 1) % limit;
      }
      return event;
    },
    clear() {
      start = 0;
      size = 0;
      events.fill(undefined as never);
    },
    snapshot() {
      return Array.from({ length: size }, (_, index) => events[(start + index) % limit]!);
    },
    get size() {
      return size;
    },
  };
}

function createEngineLiveDataSource(
  emit: (event: EngineEventInput) => void,
  onResult?: () => void,
): DataSource {
  let requestId = 0;
  return {
    capabilities: { protocol: 2, columns: "windowed" },
    async getRows({ protocol, sheet, start, end, columns, signal, revision }) {
      if (protocol !== 2) throw new Error(`Unsupported datasource protocol ${protocol}`);
      requestId += 1;
      const currentRequest = requestId;
      const startedAt = performance.now();
      const requestedColumns = columns;
      emit({
        type: "datasource-request",
        requestId: currentRequest,
        start,
        end,
        columns: requestedColumns,
      });
      if (signal.aborted) {
        throw new DOMException(`Request for ${sheet} was cancelled`, "AbortError");
      }
      // Immediate local replies chain page ingestion and formula recomputation
      // in one microtask checkpoint. Use browser idle tasks to keep page
      // arrivals out of the next scroll/paint frame; no simulated latency.
      const delivery = Promise.withResolvers<void>();
      const useIdleTask = typeof requestIdleCallback === "function";
      const cancel = () => {
        if (useIdleTask && typeof task === "number") cancelIdleCallback(task);
        else clearTimeout(task);
        delivery.reject(new DOMException(`Request for ${sheet} was cancelled`, "AbortError"));
      };
      const deliver = () => {
        signal.removeEventListener("abort", cancel);
        delivery.resolve();
      };
      const task = useIdleTask ? requestIdleCallback(deliver) : setTimeout(deliver, 0);
      signal.addEventListener("abort", cancel, { once: true });
      await delivery.promise;
      if (signal.aborted) {
        throw new DOMException(`Request for ${sheet} was cancelled`, "AbortError");
      }
      const rows = Array.from({ length: end - start }, (_, offset) =>
        engineLiveRow(start + offset, requestedColumns),
      );
      if (signal.aborted) {
        throw new DOMException(`Request for ${sheet} was cancelled`, "AbortError");
      }
      emit({
        type: "datasource-result",
        requestId: currentRequest,
        rows: rows.length,
        durationMs: performance.now() - startedAt,
        columns: requestedColumns,
      });
      queueMicrotask(() => onResult?.());
      return { protocol: 2, start, columns: requestedColumns, rows, revision };
    },
  };
}

function changeAction(change: ChangeEvent): "edit" | "undo" | "grid-edit" {
  if (change.commitReason === "undo") return "undo";
  if (
    change.commitReason === "edit-blur" ||
    change.commitReason === "edit-enter" ||
    change.commitReason === "edit-tab"
  ) {
    return "grid-edit";
  }
  return "edit";
}

function operationKey(operation: DocumentOp, index: number): string {
  if (operation.op === "set") {
    return `${operation.addr.sheet}:${operation.addr.row}:${operation.addr.col}`;
  }
  return `${operation.op}:${index}`;
}

interface EngineDependencySnapshot {
  readonly address: string;
  readonly label: string;
  readonly kind: "money" | "percent";
  readonly formula: string;
  readonly value: string | number | boolean | null;
}

interface EngineEventBindings {
  announceRenderer(requested: EngineRenderer, fallback?: string | null): void;
  announceResult(
    action: "edit" | "undo" | "grid-edit",
    status: "noop" | "rejected" | "conflict",
  ): void;
  dependencySnapshot(row: number): readonly EngineDependencySnapshot[];
  announceDependencies(
    action: "edit" | "undo",
    row: number,
    before: readonly EngineDependencySnapshot[],
  ): void;
  acknowledgeHost(response: PersistenceCommitResponse, operations: readonly DocumentOp[]): void;
  pendingOperations(): readonly DocumentOp[];
  sampleResource(reason: EngineResourceReason, operation?: RuntimeResourceOperation): void;
  dispose(): void;
}

/**
 * Bind public Grid events and measurements to the engine showcase's typed,
 * fixed-size event stream. Explanatory state is emitted only after the Grid
 * event or API result already exists.
 */
function bindEngineEvents(
  grid: Grid,
  emit: (event: EngineEventInput) => void,
  onPendingChange?: (count: number) => void,
): EngineEventBindings {
  const pending = new Map<string, DocumentOp>();
  const unsubscribes: Array<() => void> = [];

  const sampleResource = (
    reason: EngineResourceReason,
    operation: RuntimeResourceOperation = RESOURCE_OPERATION_BY_REASON[reason],
  ) => {
    const page =
      grid.store instanceof SheetwriteStore ? grid.store.getPagedStats(ENGINE_LIVE_SHEET) : null;
    const resource = grid.getRuntimeResourceSnapshot(operation, "settled");
    emit({
      type: "page-resource",
      reason,
      loadedCells: page?.loadedCells ?? 0,
      dirtyCells: page?.dirtyCells ?? 0,
      pageBytes: page?.allocatedBytes ?? 0,
      engineBytes: resource.wasm.allocatedCapacityBytes,
    });
  };

  unsubscribes.push(
    grid.on("change", (change) => {
      change.transaction.patches.forEach((operation, index) => {
        pending.set(operationKey(operation, index), operation);
      });
      while (pending.size > ENGINE_PENDING_LIMIT) {
        const oldest = pending.keys().next().value;
        if (oldest === undefined) break;
        pending.delete(oldest);
      }
      onPendingChange?.(pending.size);
      const action = changeAction(change);
      emit({
        type: "transaction-result",
        action,
        status: "applied",
        changedCells: change.changes.length,
        epoch: change.epoch ?? null,
      });
      sampleResource(action === "undo" ? "undo" : "edit", "formula-recompute");
    }),
    grid.on("renderer-fallback", ({ requested, error }) => {
      emit({
        type: "renderer",
        requested,
        active: grid.rendererKind(),
        fallback: error.message,
      });
    }),
  );

  const dependencySnapshot = (row: number): readonly EngineDependencySnapshot[] => {
    const totalRow = engineAccountTotalRow(row);
    const cells: readonly {
      readonly row: number;
      readonly col: number;
      readonly label: string;
      readonly kind: "money" | "percent";
    }[] = [
      { row, col: ENGINE_COLUMN_INDEX.forecast, label: "Monthly forecast", kind: "money" },
      { row, col: ENGINE_COLUMN_INDEX.variance, label: "Monthly variance", kind: "money" },
      { row, col: ENGINE_COLUMN_INDEX.attainment, label: "Monthly attainment", kind: "percent" },
      { row: totalRow, col: ENGINE_COLUMN_INDEX.forecast, label: "Annual forecast", kind: "money" },
      { row: totalRow, col: ENGINE_COLUMN_INDEX.actual, label: "Annual actual", kind: "money" },
      { row: totalRow, col: ENGINE_COLUMN_INDEX.variance, label: "Annual variance", kind: "money" },
      {
        row: totalRow,
        col: ENGINE_COLUMN_INDEX.attainment,
        label: "Annual attainment",
        kind: "percent",
      },
    ];
    return cells.map(({ row: dependencyRow, col, label, kind }) => {
      const address = { sheet: ENGINE_LIVE_SHEET, row: dependencyRow, col };
      return {
        address: cellA1(dependencyRow, col),
        label,
        kind,
        formula: grid.store.getFormula(address) ?? "",
        value: grid.store.getCell(address).resolved,
      };
    });
  };

  return {
    announceRenderer(requested, fallback = null) {
      emit({ type: "renderer", requested, active: grid.rendererKind(), fallback });
    },
    announceResult(action, status) {
      emit({ type: "transaction-result", action, status, changedCells: 0, epoch: null });
    },
    dependencySnapshot,
    announceDependencies(action, row, before) {
      const after = dependencySnapshot(row);
      const dependencies = after.map((dependency, index) => ({
        address: dependency.address,
        label: dependency.label,
        kind: dependency.kind,
        formula: dependency.formula,
        before: before[index]?.value ?? null,
        after: dependency.value,
      }));
      emit({ type: "formula-update", action, row, dependencies });
    },
    acknowledgeHost(response, operations) {
      if (response.status === "conflict") {
        emit({
          type: "host-save",
          saveId: "conflict",
          status: response.status,
          version: response.currentVersion,
          operations: operations.length,
        });
        return;
      }
      for (const operation of operations) pending.delete(operationKey(operation, 0));
      grid.store.acknowledgeOperations?.(operations, BigInt(response.version));
      onPendingChange?.(pending.size);
      emit({
        type: "host-save",
        saveId: response.clientMutationId,
        status: response.status,
        version: response.version,
        operations: operations.length,
      });
      sampleResource("save", "persistence");
    },
    pendingOperations() {
      return [...pending.values()];
    },
    sampleResource,
    dispose() {
      for (const unsubscribe of unsubscribes) unsubscribe();
      pending.clear();
      onPendingChange?.(0);
    },
  };
}

interface EngineHostSaver {
  commit(operations: readonly DocumentOp[]): Promise<PersistenceCommitResponse>;
  reset(): void;
  readonly version: number;
}

/** Small real host boundary: accepts the exact Grid operations and returns a typed acknowledgement. */
function createEngineHostSaver(): EngineHostSaver {
  let version = 0;
  let saveSequence = 0;
  return {
    async commit(operations) {
      saveSequence += 1;
      const request: PersistenceCommitRequest = {
        documentId: "engine-live",
        baseVersion: version,
        clientMutationId: `engine-save-${saveSequence}`,
        operations,
      };
      version += 1;
      return {
        status: "applied",
        version,
        clientMutationId: request.clientMutationId,
      };
    },
    reset() {
      version = 0;
      saveSequence = 0;
    },
    get version() {
      return version;
    },
  };
}

const engineMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * One rendering for a formula value, shared by the trace and the dependency
 * cards: money as currency, rates as percentages, an empty cell spelled out.
 */
export function formatEngineValue(
  kind: "money" | "percent",
  value: string | number | boolean | null,
): string {
  if (value === null) return "blank";
  if (typeof value !== "number") return String(value);
  return kind === "percent" ? `${(value * 100).toFixed(1)}%` : engineMoney.format(value);
}

export function formatEngineEvent(event: EngineEvent): string {
  switch (event.type) {
    case "datasource-request": {
      const bands = event.columns.map((band) => band.keys.join(", ")).join(" | ") || "none";
      return `Rows requested: ${event.start + 1}–${event.end}; columns ${bands}`;
    }
    case "datasource-result": {
      const bands = event.columns.map((band) => band.keys.join(", ")).join(" | ") || "none";
      return `Rows ready: ${event.rows.toLocaleString()} in ${event.durationMs.toFixed(1)} ms; columns ${bands}`;
    }
    case "transaction-result":
      return `${event.action === "undo" ? "Undo" : "Edit"}: ${event.status}, ${event.changedCells} cell${event.changedCells === 1 ? "" : "s"} changed`;
    case "page-resource":
      return `Page sample: ${event.loadedCells.toLocaleString()} cells loaded, ${event.dirtyCells.toLocaleString()} changed, ${formatBytes(event.pageBytes, { kib: 1, mib: 2 })} kept in pages, ${formatBytes(event.engineBytes, { kib: 1, mib: 2 })} in the calculation engine`;
    case "formula-update": {
      const changed = event.dependencies.filter(
        (dependency) => dependency.before !== dependency.after,
      );
      const summary =
        changed.length === 0
          ? "no value changed"
          : changed
              .map(
                (dependency) =>
                  `${dependency.address} ${dependency.label.toLowerCase()} ${formatEngineValue(dependency.kind, dependency.before)} → ${formatEngineValue(dependency.kind, dependency.after)}`,
              )
              .join("; ");
      return `${event.action === "undo" ? "Undo reached" : "Recalculation reached"} ${summary}`;
    }
    case "visible-window":
      return `Visible rows: ${event.firstRow + 1}–${event.lastRow + 1}`;
    case "renderer":
      return event.fallback
        ? `Drawing: ${event.requested} requested, ${event.active} active (${event.fallback})`
        : `Drawing: ${event.active} active`;
    case "host-save":
      return `Host save: ${event.status} at version ${event.version}, ${event.operations} change${event.operations === 1 ? "" : "s"}`;
    case "browser-frame":
      return `Browser paint checkpoint after ${event.durationMs.toFixed(1)} ms; two animation frames, not a renderer acknowledgement`;
    case "formula-rewrite":
      return `${event.address} is now ${event.formula}; its reads did not change, and the one-cell transaction took ${event.durationMs.toFixed(2)} ms`;
  }
}

/** Region, the column left of Actual: phones start with it at the left edge. */
const REGION_COLUMN = ENGINE_COLUMN_INDEX.actual - 1;

function carriesPlanBand(columns: readonly EngineColumnBand[]): boolean {
  return columns.some((band) => band.keys.includes(ENGINE_PLAN_KEY));
}

function nextEngineFrame(signal: AbortSignal): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  if (signal.aborted) {
    reject(signal.reason);
    return promise;
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
  return promise;
}

export interface EngineScenarioSnapshot {
  readonly events: readonly EngineEvent[];
  readonly requestedRenderer: EngineRenderer;
  readonly activeRenderer: EngineRenderer;
  readonly rendererFallback: string | null;
  readonly ready: boolean;
  readonly error: string | null;
  readonly pendingOperations: number;
  readonly currentRow: number;
  readonly status: string;
  readonly following: boolean;
  readonly followDuration: number | null;
  readonly followSteps: readonly number[] | null;
  readonly rewriteDuration: number | null;
  readonly planRequest: Extract<EngineEvent, { type: "datasource-request" }> | null;
  readonly varianceValue: string | number | boolean | null;
  readonly varianceFormula: string | null;
  readonly forecast: string | number | boolean | null;
}

/** Owns the live story and its ordering; React only subscribes and presents it. */
export function createEngineScenario(
  host: HTMLElement,
  options: { workerUrl: string; narrow?: () => boolean; renderer?: EngineRenderer },
): EngineScenario {
  const trace = createEngineTrace();
  const saver = createEngineHostSaver();
  const listeners = new Set<() => void>();
  let state: EngineScenarioSnapshot = {
    events: [],
    requestedRenderer: options.renderer ?? "canvas",
    activeRenderer: "canvas",
    rendererFallback: null,
    ready: false,
    error: null,
    pendingOperations: 0,
    currentRow: 1,
    status: "Starting the calculation engine…",
    following: false,
    followDuration: null,
    followSteps: null,
    rewriteDuration: null,
    planRequest: null,
    varianceValue: null,
    varianceFormula: null,
    forecast: null,
  };
  let grid: Grid | null = null;
  let bindings: EngineEventBindings | null = null;
  let disposed = false;
  let generation = 0;
  let passiveTraceTimer: number | null = null;
  let loadResourceTimer: number | null = null;
  let followController: AbortController | null = null;
  let followAnchor = 24_000;
  let jumpInput = "24001";
  function set<K extends keyof EngineScenarioSnapshot>(key: K, value: EngineScenarioSnapshot[K]) {
    state = { ...state, [key]: value };
    for (const listener of listeners) listener();
  }
  function emit(input: EngineEventInput) {
    if (disposed) return;
    const event = trace.push(input);
    if (event.type === "renderer") {
      set("activeRenderer", event.active);
      set("rendererFallback", event.fallback);
    }
    if (
      event.type === "datasource-request" &&
      carriesPlanBand(event.columns) &&
      state.currentRow >= event.start &&
      state.currentRow < event.end
    ) {
      state = { ...state, planRequest: event };
    }
    const passiveViewportEvent =
      event.type === "visible-window" ||
      event.type === "datasource-request" ||
      event.type === "datasource-result" ||
      (event.type === "page-resource" && event.reason === "load");
    if (passiveViewportEvent) {
      if (passiveTraceTimer !== null) {
        window.clearTimeout(passiveTraceTimer);
      }
      passiveTraceTimer = window.setTimeout(() => {
        passiveTraceTimer = null;
        if (!disposed) set("events", trace.snapshot());
      }, 120);
      return;
    }
    if (passiveTraceTimer !== null) {
      window.clearTimeout(passiveTraceTimer);
      passiveTraceTimer = null;
    }
    set("events", trace.snapshot());
  }
  function stop() {
    generation += 1;
    followController?.abort();
    followController = null;
    if (loadResourceTimer !== null) window.clearTimeout(loadResourceTimer);
    loadResourceTimer = null;
    if (passiveTraceTimer !== null) window.clearTimeout(passiveTraceTimer);
    passiveTraceTimer = null;
    bindings?.dispose();
    bindings = null;
    grid?.destroy();
    grid = null;
  }
  function start() {
    stop();
    const token = generation;
    host.dataset.generation = String(token);
    set("ready", false);
    set("following", false);
    set("error", null);
    set("rendererFallback", null);
    set("status", "Starting the calculation engine…");
    void initSheetwrite()
      .then(() => {
        if (disposed || token !== generation) return;
        const renderer = state.requestedRenderer;
        const theme = engineLiveTheme("dark");
        host.dataset.gridTheme = "dark";
        host.style.backgroundColor = theme.bg ?? "";
        grid = createGrid(host, {
          workbook: createEngineLiveWorkbook(),
          datasource: createEngineLiveDataSource(
            (event) => {
              if (!disposed && token === generation) emit(event);
            },
            () => {
              if (disposed || token !== generation) return;
              if (loadResourceTimer !== null) window.clearTimeout(loadResourceTimer);
              loadResourceTimer = window.setTimeout(() => {
                loadResourceTimer = null;
                if (!disposed && token === generation) bindings?.sampleResource("load", "ingest");
              }, 160);
            },
          ),
          datasourceStorage: ENGINE_LIVE_STORAGE,
          theme,
          config: {
            toolbar: false,
            tabs: false,
            contextMenu: [
              { action: "copy", label: "Copy engine value" },
              {
                label: "Return to first data row",
                onClick(instance) {
                  const addr = {
                    sheet: ENGINE_LIVE_SHEET,
                    row: 1,
                    col: ENGINE_COLUMN_INDEX.actual,
                  };
                  instance.setSelection({ kind: "cell", addr });
                  instance.scrollToCell(addr);
                },
              },
            ],
          },
          renderer,
          ...(renderer === "worker" ? { workerUrl: options.workerUrl } : {}),
        });
        const narrow = options.narrow?.() ?? false;
        grid.setFrozen(1, narrow ? 0 : 2);
        const actualCell = {
          sheet: ENGINE_LIVE_SHEET,
          row: state.currentRow,
          col: ENGINE_COLUMN_INDEX.actual,
        };
        grid.setSelection({ kind: "cell", addr: actualCell });
        // Without frozen columns a phone shows only Month and Region; the demo
        // is about Actual. scrollToCell moves as little as it can, and only a
        // move to the left aligns a column with the left edge: scrolling past
        // Region to Forecast and back puts Region at the edge and Actual fully
        // in view, with no column cut in half.
        if (narrow) {
          grid.scrollToCell({ ...actualCell, col: ENGINE_COLUMN_INDEX.forecast });
          grid.scrollToCell({ ...actualCell, col: REGION_COLUMN });
        }
        bindings = bindEngineEvents(grid, emit, (count) => set("pendingOperations", count));

        bindings.announceRenderer(
          renderer,
          renderer === "worker" && grid.rendererKind() !== "worker"
            ? "Worker drawing was unavailable during startup."
            : null,
        );
        set("ready", true);
        set(
          "status",
          `Live sheet ready. ${ENGINE_LIVE_ROWS.toLocaleString()} rows stay paged; only requested rows are loaded.`,
        );
      })
      .catch((cause: unknown) => {
        if (disposed || token !== generation) return;
        const message = errorText(cause);
        set("error", message);
        set("status", `The calculation engine could not start: ${message}`);
      });
  }
  async function executeAction(action: EngineAction, rowInput?: string) {
    const activeGrid = grid;
    const activeBindings = bindings;
    if (!activeGrid || !activeBindings) return;

    switch (action) {
      case "jump": {
        const raw = rowInput === undefined ? jumpInput.trim() : rowInput.trim();
        if (!/^\d+$/.test(raw)) {
          set("status", `Enter a whole row from 1 to ${ENGINE_LIVE_ROWS.toLocaleString()}.`);
          return;
        }
        const requested = Number(raw);
        if (!Number.isSafeInteger(requested) || requested < 1 || requested > ENGINE_LIVE_ROWS) {
          set("status", `Enter a whole row from 1 to ${ENGINE_LIVE_ROWS.toLocaleString()}.`);
          return;
        }
        const row = requested - 1;
        activeGrid.scrollToCell({ sheet: ENGINE_LIVE_SHEET, row, col: ENGINE_COLUMN_INDEX.actual });
        activeGrid.setSelection({
          kind: "cell",
          addr: { sheet: ENGINE_LIVE_SHEET, row, col: ENGINE_COLUMN_INDEX.actual },
        });

        jumpInput = String(requested);
        set("currentRow", row);

        activeBindings.sampleResource("jump", "scroll");
        set(
          "status",
          `Grid moved to row ${requested.toLocaleString()}; its page is loading if needed.`,
        );
        return;
      }
      case "edit": {
        const row = state.currentRow;
        const address = { sheet: ENGINE_LIVE_SHEET, row, col: ENGINE_COLUMN_INDEX.actual };
        const current = activeGrid.store.getCell(address).resolved;
        if (
          typeof current !== "number" ||
          row === 0 ||
          row >= ENGINE_LIVE_ROWS - 1 ||
          (row - 1) % ENGINE_ACCOUNT_ROWS === ENGINE_ACCOUNT_ROWS - 1
        ) {
          activeBindings.announceResult("edit", "noop");
          set("status", "Select a loaded financial data row before editing Actual.");
          return;
        }
        const before = activeBindings.dependencySnapshot(row);
        const result = activeGrid.applyTransaction({
          patches: [
            {
              op: "set",
              addr: address,
              value: { kind: "literal", value: current + ENGINE_ACTUAL_ADJUSTMENT },
            },
          ],
        });
        if (result.status === "applied") {
          activeBindings.announceDependencies("edit", row, before);
          activeGrid.scrollToCell({
            sheet: ENGINE_LIVE_SHEET,
            row,
            col: ENGINE_COLUMN_INDEX.variance,
          });
          activeGrid.setSelection({
            kind: "range",
            range: {
              sheet: ENGINE_LIVE_SHEET,
              start: { row, col: ENGINE_COLUMN_INDEX.variance },
              end: { row, col: ENGINE_COLUMN_INDEX.attainment },
            },
          });
        } else {
          activeBindings.announceResult("edit", result.status);
        }
        set(
          "status",
          result.status === "applied"
            ? `Actual C${row + 1} increased by $1,250. Variance, attainment and the account's annual totals followed.`
            : `The edit returned ${result.status}.`,
        );
        return;
      }
      case "undo": {
        if (activeGrid.getCommandState("undo").disabled) {
          activeBindings.announceResult("undo", "noop");
          set("status", "There is no Grid edit to undo.");
          return;
        }
        const row = state.currentRow;
        const before = activeBindings.dependencySnapshot(row);
        activeGrid.undo();
        activeBindings.announceDependencies("undo", row, before);
        activeGrid.setSelection({
          kind: "range",
          range: {
            sheet: ENGINE_LIVE_SHEET,
            start: { row, col: ENGINE_COLUMN_INDEX.variance },
            end: { row, col: ENGINE_COLUMN_INDEX.attainment },
          },
        });
        set("status", `The Grid undid the edit; E${row + 1}:F${row + 1} show restored results.`);
        return;
      }
      case "save": {
        const operations = activeBindings.pendingOperations();
        if (operations.length === 0) {
          set("status", "The host has no new Grid changes to save.");
          return;
        }
        const response = await saver.commit(operations);
        if (disposed || bindings !== activeBindings) return;
        activeBindings.acknowledgeHost(response, operations);
        const version = response.status === "conflict" ? response.currentVersion : response.version;
        set(
          "status",
          `The host acknowledged ${operations.length} change${operations.length === 1 ? "" : "s"} at version ${version}.`,
        );
        return;
      }
      case "renderer": {
        const next = activeGrid.rendererKind() === "canvas" ? "worker" : "canvas";

        set("requestedRenderer", next);
        start();
        return;
      }
    }
  }
  async function followChange() {
    const activeGrid = grid;
    if (!activeGrid || followController) return;
    const controller = new AbortController();
    followController = controller;
    const startedAt = performance.now();
    let loadedAt = startedAt;
    let recalculatedAt = startedAt;
    let paintedAt = startedAt;
    const anchor = followAnchor;
    followAnchor = anchor === 24_000 ? 40_000 : 24_000;
    const totalRow = engineAccountTotalRow(anchor);
    set("following", true);
    set("followDuration", null);
    set("followSteps", null);
    try {
      await executeAction("jump", String(anchor + 1));
      controller.signal.throwIfAborted();
      // The annual total sits twelve rows below the account's first month. Scrolling there
      // keeps the whole account, its annual formulas, and the plan band in one window.
      activeGrid.scrollToCell({
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
            typeof activeGrid.store.getCell({ sheet: ENGINE_LIVE_SHEET, ...cell }).resolved ===
            "number",
        )
      ) {
        if (performance.now() - startedAt > 8_000)
          throw new Error("The requested forecast page did not settle.");
        await nextEngineFrame(controller.signal);
      }
      controller.signal.throwIfAborted();
      loadedAt = performance.now();
      await executeAction("edit");
      controller.signal.throwIfAborted();
      activeGrid.refresh();
      recalculatedAt = performance.now();
      const paintStartedAt = performance.now();
      await nextEngineFrame(controller.signal);
      await nextEngineFrame(controller.signal);
      emit({ type: "browser-frame", durationMs: performance.now() - paintStartedAt });
      paintedAt = performance.now();
      await executeAction("save");
      controller.signal.throwIfAborted();
      const finishedAt = performance.now();
      set("followSteps", [
        loadedAt - startedAt,
        recalculatedAt - loadedAt,
        paintedAt - recalculatedAt,
        finishedAt - paintedAt,
      ]);
      set("followDuration", finishedAt - startedAt);
    } catch (cause) {
      if (!controller.signal.aborted && !disposed) {
        set("status", errorText(cause));
        set("error", `Cannot follow the change: ${String(cause)}. Try again.`);
      }
    } finally {
      if (followController === controller) {
        followController = null;
        if (!disposed) set("following", false);
      }
    }
  }
  function rewriteFormula() {
    const activeGrid = grid;
    const row = state.currentRow;
    if (
      !activeGrid ||
      row === 0 ||
      row >= ENGINE_LIVE_ROWS - 1 ||
      (row - 1) % ENGINE_ACCOUNT_ROWS === ENGINE_ACCOUNT_ROWS - 1
    ) {
      set("status", "Choose a monthly row before you rewrite its forecast formula.");
      return;
    }
    const address = { sheet: ENGINE_LIVE_SHEET, row, col: ENGINE_COLUMN_INDEX.forecast };
    const base = `=${ENGINE_PLAN_COLUMN}${row + 1}`;
    const scenario = `${base}*${ENGINE_FORECAST_UPSIDE}`;
    const current = activeGrid.store.getFormula(address);
    if (current !== base && current !== scenario) {
      set("status", "This row no longer holds the plan formula. Undo or reset it first.");
      return;
    }
    const src = current === scenario ? base : scenario;
    const before = bindings?.dependencySnapshot(row);
    const startedAt = performance.now();
    const result = activeGrid.applyTransaction({
      patches: [{ op: "set", addr: address, value: { kind: "formula", src } }],
    });
    const durationMs = performance.now() - startedAt;
    if (result.status === "applied") {
      if (before) bindings?.announceDependencies("edit", row, before);
      emit({ type: "formula-rewrite", address: `D${row + 1}`, formula: src, durationMs });
      set("rewriteDuration", durationMs);
      set(
        "status",
        `D${row + 1} is now ${src}. It reads the same cell (${ENGINE_PLAN_COLUMN}${row + 1}); this one-cell browser transaction took ${durationMs.toFixed(2)} ms.`,
      );
    } else {
      set("status", `The formula rewrite returned ${result.status}.`);
    }
  }
  function reset() {
    if (disposed) return;
    stop();
    trace.clear();
    saver.reset();
    followAnchor = 24_000;
    jumpInput = "24001";
    state = {
      ...state,
      ready: false,
      following: false,
      followDuration: null,
      followSteps: null,
      rewriteDuration: null,
      planRequest: null,
      events: [],
      pendingOperations: 0,
      currentRow: 1,
      requestedRenderer: "canvas",
    };
    start();
  }
  start();
  return {
    snapshot() {
      const variance = {
        sheet: ENGINE_LIVE_SHEET,
        row: state.currentRow,
        col: ENGINE_COLUMN_INDEX.variance,
      };
      return {
        ...state,
        varianceValue: grid?.store.getCell(variance).resolved ?? null,
        varianceFormula: grid?.store.getFormula(variance) ?? null,
        forecast:
          grid?.store.getCell({
            ...variance,
            col: ENGINE_COLUMN_INDEX.forecast,
          }).resolved ?? null,
      };
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    grid: () => grid,
    traceLength: () => trace.size,
    run: executeAction,
    requestRenderer(renderer: EngineRenderer) {
      if (disposed || renderer === state.requestedRenderer) return;
      set("requestedRenderer", renderer);
      start();
    },
    followChange,
    rewriteFormula,
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      listeners.clear();
    },
  };
}

export interface EngineScenario {
  snapshot(): EngineScenarioSnapshot;
  subscribe(listener: () => void): () => void;
  grid(): Grid | null;
  traceLength(): number;
  run(action: EngineAction, rowInput?: string): Promise<void>;
  requestRenderer(renderer: EngineRenderer): void;
  followChange(): Promise<void>;
  rewriteFormula(): void;
  reset(): void;
  dispose(): void;
}
