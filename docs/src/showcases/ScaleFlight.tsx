import { cellA1, type Grid } from "@sheetwrite/core";
import { useEffect, useRef, useState } from "react";
import {
  type DatasourceTile,
  FEED_SHEET,
  formatBytes,
  pagedStatsOf,
  SCALE_COLUMNS,
  SCALE_LOGICAL_CELLS,
  SCALE_ROWS,
} from "./scenarios/scale.js";

/** A route the live Grid travels through, using only the public `scrollToCell` API. */
export type FlightKind = "depth" | "corner" | "teleport";

interface FlightPlan {
  label: string;
  summary: string;
  durationMs: number;
  /** Address at progress `t` in [0, 1]. */
  at(t: number, random: () => number): { row: number; col: number };
}

const LAST_ROW = SCALE_ROWS - 1;
const LAST_COLUMN = SCALE_COLUMNS - 1;
const TELEPORT_HOPS = 12;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Share of each leg spent moving. The rest of the leg holds still at the stop,
 * so the tiles that were requested there arrive and paint real values before
 * the next move. Without the hold, every request is aborted mid-flight and the
 * Grid shows only loading markers.
 */
const MOVE_SHARE = 0.45;

/** Leg index and eased in-leg move progress for overall progress `t` across `legs` legs. */
function legAt(t: number, legs: number): { leg: number; move: number } {
  const scaled = Math.min(t, 1) * legs;
  const leg = Math.min(legs - 1, Math.floor(scaled));
  return { leg, move: easeInOut(Math.min(1, (scaled - leg) / MOVE_SHARE)) };
}

/** One stop per order of magnitude: rows 1, 10, 100, … 1,000,000 (zero-based). */
const DEPTH_STOPS = [0, 9, 99, 999, 9_999, 99_999, LAST_ROW] as const;
/** Stops along the sheet's diagonal, as shares of the full distance. */
const CORNER_STOPS = [0, 0.25, 0.5, 0.75, 1] as const;

const FLIGHTS: Readonly<Record<FlightKind, FlightPlan>> = {
  depth: {
    label: "Dive to row 1,000,000",
    summary: "Every order of magnitude, top to bottom.",
    durationMs: (DEPTH_STOPS.length - 1) * 1_300,
    at: (t) => {
      const { leg, move } = legAt(t, DEPTH_STOPS.length - 1);
      // Move on a log scale, so every leg covers one order of magnitude evenly.
      const from = Math.log10((DEPTH_STOPS[leg] ?? 0) + 1);
      const to = Math.log10((DEPTH_STOPS[leg + 1] ?? LAST_ROW) + 1);
      return { row: Math.min(LAST_ROW, Math.round(10 ** (from + (to - from) * move) - 1)), col: 0 };
    },
  },
  corner: {
    label: "Cross to cell ALL1000000",
    summary: "Rows and columns together, to the far corner.",
    durationMs: (CORNER_STOPS.length - 1) * 1_700,
    // Both axes share one progress, so the route is the sheet's diagonal. (The
    // depth flight is the one that moves by orders of magnitude.)
    at: (t) => {
      const { leg, move } = legAt(t, CORNER_STOPS.length - 1);
      const from = CORNER_STOPS[leg] ?? 0;
      const share = from + ((CORNER_STOPS[leg + 1] ?? 1) - from) * move;
      return { row: Math.round(share * LAST_ROW), col: Math.round(share * LAST_COLUMN) };
    },
  },
  teleport: {
    label: `Teleport ${TELEPORT_HOPS} times`,
    summary: "Random cells anywhere in the billion.",
    durationMs: TELEPORT_HOPS * 550,
    at: (t, random) => {
      void t;
      return {
        row: Math.floor(random() * SCALE_ROWS),
        col: Math.floor(random() * SCALE_COLUMNS),
      };
    },
  },
};

export interface FlightReport {
  kind: FlightKind;
  frames: number;
  durationMs: number;
  fps: number;
  p95FrameMs: number;
  maxFrameMs: number;
  cellsVisited: number;
  requests: number;
  peakResidentBytes: number;
  peakLoadedCells: number;
  finalAddress: string;
  /** Reduced motion: the Grid jumped straight to the destination, so no frame rate applies. */
  instant: boolean;
}

interface LiveFlight {
  kind: FlightKind;
  progress: number;
  address: string;
  fps: number;
  residentBytes: number;
  loadedCells: number;
}

/** Deterministic per-flight random source, so a teleport tour is repeatable in tests. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

interface ScaleFlightDeckProps {
  grid: () => Grid | null;
  ready: boolean;
  requests: number;
  /** The latest paged-store sample from the page, shown when no flight is running. */
  resident: { bytes: number; cells: number };
  tiles: readonly (DatasourceTile & { residence: string })[];
  window: { firstRow: number; lastRow: number; firstColumn: number; lastColumn: number };
  onJump(row: number, col: number): void;
  onStatus(message: string): void;
}

