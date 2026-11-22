import { errorText } from "@docs/lib/errors.js";
import { formatBytes } from "@docs/lib/format.js";
import { observeSiteTheme } from "@docs/lib/site-theme.js";
import {
  type CrossingReport,
  type DatasourceTelemetry,
  type DatasourceTile,
  emptyTelemetry,
  FEED_SHEET,
  type FullExportAttempt,
  SCALE_COLUMNS,
  SCALE_EVICTION_STRESS_STORAGE,
  SCALE_ROWS,
  SCALE_STORAGE,
  type ScanAttempt,
} from "@docs/showcases/scenarios/scale.js";
import type { RendererState, RenderingMode } from "@docs/showcases/ui/rendering-mode.js";
import {
  type CellAddress,
  cellA1,
  colToA1,
  type Grid,
  type PagedStoreStats,
  type QueryCapability,
  type RuntimeResourcePhaseDelta,
  type RuntimeResourceSnapshot,
  type Selection,
} from "@sheetwrite/core";
import { createEffect, createSignal, on, onCleanup } from "solid-js";

/*
 * The performance page's live state: the billion-address Grid, its
 * datasource telemetry, and the reports the panel and the sections after the
 * code show. The page's islands share it (PerformanceStage.tsx mounts the
 * Grid; PerformanceDiagnostics.tsx reads the reports).
 */

declare global {
  interface Window {
    __sheetwriteScaleGrid?: Grid;
  }
}

export const SCALE_OVERSCAN = 4;
const BYTES_PER_MIB = 1024 * 1024;
/** How often the panel samples the paged store and the resource report. */
const STATS_INTERVAL_MS = 250;

export const formatSize = (bytes: number): string => formatBytes(bytes, { kib: 1, mib: 1, gib: 2 });

interface VisibleWindow {
  firstRow: number;
  lastRow: number;
  scrollLeft: number;
  firstColumn: number;
  lastColumn: number;
}

interface LiveStats {
  paged: PagedStoreStats | null;
  query: QueryCapability | null;
  resource: RuntimeResourceSnapshot | null;
}

export interface EvictionWatch {
  dirty: CellAddress;
  clean: CellAddress;
  dirtyState: string;
  cleanState: string;
  value: string;
}

type TileResidence = DatasourceTile["state"] | "resident" | "evicted" | "dirty";
export type ResidentTile = DatasourceTile & { residence: TileResidence };

function selection_a1(selection: Selection | null): string {
  if (!selection) return "A1";
  if (selection.kind === "cell") return cellA1(selection.addr.row, selection.addr.col);
  if (selection.kind === "range")
    return cellA1(selection.range.start.row, selection.range.start.col);
  if (selection.kind === "row") return `Row ${selection.row + 1}`;
  if (selection.kind === "column") return colToA1(selection.col);
  const first = selection.ranges[0]?.start;
  return first ? cellA1(first.row, first.col) : "A1";
}

function selected_cell_address(selection: Selection | null): CellAddress | null {
  if (!selection) return null;
  if (selection.kind === "cell") return selection.addr;
  if (selection.kind === "range") return { sheet: FEED_SHEET, ...selection.range.start };
  if (selection.kind === "multi") {
    const start = selection.ranges[0]?.start;
    return start ? { sheet: FEED_SHEET, ...start } : null;
  }
  return null;
}

export function columnBandsLabel(columns: readonly DatasourceTile["columns"][number][]): string {
  return columns
    .map((band) => `${colToA1(band.start)}–${colToA1(Math.max(band.start, band.end - 1))}`)
    .join(", ");
}

function tile_residence(grid: Grid | null, tile: DatasourceTile): TileResidence {
  if (tile.state !== "returned" || !grid?.store.getCellLoadState) return tile.state;
  const first_band = tile.columns[0];
  if (!first_band) return "evicted";
  const state = grid.store.getCellLoadState({
    sheet: tile.sheet,
    row: tile.start,
    col: first_band.start,
  });
  if (state === "unloaded") return "evicted";
  if (state === "local-edit") return "dirty";
  return "resident";
}

