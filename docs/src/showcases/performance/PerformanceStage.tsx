import { SCALE_COLUMNS, SCALE_ROWS } from "@docs/showcases/scenarios/scale.js";
import { cellA1, colToA1 } from "@sheetwrite/core";
import { createSignal, For, onMount, Show } from "solid-js";

import { Icon } from "../../components/Icon.js";
import {
  ShowcaseControlGroup,
  ShowcaseReadout,
  ShowcaseStage,
  ShowcaseStatus,
} from "../layout/ShowcaseLayout.js";
import { whenNearViewport } from "../lib/near-viewport.js";
import { Button } from "../ui/Button.js";
import { createScaleFlight, type ScaleFlight } from "./flight.js";
import { FlightControls, FlightReadout, ScaleMinimap } from "./FlightPanel.js";
import {
  activeStorage,
  DEFAULT_CEILING_MIB,
  evictionStress,
  evictionWatch,
  firstColumn,
  firstRow,
  grid,
  gridState,
  jumpTo,
  lastColumn,
  lastRow,
  mountWorkbench,
  pagedStats,
  recentEvictions,
  recentTiles,
  renderer,
  rendererState,
  residentTiles,
  selectedFormula,
  selection,
  setEvictionStress,
  setRenderer,
  setStatus,
  stats,
  status,
  STRESS_CEILING_MIB,
  telemetry,
  windowA1,
  zoom,
  zoomTo,
} from "./workbench.js";

/** Jumps to shares of the sheet's height, from the first row to the last. */
const LANDMARKS = [0, 0.25, 0.5, 0.75, 1] as const;

const GRID_STATE_LABEL = {
  ready: "Grid ready",
  error: "Grid unavailable",
  loading: "Loading Grid",
};

const ready = () => gridState() === "ready";

/** The Grid's status and zoom, in the demo window bar. */
function GridZoom() {
  return (
    <span class="sw-sp-window-actions">
      <ShowcaseStatus tone={ready() ? "ok" : gridState() === "error" ? "error" : "neutral"}>
        {GRID_STATE_LABEL[gridState()]}
      </ShowcaseStatus>
      <fieldset aria-label="Grid zoom" class="sw-sp-zoom">
        <Button
          aria-label="Zoom out"
          disabled={!ready() || zoom() <= 0.5}
          onClick={() => zoomTo(zoom() - 0.25)}
          variant="quiet"
        >
          <Icon name="minus" />
        </Button>
        <output aria-label="Current zoom" data-testid="scale-zoom-value">
          {Math.round(zoom() * 100)}%
        </output>
        <Button
          aria-label="Zoom in"
          disabled={!ready() || zoom() >= 2}
          onClick={() => zoomTo(zoom() + 0.25)}
          variant="quiet"
        >
          <Icon name="plus" />
        </Button>
        <Button disabled={!ready() || zoom() === 1} onClick={() => zoomTo(1)} variant="quiet">
          Reset
        </Button>
      </fieldset>
    </span>
  );
}

/** The address-space map, row and column sliders, and the live window readout. */
function WindowNavigator() {
  return (
    <div class="sw-sp-navigator">
      <ScaleMinimap
        onJump={(row, column) => jumpTo(row, column, "landmark")}
        tiles={recentTiles()}
        window={{
          firstRow: firstRow(),
          lastRow: lastRow(),
          firstColumn: firstColumn(),
          lastColumn: lastColumn(),
        }}
      />
      <label class="sw-sp-slider">
        <span>
          Rows
          <strong data-testid="scale-readable-rows">
            {(firstRow() + 1).toLocaleString("en")}–{(lastRow() + 1).toLocaleString("en")}
          </strong>
        </span>
        <input
          aria-label="Vertical sheet overview"
          aria-valuetext={`Row ${firstRow() + 1} of ${SCALE_ROWS}`}
          data-testid="scale-overview"
          disabled={!ready()}
          max={SCALE_ROWS - 1}
          min={0}
          onInput={(event) => jumpTo(Number(event.currentTarget.value), firstColumn(), "overview")}
          step={1}
          type="range"
          value={firstRow()}
        />
      </label>
      <label class="sw-sp-slider">
        <span>
          Columns
          <strong>
            {colToA1(firstColumn())}–{colToA1(lastColumn())} of {colToA1(SCALE_COLUMNS - 1)}
          </strong>
        </span>
        <input
          aria-label="Horizontal sheet overview"
          aria-valuetext={`Column ${firstColumn() + 1} (${colToA1(firstColumn())}) of ${SCALE_COLUMNS}`}
          data-testid="scale-column-overview"
          disabled={!ready()}
          max={SCALE_COLUMNS - 1}
          min={0}
          onInput={(event) =>
            jumpTo(firstRow(), Number(event.currentTarget.value), "column-overview")
          }
          step={1}
          type="range"
          value={firstColumn()}
        />
      </label>
      <ShowcaseReadout
        items={[
          { label: "Selected", value: <span data-testid="scale-current-a1">{selection()}</span> },
          {
            label: "Window",
            value: (
              <>
                <span data-testid="scale-window-a1">{windowA1()}</span>
                <span class="sw-sp-visually-hidden">
                  <span data-testid="scale-window-rows">
                    {firstRow() + 1}–{lastRow() + 1}
                  </span>
                  <span data-testid="scale-window-columns">
                    {colToA1(firstColumn())}–{colToA1(lastColumn())}
                  </span>
                </span>
              </>
            ),
          },
          {
            label: "Cell input",
            value: (
              <code data-testid="scale-selected-formula">
                {selectedFormula() ?? "Literal value"}
              </code>
            ),
          },
        ]}
      />
    </div>
  );
}