/**
 * The showpiece of the billion-cell page: flights that move the real Grid
 * through the address space while a live HUD and an address-space map show
 * how little of it ever becomes resident.
 */
export function ScaleFlightDeck({
  grid,
  ready,
  requests,
  resident,
  tiles,
  window: view,
  onJump,
  onStatus,
}: Readonly<ScaleFlightDeckProps>) {
  const [live, setLive] = useState<LiveFlight | null>(null);
  const [report, setReport] = useState<FlightReport | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestsRef = useRef(requests);
  requestsRef.current = requests;

  useEffect(() => () => abortRef.current?.abort(), []);

  const fly = (kind: FlightKind) => {
    const mounted = grid();
    if (!mounted) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const plan = FLIGHTS[kind];
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const random = seededRandom(0x5eed + Math.floor(performance.now()));
    const startRequests = requestsRef.current;
    const frameGaps: number[] = [];
    const visited = new Set<number>();
    let peakResidentBytes = 0;
    let peakLoadedCells = 0;
    let lastHop = -1;
    let last = { row: 0, col: 0 };
    let previousFrame = 0;
    let start = 0;
    let lastPublish = Number.NEGATIVE_INFINITY;
    setReport(null);
    onStatus(
      `${plan.label}: the Grid is moving through ${SCALE_LOGICAL_CELLS.toLocaleString()} addresses.`,
    );

    const sample = () => {
      const stats = pagedStatsOf(mounted, FEED_SHEET);
      if (!stats) return { residentBytes: 0, loadedCells: 0 };
      peakResidentBytes = Math.max(peakResidentBytes, stats.allocatedBytes);
      peakLoadedCells = Math.max(peakLoadedCells, stats.loadedCells);
      return { residentBytes: stats.allocatedBytes, loadedCells: stats.loadedCells };
    };

    const finish = (now: number) => {
      const elapsed = Math.max(1, now - start);
      const sortedGaps = [...frameGaps].sort((left, right) => left - right);
      const finalAddress = cellA1(last.row, last.col);
      mounted.setSelection({
        kind: "cell",
        addr: { sheet: FEED_SHEET, row: last.row, col: last.col },
      });
      const result: FlightReport = {
        kind,
        frames: frameGaps.length + 1,
        durationMs: elapsed,
        fps: ((frameGaps.length + 1) / elapsed) * 1000,
        p95FrameMs: percentile(sortedGaps, 0.95),
        maxFrameMs: sortedGaps.at(-1) ?? 0,
        cellsVisited: visited.size,
        requests: requestsRef.current - startRequests,
        peakResidentBytes,
        peakLoadedCells,
        finalAddress,
        instant: reducedMotion,
      };
      setLive(null);
      setReport(result);
      onStatus(
        reducedMotion
          ? `${plan.label}: jumped straight to ${finalAddress}, ${formatBytes(peakResidentBytes)} peak resident.`
          : `${plan.label} finished at ${finalAddress}: ${result.fps.toFixed(0)} frames per second, ${formatBytes(peakResidentBytes)} peak resident.`,
      );
    };

    const step = (now: number) => {
      if (controller.signal.aborted) {
        setLive(null);
        return;
      }
      if (start === 0) start = now;
      else frameGaps.push(now - previousFrame);
      previousFrame = now;
      // Reduced motion: no animation. The Grid goes straight to the destination.
      const progress = reducedMotion ? 1 : Math.min(1, (now - start) / plan.durationMs);
      const shown = progress;
      const hop =
        kind === "teleport"
          ? Math.min(TELEPORT_HOPS - 1, Math.floor(progress * TELEPORT_HOPS))
          : -1;
      if (kind !== "teleport" || hop !== lastHop) {
        const next =
          progress >= 1 && kind !== "teleport" ? plan.at(1, random) : plan.at(shown, random);
        lastHop = hop;
        if (next.row !== last.row || next.col !== last.col || visited.size === 0) {
          last = next;
          visited.add(next.row * SCALE_COLUMNS + next.col);
          // Scrolling alone moves the view; the destination is selected once, at the end.
          mounted.scrollToCell({ sheet: FEED_SHEET, row: next.row, col: next.col });
        }
      }
      const resident = sample();
      // The HUD redraws about eight times a second, so its own rendering does not
      // distort the frame timing it reports.
      if (now - lastPublish >= 120) {
        lastPublish = now;
        const elapsed = Math.max(1, now - start);
        setLive({
          kind,
          progress,
          address: cellA1(last.row, last.col),
          fps: ((frameGaps.length + 1) / elapsed) * 1000,
          ...resident,
        });
      }
      if (progress >= 1) {
        finish(now);
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const stop = () => {
    abortRef.current?.abort();
    onStatus("Flight stopped. The Grid stays where it is; you can edit any visible cell.");
  };

  const flying = live !== null;
  const shownBytes = live?.residentBytes ?? resident.bytes;
  const shownCells = live?.loadedCells ?? resident.cells;
  const residentShare = (shownCells / SCALE_LOGICAL_CELLS) * 100;

  return (
    <section
      aria-labelledby="scale-flight-title"
      className="sw-sp-flight"
      data-flying={flying ? "true" : "false"}
      data-testid="scale-flight"
    >
      <div className="sw-sp-flight__intro">
        <p className="sw-sp-flight__kicker">Flight deck</p>
        <h2 id="scale-flight-title">Fly the Grid through a billion cells.</h2>
        <p>
          Each flight drives the real Grid below with public API calls. Nothing is pre-rendered.
        </p>
        <fieldset className="sw-sp-flight__routes" aria-label="Choose a flight">
          {(Object.keys(FLIGHTS) as FlightKind[]).map((kind) => (
            <button
              aria-pressed={live?.kind === kind}
              data-testid={`scale-flight-${kind}`}
              disabled={!ready}
              key={kind}
              onClick={() => fly(kind)}
              type="button"
            >
              <strong>{FLIGHTS[kind].label}</strong>
              <span>{FLIGHTS[kind].summary}</span>
            </button>
          ))}
        </fieldset>
        {flying && (
          <button className="sw-sp-flight__stop" onClick={stop} type="button">
            Stop flight
          </button>
        )}
      </div>

      <dl className="sw-sp-flight__hud" aria-label="Live flight readout" aria-live="off">
        <div className="sw-sp-flight__hud-address">
          <dt>Now at</dt>
          <dd data-testid="scale-flight-address">
            {live?.address ?? report?.finalAddress ?? cellA1(view.firstRow, view.firstColumn)}
          </dd>
          {flying && (
            <dd className="sw-sp-flight__progress" aria-hidden="true">
              <i style={{ width: `${(live?.progress ?? 0) * 100}%` }} />
            </dd>
          )}
        </div>
        <div>
          <dt>Frames per second</dt>
          <dd data-testid="scale-flight-fps">
            {live ? live.fps.toFixed(0) : report && !report.instant ? report.fps.toFixed(0) : "—"}
          </dd>
        </div>
        <div>
          <dt>Slowest 5% of frames</dt>
          <dd>
            {report && !flying && !report.instant ? `${report.p95FrameMs.toFixed(1)} ms` : "—"}
          </dd>
        </div>
        <div>
          <dt>Cells loaded in memory</dt>
          <dd>{shownCells.toLocaleString()}</dd>
          <dd className="sw-sp-flight__fine">
            {residentShare < 0.0001 && shownCells > 0 ? "<0.0001" : residentShare.toFixed(4)}% of
            the billion · {formatBytes(shownBytes)}
          </dd>
        </div>
        <div>
          <dt>Tile requests</dt>
          <dd>{(report && !flying ? report.requests : requests).toLocaleString()}</dd>
          <dd className="sw-sp-flight__fine">
            {report && !flying ? "during the last flight" : "since the page opened"}
          </dd>
        </div>
      </dl>

      <ScaleMinimap onJump={onJump} tiles={tiles} window={view} />

      <p aria-live="polite" className="sw-sp-flight__report" data-testid="scale-flight-report">
        {report && !flying
          ? report.instant
            ? `${FLIGHTS[report.kind].label}: jumped straight to ${report.finalAddress} because reduced motion is on. Peak resident ${formatBytes(report.peakResidentBytes)} while addressing ${SCALE_LOGICAL_CELLS.toLocaleString()} cells.`
            : `${FLIGHTS[report.kind].label}: ${report.frames.toLocaleString()} frames in ${(report.durationMs / 1000).toFixed(1)} s, ${report.fps.toFixed(0)} frames per second, slowest frame ${report.maxFrameMs.toFixed(0)} ms. Peak resident ${formatBytes(report.peakResidentBytes)} while addressing ${SCALE_LOGICAL_CELLS.toLocaleString()} cells.`
          : ""}
      </p>
    </section>
  );
}

const MAP_WIDTH = 168;
const MAP_HEIGHT = 216;

interface ScaleMinimapProps {
  tiles: readonly (DatasourceTile & { residence: string })[];
  window: { firstRow: number; lastRow: number; firstColumn: number; lastColumn: number };
  onJump(row: number, col: number): void;
}

/**
 * The whole 1,000,000 × 1,000 address space at a glance. Each visited tile
 * lights up; the crosshair marks the visible window. Clicking teleports there
 * as a pointer shortcut; the jump form and the row and column sliders beside
 * the Grid are the keyboard controls for the same navigation.
 */
function ScaleMinimap({ tiles, window: view, onJump }: Readonly<ScaleMinimapProps>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seenRef = useRef(new Map<number, DatasourceTile & { residence: string }>());

  for (const tile of tiles) seenRef.current.set(tile.id, tile);
  // Keep the newest few thousand tiles; older ones fade from the map.
  if (seenRef.current.size > 4096) {
    const keep = [...seenRef.current.entries()].slice(-4096);
    seenRef.current = new Map(keep);
  }

  // `tiles` is read through `seenRef`, which this render filled from it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: redraw when new tiles arrive.
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const scale = window.devicePixelRatio || 1;
    canvas.width = MAP_WIDTH * scale;
    canvas.height = MAP_HEIGHT * scale;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    const styles = getComputedStyle(canvas);
    const color = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;
    const accent = color("--sw-accent", "#10b981");
    const muted = color("--sw-border", "#cbd5e1");
    const strong = color("--sw-fg-strong", "#0f172a");
    const warn = color("--sw-demo-warn", "#f59e0b");

    context.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    context.strokeStyle = muted;
    context.lineWidth = 1;
    for (const fraction of [0.25, 0.5, 0.75]) {
      context.beginPath();
      context.moveTo(0, Math.round(MAP_HEIGHT * fraction) + 0.5);
      context.lineTo(MAP_WIDTH, Math.round(MAP_HEIGHT * fraction) + 0.5);
      context.moveTo(Math.round(MAP_WIDTH * fraction) + 0.5, 0);
      context.lineTo(Math.round(MAP_WIDTH * fraction) + 0.5, MAP_HEIGHT);
      context.stroke();
    }

    for (const tile of seenRef.current.values()) {
      context.fillStyle =
        tile.residence === "evicted" ? muted : tile.state === "requested" ? warn : accent;
      const y = (tile.start / SCALE_ROWS) * MAP_HEIGHT;
      const height = Math.max(1.5, ((tile.end - tile.start) / SCALE_ROWS) * MAP_HEIGHT);
      for (const band of tile.columns) {
        const x = (band.start / SCALE_COLUMNS) * MAP_WIDTH;
        const width = Math.max(1.5, ((band.end - band.start) / SCALE_COLUMNS) * MAP_WIDTH);
        context.fillRect(x, y, width, height);
      }
    }

    const x = ((view.firstColumn + view.lastColumn) / 2 / SCALE_COLUMNS) * MAP_WIDTH;
    const y = ((view.firstRow + view.lastRow) / 2 / SCALE_ROWS) * MAP_HEIGHT;
    // Keep the finder inside the map: at A1 an unclamped marker would sit half
    // outside the canvas and read as a rendering fault.
    const markerHalf = 5;
    const markerX = Math.min(Math.max(x, markerHalf), MAP_WIDTH - markerHalf);
    const markerY = Math.min(Math.max(y, markerHalf), MAP_HEIGHT - markerHalf);
    context.strokeStyle = strong;
    context.globalAlpha = 0.6;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, Math.round(markerY) + 0.5);
    context.lineTo(MAP_WIDTH, Math.round(markerY) + 0.5);
    context.moveTo(Math.round(markerX) + 0.5, 0);
    context.lineTo(Math.round(markerX) + 0.5, MAP_HEIGHT);
    context.stroke();
    context.globalAlpha = 1;
    context.lineWidth = 2;
    context.strokeRect(markerX - markerHalf, markerY - markerHalf, markerHalf * 2, markerHalf * 2);
  }, [tiles, view.firstRow, view.lastRow, view.firstColumn, view.lastColumn]);

  // Clicking is a pointer shortcut only, so it is attached outside the
  // accessibility tree; the jump form and sliders are the keyboard path.
  const jumpRef = useRef(onJump);
  jumpRef.current = onJump;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const teleport = (event: MouseEvent) => {
      const box = canvas.getBoundingClientRect();
      jumpRef.current(
        ((event.clientY - box.top) / box.height) * SCALE_ROWS,
        ((event.clientX - box.left) / box.width) * SCALE_COLUMNS,
      );
    };
    canvas.addEventListener("click", teleport);
    return () => canvas.removeEventListener("click", teleport);
  }, []);

  return (
    <figure aria-hidden="true" className="sw-sp-flight__map">
      <canvas
        data-testid="scale-flight-map"
        height={MAP_HEIGHT}
        ref={canvasRef}
        style={{ width: MAP_WIDTH, height: MAP_HEIGHT }}
        width={MAP_WIDTH}
      />
      <figcaption>
        <span>A1</span>
        <span>ALL1000000</span>
        <small>The whole sheet. Lit tiles were loaded. Click to teleport.</small>
      </figcaption>
    </figure>
  );
}