/** Leading-and-trailing throttle: applies a value at once when idle, else at most every `ms`. */
function throttled<T>(apply: (value: T) => void, ms = 100) {
  let pending: { value: T } | null = null;
  let timer = 0;
  let last = Number.NEGATIVE_INFINITY;
  const flush = () => {
    timer = 0;
    last = performance.now();
    if (pending) apply(pending.value);
    pending = null;
  };
  return {
    push(value: T) {
      pending = { value };
      if (timer !== 0) return;
      const wait = last + ms - performance.now();
      if (wait <= 0) flush();
      else timer = window.setTimeout(flush, wait);
    },
    cancel() {
      window.clearTimeout(timer);
    },
  };
}

const EMPTY_WINDOW: VisibleWindow = {
  firstRow: 0,
  lastRow: 0,
  scrollLeft: 0,
  firstColumn: 0,
  lastColumn: 0,
};

let mounted_grid: Grid | null = null;
/** The engine module, once the Grid has loaded it. */
let engine: typeof import("./boot.js") | null = null;
let host_element: HTMLElement | null = null;
let visible_now: VisibleWindow = EMPTY_WINDOW;
let zoom_now = 1;

export const [renderer, setRenderer] = createSignal<RenderingMode>("canvas");
export const [rendererState, setRendererState] = createSignal<RendererState | null>(null);
export const [gridState, setGridState] = createSignal<"loading" | "ready" | "error">("loading");
export const [telemetry, setTelemetry] = createSignal<DatasourceTelemetry>(emptyTelemetry());
export const [stats, setStats] = createSignal<LiveStats>({
  paged: null,
  query: null,
  resource: null,
});
export const [visible, setVisible] = createSignal<VisibleWindow>(EMPTY_WINDOW);
export const [selection, setSelection] = createSignal("A1");
const [selected_address, set_selected_address] = createSignal<CellAddress>({
  sheet: FEED_SHEET,
  row: 0,
  col: 0,
});
export const [zoom, setZoom] = createSignal(1);
export const [evictionStress, setEvictionStress] = createSignal(false);
export const [status, setStatus] = createSignal("Loading the WASM engine on demand…");
export const [crossings, setCrossings] = createSignal<CrossingReport[]>([]);
export const [exportAttempt, setExportAttempt] = createSignal<FullExportAttempt | null>(null);
export const [scan, setScan] = createSignal<ScanAttempt | null>(null);
export const [resourceDelta, setResourceDelta] = createSignal<RuntimeResourcePhaseDelta | null>(
  null,
);
export const [evictionWatch, setEvictionWatch] = createSignal<EvictionWatch | null>(null);

export const grid = (): Grid | null => mounted_grid;
/** The paged store's sample for the scale sheet, once the engine has loaded. */
export const pagedStats = (current: Grid): PagedStoreStats | null =>
  engine?.pagedStatsOf(current, FEED_SHEET) ?? null;
export const activeStorage = () =>
  evictionStress() ? SCALE_EVICTION_STRESS_STORAGE : SCALE_STORAGE;

export const firstColumn = () => Math.min(visible().firstColumn, SCALE_COLUMNS - 1);
export const lastColumn = () =>
  Math.min(Math.max(visible().lastColumn, firstColumn()), SCALE_COLUMNS - 1);
export const firstRow = () => Math.min(visible().firstRow, SCALE_ROWS - 1);
export const lastRow = () => Math.min(Math.max(visible().lastRow, firstRow()), SCALE_ROWS - 1);
export const windowA1 = () =>
  `${cellA1(firstRow(), firstColumn())}:${cellA1(lastRow(), lastColumn())}`;
