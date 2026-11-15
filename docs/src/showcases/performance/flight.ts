import {
  FEED_SHEET,
  SCALE_COLUMNS,
  SCALE_LOGICAL_CELLS,
  SCALE_ROWS,
} from "@docs/showcases/scenarios/scale.js";
import { cellA1, type Grid, type PagedStoreStats } from "@sheetwrite/core";
import { type Accessor, createSignal, onCleanup } from "solid-js";

import { formatSize } from "./workbench.js";

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

export const FLIGHTS: Readonly<Record<FlightKind, FlightPlan>> = {
  depth: {
    label: "Dive to row 1,000,000",
    summary: "Every order of magnitude, top to bottom.",
    durationMs: (DEPTH_STOPS.length - 1) * 1_300,
    at: (t) => {
      const { leg, move } = legAt(t, DEPTH_STOPS.length - 1);
      // Move on a log scale, so every leg covers one order of magnitude evenly.
      const from = Math.log10((DEPTH_STOPS[leg] ?? 0) + 1);
      const to = Math.log10((DEPTH_STOPS[leg + 1] ?? LAST_ROW) + 1);
      return {
        row: Math.min(LAST_ROW, Math.round(10 ** (from + (to - from) * move) - 1)),
        col: 0,
      };
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
      return {
        row: Math.round(share * LAST_ROW),
        col: Math.round(share * LAST_COLUMN),
      };
    },
  },
  teleport: {
    label: `Teleport ${TELEPORT_HOPS} times`,
    summary: "Random cells anywhere in the billion.",
    durationMs: TELEPORT_HOPS * 550,
    at: (_t, random) => ({
      row: Math.floor(random() * SCALE_ROWS),
      col: Math.floor(random() * SCALE_COLUMNS),
    }),
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

export interface LiveFlight {
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

/** The flights, their live sample and the last flight's report. */
export interface ScaleFlight {
  readonly live: Accessor<LiveFlight | null>;
  readonly report: Accessor<FlightReport | null>;
  readonly flying: Accessor<boolean>;
  fly(kind: FlightKind): void;
  stop(): void;
}

/**
 * Flights that move the real Grid through the address space with public
 * `scrollToCell` calls, timing every frame and sampling the paged store.
 */
export function createScaleFlight(
  grid: () => Grid | null,
  requests: Accessor<number>,
  pagedStats: (grid: Grid) => PagedStoreStats | null,
  onStatus: (message: string) => void,
): ScaleFlight {
  const [live, setLive] = createSignal<LiveFlight | null>(null);
  const [report, setReport] = createSignal<FlightReport | null>(null);
  let abort: AbortController | null = null;
  onCleanup(() => abort?.abort());

  const fly = (kind: FlightKind) => {
    const mounted = grid();
    if (!mounted) return;
    abort?.abort();
    const controller = new AbortController();
    abort = controller;
    const plan = FLIGHTS[kind];
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const random = seededRandom(0x5eed + Math.floor(performance.now()));
    const startRequests = requests();
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
      `${plan.label}: the Grid is moving through ${SCALE_LOGICAL_CELLS.toLocaleString("en")} addresses.`,
    );

    const sample = () => {
      const stats = pagedStats(mounted);
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
        requests: requests() - startRequests,
        peakResidentBytes,
        peakLoadedCells,
        finalAddress,
        instant: reducedMotion,
      };
      setLive(null);
      setReport(result);
      onStatus(
        reducedMotion
          ? `${plan.label}: jumped straight to ${finalAddress}, ${formatSize(peakResidentBytes)} peak resident.`
          : `${plan.label} finished at ${finalAddress}: ${result.fps.toFixed(0)} frames per second, ${formatSize(peakResidentBytes)} peak resident.`,
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
      const hop =
        kind === "teleport"
          ? Math.min(TELEPORT_HOPS - 1, Math.floor(progress * TELEPORT_HOPS))
          : -1;
      if (kind !== "teleport" || hop !== lastHop) {
        const next =
          progress >= 1 && kind !== "teleport" ? plan.at(1, random) : plan.at(progress, random);
        lastHop = hop;
        if (next.row !== last.row || next.col !== last.col || visited.size === 0) {
          last = next;
          visited.add(next.row * SCALE_COLUMNS + next.col);
          // Scrolling alone moves the view; the destination is selected once, at the end.
          mounted.scrollToCell({ sheet: FEED_SHEET, row: next.row, col: next.col });
        }
      }
      const resident = sample();
      // The readout redraws about eight times a second, so its own rendering
      // does not distort the frame timing it reports.
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
    abort?.abort();
    onStatus("Flight stopped. The Grid stays where it is; you can edit any visible cell.");
  };

  return { live, report, flying: () => live() !== null, fly, stop };
}