/** The renderer switch and the tight clean-cache ceiling. */
function DrawingControls() {
  return (
    <>
      <details class="sw-sp-render-details">
        <summary>
          <span>Drawing path</span>
          <strong>
            <span data-testid="scale-renderer-active">{rendererState()?.active ?? renderer()}</span>{" "}
            renderer
          </strong>
          <Icon name="chevron-down" />
        </summary>
        <fieldset class="sw-sp-render-switch">
          <legend>Grid drawing path</legend>
          <Button
            aria-pressed={renderer() === "canvas"}
            data-testid="scale-renderer-canvas"
            onClick={() => setRenderer("canvas")}
          >
            Main canvas
          </Button>
          <Button
            aria-pressed={renderer() === "worker"}
            data-testid="scale-renderer-worker"
            onClick={() => setRenderer("worker")}
          >
            Worker canvas
          </Button>
        </fieldset>
        <Show when={rendererState()}>
          {(state) => (
            <p class="sw-sp-rendererstate" data-testid="scale-renderer-state">
              Requested <strong>{state().requested}</strong>; running{" "}
              <strong>{state().active}</strong>
              {state().fallback
                ? ` — Worker construction failed, so Grid reported and used its main-canvas fallback: ${state().fallback}`
                : "."}
            </p>
          )}
        </Show>
      </details>
      <p class="sw-showcase__control-description" id="scale-stress-description">
        A tight {STRESS_CEILING_MIB} MiB ceiling remounts the Grid so clean tiles evict early;
        sparse edits survive.
      </p>
      <Button
        aria-describedby="scale-stress-description"
        aria-pressed={evictionStress()}
        data-testid="scale-eviction-stress"
        disabled={gridState() === "loading"}
        onClick={() => setEvictionStress((active) => !active)}
      >
        <Icon name="gauge" />
        {evictionStress() ? "Tight ceiling active" : "Use the tight ceiling"}
      </Button>
      <ShowcaseReadout
        items={[
          {
            label: "Clean-tile ceiling",
            get value() {
              return `${evictionStress() ? STRESS_CEILING_MIB : DEFAULT_CEILING_MIB} MiB`;
            },
          },
          {
            label: "Resident tiles",
            get value() {
              return `${residentTiles()} live · ${recentEvictions()} evicted`;
            },
          },
        ]}
      />
    </>
  );
}

/** The exact row and column form, and jumps to the start, middle, end or a random row. */
function JumpControls() {
  const [jumpRow, setJumpRow] = createSignal("742000");
  const [jumpColumn, setJumpColumn] = createSignal("4");
  const handleJump = () => {
    const row = Number(jumpRow());
    const column = Number(jumpColumn());
    if (
      !/^\d+$/.test(jumpRow().trim()) ||
      !/^\d+$/.test(jumpColumn().trim()) ||
      !Number.isSafeInteger(row) ||
      !Number.isSafeInteger(column) ||
      row < 1 ||
      column < 1
    ) {
      setStatus("Enter whole numbers: row 1–1,000,000 and column 1–1,000.");
      return;
    }
    jumpTo(row - 1, column - 1, "form");
  };
  return (
    <>
      <form
        class="sw-sp-jump"
        onSubmit={(event) => {
          event.preventDefault();
          handleJump();
        }}
      >
        <label for="scale-jump-row">
          Row
          <input
            data-testid="scale-jump-row"
            id="scale-jump-row"
            inputmode="numeric"
            max={SCALE_ROWS}
            min={1}
            onInput={(event) => setJumpRow(event.currentTarget.value)}
            type="number"
            value={jumpRow()}
          />
        </label>
        <label for="scale-jump-column">
          Column
          <input
            data-testid="scale-jump-column"
            id="scale-jump-column"
            inputmode="numeric"
            max={SCALE_COLUMNS}
            min={1}
            onInput={(event) => setJumpColumn(event.currentTarget.value)}
            type="number"
            value={jumpColumn()}
          />
        </label>
        <Button data-testid="scale-jump" disabled={!ready()} type="submit" variant="primary">
          <Icon name="arrow-right" />
          Jump to cell
        </Button>
      </form>
      <fieldset aria-label="Jump to a share of the rows" class="sw-sp-quick-jumps">
        <For each={LANDMARKS}>
          {(ratio) => (
            <Button
              data-testid={`scale-landmark-${ratio * 100}`}
              disabled={!ready()}
              onClick={() =>
                jumpTo(Math.round((SCALE_ROWS - 1) * ratio), firstColumn(), "landmark")
              }
            >
              {ratio * 100}%
            </Button>
          )}
        </For>
        <Button
          disabled={!ready()}
          onClick={() => jumpTo(Math.floor(Math.random() * SCALE_ROWS), firstColumn(), "landmark")}
        >
          Random
        </Button>
      </fieldset>
    </>
  );
}