export const currentColumns = () => lastColumn() - firstColumn() + 1;
export const averageRequestedColumns = () => {
  const current = telemetry();
  return current.returnedRows > 0 ? current.returnedCells / current.returnedRows : 0;
};
export const cachePercent = () =>
  Math.min(((stats().paged?.allocatedBytes ?? 0) / activeStorage().cacheBytes) * 100, 100);
export const cacheCeilingMiB = () => activeStorage().cacheBytes / BYTES_PER_MIB;
export const STRESS_CEILING_MIB = SCALE_EVICTION_STRESS_STORAGE.cacheBytes / BYTES_PER_MIB;
export const DEFAULT_CEILING_MIB = SCALE_STORAGE.cacheBytes / BYTES_PER_MIB;
export const recentTiles = (): ResidentTile[] => {
  // The stats sample re-reads each tile's load state as tiles evict.
  stats();
  return telemetry().recentTiles.map((tile) => ({
    ...tile,
    residence: tile_residence(mounted_grid, tile),
  }));
};
export const recentEvictions = () =>
  recentTiles().filter((tile) => tile.residence === "evicted").length;
export const residentTiles = () =>
  recentTiles().filter((tile) => tile.residence === "resident" || tile.residence === "dirty")
    .length;
export const resourceOwners = () => {
  const resource = stats().resource;
  return resource
    ? [...resource.wasm.owners, ...resource.jsOwners]
        .filter((owner) => owner.logicalBytes > 0 || owner.allocatedBytes > 0)
        .sort((left, right) => right.allocatedBytes - left.allocatedBytes)
        .slice(0, 8)
    : [];
};
export const changedResourceOwners = () =>
  resourceDelta()?.owners.filter(
    (owner) => owner.logicalBytes !== 0 || owner.allocatedBytes !== 0 || owner.entries !== 0,
  ) ?? [];
export const selectedFormula = () => {
  stats();
  return mounted_grid?.store.getFormula(selected_address()) ?? null;
};

/**
 * Mounts the Grid in `host` once it comes near the viewport, remounting it
 * when the drawing path or the cache ceiling changes. Call inside the stage
 * island, which owns the Grid's lifetime.
 */
