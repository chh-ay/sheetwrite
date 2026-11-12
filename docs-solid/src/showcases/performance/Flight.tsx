import { observeSiteTheme } from "@docs/lib/site-theme.js";
import {
  type DatasourceTile,
  SCALE_COLUMNS,
  SCALE_LOGICAL_CELLS,
  SCALE_ROWS,
} from "@docs/showcases/scenarios/scale.js";
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { Icon } from "../../components/Icon.js";
import { ShowcaseReadout } from "../layout/ShowcaseLayout.js";
import { Button } from "../ui/Button.js";
import { FLIGHTS, type FlightKind, type ScaleFlight } from "./flight.js";
import { formatSize } from "./workbench.js";

const FLIGHT_KINDS = Object.keys(FLIGHTS) as FlightKind[];

/** The three flights as side-panel buttons, and Stop while one runs. */
export function FlightControls(props: Readonly<{ flight: ScaleFlight; ready: boolean }>) {
  return (
    <div
      class="sw-sp-flights"
      data-flying={props.flight.flying() ? "true" : "false"}
      data-testid="scale-flight"
    >
      <For each={FLIGHT_KINDS}>
        {(kind) => (
          <Button
            aria-pressed={props.flight.live()?.kind === kind}
            class="sw-sp-flight-route"
            data-testid={`scale-flight-${kind}`}
            disabled={!props.ready}
            onClick={() => props.flight.fly(kind)}
          >
            <Icon name="play" />
            <span>
              <strong>{FLIGHTS[kind].label}</strong>
              <small>{FLIGHTS[kind].summary}</small>
            </span>
          </Button>
        )}
      </For>
      <Show when={props.flight.flying()}>
        <Button class="sw-sp-flight-stop" onClick={() => props.flight.stop()} variant="quiet">
          <Icon name="pause" />
          Stop flight
        </Button>
      </Show>
    </div>
  );
}

/** Props of {@link FlightReadout}. */
interface FlightReadoutProps {
  flight: ScaleFlight;
  requests: number;
  /** The latest paged-store sample from the page, shown when no flight is running. */
  resident: { bytes: number; cells: number };
  /** The top-left cell of the visible window, shown before any flight. */
  origin: string;
}

/** What the running or last flight measured, as a side-panel readout. */
export function FlightReadout(props: Readonly<FlightReadoutProps>) {
  const live = () => props.flight.live();
  const report = () => props.flight.report();
  const flying = () => props.flight.flying();
  const shownBytes = () => live()?.residentBytes ?? props.resident.bytes;
  const shownCells = () => live()?.loadedCells ?? props.resident.cells;
  const residentShare = () => (shownCells() / SCALE_LOGICAL_CELLS) * 100;
  const measured = () => report() !== null && report()?.instant !== true;
  const unmeasured = () => (report()?.instant ? "No frames with reduced motion" : "Run a flight");

  return (
    <>
      <ShowcaseReadout
        items={[
          {
            label: "Now at",
            value: (
              <span data-testid="scale-flight-address">
                {live()?.address ?? report()?.finalAddress ?? props.origin}
              </span>
            ),
          },
          {
            label: "Frames per second",
            value: (
              <span data-testid="scale-flight-fps">
                {live()
                  ? live()?.fps.toFixed(0)
                  : measured()
                    ? report()?.fps.toFixed(0)
                    : unmeasured()}
              </span>
            ),
          },
          {
            label: "Slowest 5% of frames",
            get value() {
              return flying()
                ? "In flight"
                : measured()
                  ? `${report()?.p95FrameMs.toFixed(1)} ms`
                  : unmeasured();
            },
          },
          {
            label: "Cells in memory",
            get value() {
              return `${shownCells().toLocaleString("en")} · ${formatSize(shownBytes())}`;
            },
          },
          {
            label: "Share of the billion",
            get value() {
              return `${residentShare() < 0.0001 && shownCells() > 0 ? "<0.0001" : residentShare().toFixed(4)}%`;
            },
          },
          {
            get label() {
              return report() && !flying() ? "Tile requests, last flight" : "Tile requests";
            },
            get value() {
              return (
                report() && !flying() ? (report()?.requests ?? 0) : props.requests
              ).toLocaleString("en");
            },
          },
        ]}
      />
      <Show when={flying()}>
        <span aria-hidden="true" class="sw-sp-flight-progress">
          <i style={{ width: `${(live()?.progress ?? 0) * 100}%` }} />
        </span>
      </Show>
      <p aria-live="polite" class="sw-sp-flight-report" data-testid="scale-flight-report">
        {(() => {
          const current = report();
          if (!current || flying()) return "";
          return current.instant
            ? `${FLIGHTS[current.kind].label}: jumped straight to ${current.finalAddress} because reduced motion is on. Peak resident ${formatSize(current.peakResidentBytes)} while addressing ${SCALE_LOGICAL_CELLS.toLocaleString("en")} cells.`
            : `${FLIGHTS[current.kind].label}: ${current.frames.toLocaleString("en")} frames in ${(current.durationMs / 1000).toFixed(1)} s, slowest frame ${current.maxFrameMs.toFixed(0)} ms. Peak resident ${formatSize(current.peakResidentBytes)} while addressing ${SCALE_LOGICAL_CELLS.toLocaleString("en")} cells.`;
        })()}
      </p>
    </>
  );
}