/** The band under the stage: flights, what a flight measures, and exact jumps. */
function WorkbenchControls(props: Readonly<{ flight: ScaleFlight }>) {
  return (
    <>
      <ShowcaseControlGroup
        description="Each flight scrolls the real Grid with public API calls. Nothing is pre-rendered."
        title="Fly the Grid"
      >
        <FlightControls flight={props.flight} ready={ready()} />
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        description="Read from the Grid while it moves."
        title="Flight readings"
      >
        <FlightReadout
          flight={props.flight}
          origin={cellA1(firstRow(), firstColumn())}
          requests={telemetry().requests}
          resident={{
            bytes: stats().paged?.allocatedBytes ?? 0,
            cells: stats().paged?.loadedCells ?? 0,
          }}
        />
      </ShowcaseControlGroup>
      <ShowcaseControlGroup title="Go to any cell">
        <JumpControls />
      </ShowcaseControlGroup>
    </>
  );
}

/** Props of {@link PerformanceStage}. */
export interface PerformanceStageProps {
  readonly demoTitle: string;
}

/** The performance showcase's island: the billion-address Grid, its panel and instruments. */
export function PerformanceStage(props: PerformanceStageProps) {
  let host!: HTMLDivElement;
  const flight = createScaleFlight(grid, () => telemetry().requests, pagedStats, setStatus);
  onMount(() => mountWorkbench(host, (start) => whenNearViewport(host, start)));

  return (
    <ShowcaseStage
      controls={<WorkbenchControls flight={flight} />}
      demo={
        <div class="sw-sp-demo" data-state={gridState()} id="million-rows">
          {/* Sheetwrite upgrades this host into a virtualized ARIA grid. */}
          <div
            aria-label="Million-row financial operations grid — one-billion-address Sheetwrite Grid"
            class="sw-sp-grid"
            data-cache-bytes={activeStorage().cacheBytes}
            data-chunk-rows={activeStorage().chunkRows}
            data-testid="scale-grid"
            ref={(element) => {
              host = element;
            }}
            role="grid"
          />
          <Show when={evictionWatch()}>
            {(watch) => (
              <p
                class="sw-sp-eviction-watch"
                data-clean-state={watch().cleanState}
                data-testid="scale-eviction-watch"
              >
                <strong>
                  Edited {cellA1(watch().dirty.row, watch().dirty.col)} = {watch().value}
                </strong>
                <span>
                  dirty owner {watch().dirtyState} · clean comparison{" "}
                  {cellA1(watch().clean.row, watch().clean.col)} {watch().cleanState}
                </span>
                <Show when={watch().cleanState === "unloaded"}>
                  <em>Clean tile evicted; sparse dirty value retained for revisit.</em>
                </Show>
              </p>
            )}
          </Show>
          <p aria-live="polite" class="sw-sp-status" data-testid="scale-status" role="status">
            {status()}
          </p>
          <div class="sw-sp-instruments">
            <ShowcaseControlGroup
              description="The whole sheet: lit tiles were loaded. Click the map to teleport."
              title="Where you are"
            >
              <WindowNavigator />
            </ShowcaseControlGroup>
            <ShowcaseControlGroup title="Drawing and cache">
              <DrawingControls />
            </ShowcaseControlGroup>
          </div>
        </div>
      }
      demoActions={<GridZoom />}
      demoLabel="Billion-address Grid workbench"
      demoTitle={props.demoTitle}
    />
  );
}