export function mountWorkbench(host: HTMLElement, whenNear: (start: () => void) => () => void) {
  host_element = host;
  const [near, set_near] = createSignal(false);
  onCleanup(whenNear(() => set_near(true)));

  createEffect(
    on([near, renderer, evictionStress], ([is_near, mode, stressed]) => {
      if (!is_near) return;
      let disposed = false;
      let created: Grid | null = null;
      const unsubscribes: Array<() => void> = [];
      // Flights fire a scroll event and several tile updates every frame. Each
      // readout redraws at once when idle and at most ten times a second during
      // a burst, always ending on the latest value.
      const visible_updates = throttled(setVisible);
      const telemetry_updates = throttled(setTelemetry);
      unsubscribes.push(visible_updates.cancel, telemetry_updates.cancel);
      setGridState("loading");
      setTelemetry(emptyTelemetry());
      setEvictionWatch(null);
      setStatus("Loading the WASM engine on demand…");

      void import("./boot.js")
        .then((module) => {
          engine = module;
          return module.startScaleGrid(host, {
            renderer: mode,
            storage: stressed ? SCALE_EVICTION_STRESS_STORAGE : SCALE_STORAGE,
            overscan: stressed ? 0 : SCALE_OVERSCAN,
            onTelemetry: (update) => telemetry_updates.push(update),
            visibleRows: () => visible_now,
          });
        })
        .then((next) => {
          if (disposed) {
            next.destroy();
            return;
          }
          created = next;
          mounted_grid = next;
          window.__sheetwriteScaleGrid = next;
          next.setZoom(zoom_now);
          setRendererState({ requested: mode, active: next.rendererKind(), fallback: null });
          setSelection(selection_a1(next.getSelection()));
          set_selected_address(
            selected_cell_address(next.getSelection()) ?? { sheet: FEED_SHEET, row: 0, col: 0 },
          );
          unsubscribes.push(
            next.on("scroll", (event) => {
              const next_visible = {
                firstRow: event.firstRow,
                lastRow: event.lastRow,
                scrollLeft: event.scrollLeft,
                firstColumn: event.firstVisibleColumn ?? 0,
                lastColumn: event.lastVisibleColumn ?? event.firstVisibleColumn ?? 0,
              };
              visible_now = next_visible;
              visible_updates.push(next_visible);
            }),
            next.on("selection", ({ selection: chosen }) => {
              setSelection(selection_a1(chosen));
              const address = selected_cell_address(chosen);
              if (address) set_selected_address(address);
            }),
            next.on("edit-commit", ({ addr }) => {
              const clean_row =
                addr.row >= SCALE_STORAGE.chunkRows
                  ? addr.row - SCALE_STORAGE.chunkRows
                  : Math.min(SCALE_ROWS - 1, addr.row + SCALE_STORAGE.chunkRows);
              const clean = { ...addr, row: clean_row };
              setEvictionWatch({
                dirty: addr,
                clean,
                dirtyState: next.store.getCellLoadState?.(addr) ?? "unavailable",
                cleanState: next.store.getCellLoadState?.(clean) ?? "unavailable",
                value: String(next.store.getCell(addr).resolved ?? ""),
              });
              setStatus(
                `${cellA1(addr.row, addr.col)} committed through the Grid; its sparse dirty value is outside the clean-tile eviction budget.`,
              );
            }),
            next.on("renderer-fallback", ({ error }) => {
              setRendererState({
                requested: "worker",
                active: next.rendererKind(),
                fallback: errorText(error),
              });
            }),
            next.on("datasource-error", ({ error }) => {
              setStatus(`Datasource error: ${error.message}`);
            }),
          );
          setGridState("ready");
          // One line on a phone, like the loading line it replaces, so the
          // page below does not move when the Grid becomes ready.
          setStatus(
            `Ready${stressed ? " with the 1 MiB ceiling" : ""}. Only the tiles you visit load.`,
          );
        })
        .catch((error: unknown) => {
          if (disposed) return;
          setGridState("error");
          setStatus(`Grid failed to start: ${errorText(error)}`);
        });

      onCleanup(() => {
        disposed = true;
        for (const unsubscribe of unsubscribes) unsubscribe();
        if (mounted_grid === created) {
          mounted_grid = null;
          delete window.__sheetwriteScaleGrid;
        }
        created?.destroy();
      });
    }),
  );

  onCleanup(
    observeSiteTheme(() => {
      if (engine) mounted_grid?.replaceTheme(engine.scaleTheme());
    }),
  );

  const timer = window.setInterval(() => {
    const current = mounted_grid;
    if (!current || !engine) return;
    setStats({
      paged: engine.pagedStatsOf(current, FEED_SHEET),
      query: engine.queryCapabilityOf(current, FEED_SHEET),
      resource: current.getRuntimeResourceSnapshot("scroll", "settled"),
    });
    const watch = evictionWatch();
    if (!watch) return;
    const dirty_state = current.store.getCellLoadState?.(watch.dirty) ?? "unavailable";
    const clean_state = current.store.getCellLoadState?.(watch.clean) ?? "unavailable";
    const value = String(current.store.getCell(watch.dirty).resolved ?? "");
    if (
      dirty_state !== watch.dirtyState ||
      clean_state !== watch.cleanState ||
      value !== watch.value
    ) {
      setEvictionWatch({ ...watch, dirtyState: dirty_state, cleanState: clean_state, value });
    }
  }, STATS_INTERVAL_MS);
  onCleanup(() => window.clearInterval(timer));
}