const MAP_WIDTH = 168;
const MAP_HEIGHT = 216;
/** Tiles the map remembers, oldest dropped first. */
const MAP_MEMORY = 4096;

interface ScaleMinimapProps {
  tiles: readonly (DatasourceTile & { residence: string })[];
  window: {
    firstRow: number;
    lastRow: number;
    firstColumn: number;
    lastColumn: number;
  };
  onJump(row: number, col: number): void;
}

/**
 * The whole 1,000,000 × 1,000 address space at a glance. Each visited tile
 * lights up; the crosshair marks the visible window. Clicking teleports there
 * as a pointer shortcut; the jump form and the row and column sliders in the
 * side panel are the keyboard controls for the same navigation.
 */
export function ScaleMinimap(props: Readonly<ScaleMinimapProps>) {
  let canvas!: HTMLCanvasElement;
  let seen = new Map<number, DatasourceTile & { residence: string }>();
  // Canvas colors are resolved at draw time, so a theme change must redraw.
  const [themeRevision, setThemeRevision] = createSignal(0);
  onMount(() => onCleanup(observeSiteTheme(() => setThemeRevision((revision) => revision + 1))));

  createEffect(() => {
    themeRevision();
    for (const tile of props.tiles) seen.set(tile.id, tile);
    if (seen.size > MAP_MEMORY) seen = new Map([...seen.entries()].slice(-MAP_MEMORY));
    const view = props.window;
    const context = canvas.getContext("2d");
    if (!context) return;
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
    const warn = color("--sw-warning", "#f59e0b");

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

    for (const tile of seen.values()) {
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
  });

  // Clicking is a pointer shortcut only, so it is attached outside the
  // accessibility tree; the jump form and sliders are the keyboard path.
  onMount(() => {
    const teleport = (event: MouseEvent) => {
      const box = canvas.getBoundingClientRect();
      props.onJump(
        ((event.clientY - box.top) / box.height) * SCALE_ROWS,
        ((event.clientX - box.left) / box.width) * SCALE_COLUMNS,
      );
    };
    canvas.addEventListener("click", teleport);
    onCleanup(() => canvas.removeEventListener("click", teleport));
  });

  return (
    <figure aria-hidden="true" class="sw-sp-flight__map">
      <canvas
        data-testid="scale-flight-map"
        height={MAP_HEIGHT}
        ref={(element) => {
          canvas = element;
        }}
        style={{ width: `${MAP_WIDTH}px`, height: `${MAP_HEIGHT}px` }}
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