export function jumpTo(
  row: number,
  column: number,
  source: "form" | "overview" | "column-overview" | "landmark",
): void {
  const current = mounted_grid;
  if (!current) return;
  const resolved_row = Math.min(Math.max(Math.round(row), 0), SCALE_ROWS - 1);
  const resolved_column = Math.min(Math.max(Math.round(column), 0), SCALE_COLUMNS - 1);
  const addr = { sheet: FEED_SHEET, row: resolved_row, col: resolved_column };
  current.setSelection({ kind: "cell", addr });
  current.scrollToCell(addr);
  if (source === "form") host_element?.focus({ preventScroll: true });
  if (source !== "overview" && source !== "column-overview") {
    setStatus(
      `${source === "form" ? "Exact jump" : "Overview landmark"}: ${cellA1(resolved_row, resolved_column)} is selected; its rectangular tile is requested on demand.`,
    );
  }
}

/** Zooms around the visible window, so the cells in view stay in view. */
export function zoomTo(nextZoom: number): void {
  const current = mounted_grid;
  const host = host_element;
  if (!current || !host) return;
  const anchor = visible_now;
  current.setZoom(nextZoom);

  const theme = current.getEffectiveTheme();
  const body_rows = Math.max(
    1,
    Math.floor(Math.max(theme.rowHeight, host.clientHeight - theme.headerHeight) / theme.rowHeight),
  );
  const sheet = current.store.getWorkbook().sheets.find((candidate) => candidate.id === FEED_SHEET);
  const available_width = Math.max(1, host.clientWidth - theme.rowHeaderWidth);
  let anchor_right = anchor.firstColumn;
  let covered_width = 0;
  while (anchor_right < SCALE_COLUMNS) {
    covered_width += (sheet?.columns[anchor_right]?.width ?? 96) * current.getZoom();
    if (covered_width >= available_width) break;
    anchor_right += 1;
  }

  const body_columns = Math.max(1, anchor_right - anchor.firstColumn + 1);
  const force_row =
    anchor.firstRow === 0
      ? Math.min(SCALE_ROWS - 1, body_rows + SCALE_OVERSCAN + 1)
      : Math.max(0, anchor.firstRow - body_rows - SCALE_OVERSCAN - 1);
  const force_column =
    anchor.firstColumn === 0
      ? Math.min(SCALE_COLUMNS - 1, anchor_right + 1)
      : Math.max(0, anchor.firstColumn - body_columns - 1);
  current.scrollToCell({ sheet: FEED_SHEET, row: force_row, col: force_column });
  current.scrollToCell({
    sheet: FEED_SHEET,
    row:
      anchor.firstRow === 0
        ? 0
        : Math.min(SCALE_ROWS - 1, anchor.firstRow + SCALE_OVERSCAN + body_rows),
    col: anchor.firstColumn === 0 ? 0 : Math.min(SCALE_COLUMNS - 1, anchor_right),
  });
  zoom_now = current.getZoom();
  setZoom(zoom_now);
}

export function runScan(): void {
  if (mounted_grid && engine) setScan(engine.attemptColumnScan(mounted_grid, 3, "sum"));
}

export function runExport(): void {
  if (mounted_grid && engine)
    setExportAttempt(engine.attemptFullCsvExport(mounted_grid, FEED_SHEET));
}

export function runCrossings(kind: "values" | "styles"): void {
  const current = mounted_grid;
  if (!current || !engine) return;
  const before = current.getRuntimeResourceSnapshot("edit", "before");
  const report = engine.measureBulkMutation(current, kind, 20_000);
  const after = current.getRuntimeResourceSnapshot("edit", "settled");
  setResourceDelta(engine.diffRuntimeResourcePhases(before, after));
  setCrossings((previous) => [report, ...previous.slice(0, 3)]);
  setStatus(
    `${kind === "values" ? "Value" : "Style"} transaction touched ${report.cells.toLocaleString("en")} cells in ${report.durationMs.toFixed(1)} ms with ${report.ffiCalls} measured JS↔WASM crossing${report.ffiCalls === 1 ? "" : "s"}.`,
  );
}
