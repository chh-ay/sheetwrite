import { isRepeatClick } from "@docs/lib/action-guard.js";
import { selectionLabel } from "@docs/lib/selection-label.js";
import type { RendererState, RenderingMode } from "@docs/showcases/ui/rendering-mode.js";
import type { Workbench, WorkbenchDataMode } from "@docs/showcases/vanilla-workbench.js";
import type { PagedStoreStats, WorkbookSnapshot } from "@sheetwrite/core";
import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";

import { ActionError, pendingProps, useAction } from "../../../lib/use-action.js";
import { Button } from "../../ui/Button.js";
import { RadioGroup } from "../../ui/RadioGroup.js";
import { RenderingModeChoice } from "../RenderingModeChoice.js";
import type * as Engine from "./boot.js";

type Phase = "booting" | "live" | "failed" | "destroyed";
type WorkbenchScenario = "lifecycle" | "paged" | "xlsx";

interface ImportedDocument {
  readonly snapshot: WorkbookSnapshot;
  readonly label: string;
}

/** Props of {@link VanillaWorkbench}. */
export interface VanillaWorkbenchProps {
  /** Rows of the revenue pipeline, from the scenario. */
  readonly rows: number;
}

const WORKBENCH_SCENARIOS: readonly { id: WorkbenchScenario; label: string; kicker: string }[] = [
  { id: "lifecycle", label: "Main / Worker", kicker: "Renderer ownership" },
  { id: "paged", label: "Paged source", kicker: "Datasource ownership" },
  { id: "xlsx", label: "XLSX", kicker: "Workbook ownership" },
];

const DATA_PATHS: readonly { value: WorkbenchDataMode; label: string }[] = [
  { value: "columnar", label: "Dense" },
  { value: "paged", label: "Paged" },
];

const PROOF_LINKS = [
  { href: "/showcases/performance/#million-rows", label: "Paging proof" },
  { href: "/showcases/interoperability/#xlsx", label: "XLSX fidelity" },
  { href: "/showcases/database/", label: "Persistence" },
  { href: "/showcases/collaboration/", label: "Collaboration" },
];

function rendererLabel(kind: RenderingMode): string {
  return kind === "worker" ? "Web Worker" : "Main thread";
}

const kilobytes = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** The construction options in the page URL; defaults stay out of it. */
function readSpec(): { renderer: RenderingMode; data: WorkbenchDataMode } {
  const search = new URLSearchParams(window.location.search);
  return {
    renderer: search.get("renderer") === "worker" ? "worker" : "canvas",
    data: search.get("data") === "paged" ? "paged" : "columnar",
  };
}

function writeSpec(spec: { renderer: RenderingMode; data: WorkbenchDataMode }): void {
  const url = new URL(window.location.href);
  url.search = "";
  if (spec.renderer === "worker") url.searchParams.set("renderer", "worker");
  if (spec.data === "paged") url.searchParams.set("data", "paged");
  window.history.replaceState(window.history.state, "", url);
}

/**
 * The /vanilla/ workbench. Solid here is docs-site chrome only: every
 * spreadsheet behaviour flows through the framework-free host module
 * (@docs/showcases/vanilla-workbench.ts). This island holds the construction
 * options, mounts and destroys generations explicitly, and echoes public grid
 * events into visible state. The URL owns the options; the page is
 * prerendered without a query string, so the grid is created only after the
 * island reads them.
 */
export function VanillaWorkbench(props: VanillaWorkbenchProps) {
  let host!: HTMLDivElement;
  let fileInput!: HTMLInputElement;
  const tabs: HTMLButtonElement[] = [];
  let workbench: Workbench | null = null;
  let readOnlyNow = false;

  const [ready, setReady] = createSignal(false);
  const [renderer, setRenderer] = createSignal<RenderingMode>("canvas");
  const [data, setData] = createSignal<WorkbenchDataMode>("columnar");
  const [alive, setAlive] = createSignal(true);
  const [phase, setPhase] = createSignal<Phase>("booting");
  const [generation, setGeneration] = createSignal(0);
  const [resetCount, setResetCount] = createSignal(0);
  const [imported, setImported] = createSignal<ImportedDocument | null>(null);
  const [readOnly, setReadOnly] = createSignal(false);
  const [selection, setSelection] = createSignal("No active cell");
  const [bootError, setBootError] = createSignal<string | null>(null);
  const [rendererState, setRendererState] = createSignal<RendererState | null>(null);
  const [fallbackCount, setFallbackCount] = createSignal(0);
  const [pagedStats, setPagedStats] = createSignal<PagedStoreStats | null>(null);
  const [activity, setActivity] = createSignal<string | null>(null);
  const [scenario, setScenario] = createSignal<WorkbenchScenario>("lifecycle");
  const exportAction = useAction();
  const importAction = useAction();

  onMount(() => {
    const spec = readSpec();
    setRenderer(spec.renderer);
    setData(spec.data);
    if (spec.data === "paged") setScenario("paged");
    setReady(true);
  });

  const changeSpec = (next: { renderer: RenderingMode; data: WorkbenchDataMode }) => {
    setRenderer(next.renderer);
    setData(next.data);
    writeSpec(next);
  };

  // Reset is destroy + create of a fresh generation, not a state patch:
  // `resetCount` re-runs this effect with unchanged options.
  createEffect(
    on(
      [ready, alive, renderer, data, imported, resetCount],
      ([isReady, isAlive, kind, mode, doc]) => {
        if (!isReady || !isAlive) return;
        let cancelled = false;
        let created: Workbench | null = null;
        setPhase("booting");
        setBootError(null);
        setFallbackCount(0);
        setSelection("No active cell");
        void import("./boot.js")
          .then(async (engine) => {
            await engine.initSheetwrite();
            if (cancelled) return;
            const next = engine.createWorkbench(
              host,
              { renderer: kind, data: mode, ...(doc === null ? {} : { snapshot: doc.snapshot }) },
              {
                onActivity: setActivity,
                onSelectionChange: (next) => setSelection(selectionLabel(next, "No active cell")),
                onRendererChange: (state) => {
                  setRendererState(state);
                  if (state.fallback !== null) setFallbackCount((count) => count + 1);
                },
                onPagedStats: setPagedStats,
              },
            );
            next.setReadOnly(readOnlyNow);
            created = next;
            workbench = next;
            setPhase("live");
            setGeneration((count) => count + 1);
            setActivity(
              doc === null
                ? `Grid created — ${props.rows.toLocaleString()} rows, ${mode === "paged" ? "paged host source" : "dense columnar data"}`
                : `Grid created from ${doc.label}`,
            );
          })
          .catch(async (error: unknown) => {
            if (cancelled) return;
            const { describeActionError } = await import("./boot.js");
            const message = describeActionError(error);
            setPhase("failed");
            setBootError(message);
            setActivity(`Grid failed to boot: ${message}`);
          });
        onCleanup(() => {
          cancelled = true;
          created?.destroy();
          workbench = null;
          setPagedStats(null);
        });
      },
    ),
  );

  onMount(() => {
    void import("./boot.js").then(({ observeSiteTheme, ENGINE_THEME }) => {
      const stop = observeSiteTheme(() => workbench?.grid.replaceTheme(ENGINE_THEME));
      onCleanup(stop);
    });
  });

  const live = () => alive() && phase() === "live";
  // Between Create and the first booting run the phase still reads
  // "destroyed"; the button stays locked until this generation settles.
  const transitioning = () => phase() === "booting" || (alive() && phase() === "destroyed");
  // Only a live generation has a store and a paint loop; before that the
  // readout shows the requested options, never the previous generation.
  const requested = () => (live() ? (rendererState()?.requested ?? renderer()) : renderer());
  const activeLabel = () => {
    if (!alive()) return "none";
    return phase() === "live" ? rendererLabel(rendererState()?.active ?? renderer()) : "starting";
  };
  /** Allocation stays partial until the host has served every page. */
  const pagedState = (): "loading" | "partial" | "complete" => {
    const stats = pagedStats();
    if (stats === null) return "loading";
    return stats.fullyLoaded ? "complete" : "partial";
  };

  const changeRenderer = (next: RenderingMode) => {
    if (next === renderer()) return;
    setActivity(
      `Renderer is construction-bound — rebuilding on the ${rendererLabel(next).toLowerCase()}`,
    );
    changeSpec({ renderer: next, data: data() });
  };
  const changeData = (next: WorkbenchDataMode) => {
    if (next === data() && imported() === null) return;
    setImported(null);
    changeSpec({ renderer: renderer(), data: next });
  };
  const selectScenario = (next: WorkbenchScenario) => {
    setScenario(next);
    if (next === "paged" && data() !== "paged") changeData("paged");
    else if (next !== "paged" && data() === "paged") changeData("columnar");
  };
  const onScenarioKeyDown = (event: KeyboardEvent, index: number) => {
    const count = WORKBENCH_SCENARIOS.length;
    const target =
      event.key === "ArrowRight"
        ? (index + 1) % count
        : event.key === "ArrowLeft"
          ? (index - 1 + count) % count
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    const next = WORKBENCH_SCENARIOS[target];
    if (!next) return;
    selectScenario(next.id);
    tabs[target]?.focus();
  };
  const toggleGrid = (event: MouseEvent) => {
    // A double-click would destroy and then immediately re-create the grid.
    if (isRepeatClick(event) || transitioning()) return;
    if (!alive()) {
      setAlive(true);
      return;
    }
    setAlive(false);
    setPhase("destroyed");
    setActivity("Grid destroyed — no listeners, chrome, or canvas survive teardown");
  };
  const toggleReadOnly = (next: boolean) => {
    readOnlyNow = next;
    setReadOnly(next);
    workbench?.setReadOnly(next);
    setActivity(next ? "Editing locked — a live option, no rebuild needed" : "Editing unlocked");
  };
  const withGrid = (action: (current: Workbench, engine: typeof Engine) => void) => {
    const current = workbench;
    if (current === null) return;
    void import("./boot.js").then((engine) => {
      try {
        action(current, engine);
      } catch (error) {
        setActivity(engine.describeActionError(error));
      }
    });
  };
  const addSummary = () =>
    withGrid(({ grid }, engine) => {
      engine.addSummarySheet(grid, host.clientWidth);
      setActivity("Summary sheet active — live cross-sheet formulas over the fixture");
    });
  const total = () =>
    withGrid(({ grid }, engine) => {
      const sum = engine.totalRevenue(grid);
      setActivity(`Pipeline total ${money.format(sum)} across ${props.rows.toLocaleString()} rows`);
    });
  const exportWorkbook = () => {
    const current = workbench;
    if (current === null) return;
    void exportAction.run(
      async () => {
        const engine = await import("./boot.js");
        const bytes = await engine.exportWorkbookXlsx(current.grid, "sheetwrite-workbench.xlsx");
        setActivity(`Exported workbook — ${kilobytes.format(bytes / 1024)} KB of XLSX`);
      },
      (error) =>
        `Export failed: ${String(error instanceof Error ? error.message : error)} Try again.`,
    );
  };
  const importWorkbook = (file: File) => {
    void importAction.run(
      async () => {
        const engine = await import("./boot.js");
        const { snapshot, warnings } = await engine.importWorkbookXlsx(await file.arrayBuffer());
        setImported({ snapshot, label: file.name });
        setAlive(true);
        if (warnings.length > 0) {
          setActivity(
            `${file.name}: ${warnings.length} fidelity warning${warnings.length === 1 ? "" : "s"}`,
          );
        }
      },
      (error) =>
        `${file.name} could not be imported: ${String(error instanceof Error ? error.message : error)} Choose another file.`,
    );
  };

  return (
    <section class="sw-vanilla-app sw-vw" data-framework="vanilla">
      <header class="sw-vw-scenarios">
        <div class="sw-vw-scenarios__intro">
          <span>Grid ownership</span>
          <strong>Inspect the renderer, source, or workbook.</strong>
        </div>
        <div aria-label="Vanilla Grid scenarios" class="sw-vw-tabs" role="tablist">
          <For each={WORKBENCH_SCENARIOS}>
            {(item, index) => {
              const selected = () => scenario() === item.id;
              return (
                <button
                  aria-controls={`sw-vw-panel-${item.id}`}
                  aria-selected={selected()}
                  class="sw-vw-tab"
                  data-pending={selected() && phase() === "booting" ? "" : undefined}
                  data-selected={selected() ? "" : undefined}
                  id={`sw-vw-tab-${item.id}`}
                  onClick={() => selectScenario(item.id)}
                  onKeyDown={(event) => onScenarioKeyDown(event, index())}
                  ref={(node) => {
                    tabs[index()] = node;
                  }}
                  role="tab"
                  tabIndex={selected() ? 0 : -1}
                  type="button"
                >
                  <span>{item.kicker}</span>
                  <strong>{item.label}</strong>
                </button>
              );
            }}
          </For>
        </div>
      </header>

      <div class="sw-vw-workspace">
        <section aria-label="Live imperative Grid" class="sw-vw-gridstage">
          <header class="sw-vw-gridstage__header">
            <div>
              <span class="sw-vw-eyebrow">REAL GRID · EDITABLE</span>
              <h2>Revenue pipeline</h2>
            </div>
            <span class="sw-vw-gridstage__selection" data-testid="selection">
              {alive() ? selection() : "No grid mounted"}
            </span>
            <button
              class="sw-workbench-primary"
              data-tone={alive() ? "danger" : undefined}
              {...pendingProps(transitioning())}
              onClick={toggleGrid}
              type="button"
            >
              {transitioning() ? "Creating grid…" : alive() ? "Destroy grid" : "Create grid"}
            </button>
          </header>

          <div class="sw-vw-stagewrap">
            <div
              class="sw-vanilla-shell sw-vw-stage"
              ref={(element) => {
                host = element;
              }}
            />
            <Show when={alive() && phase() === "booting"}>
              <div class="sw-vw-veil" role="status">
                Initializing WASM and {props.rows.toLocaleString()} rows…
              </div>
            </Show>
            <Show when={alive() && phase() === "failed"}>
              <div class="sw-vw-state" data-testid="boot-failed" role="alert">
                <strong>Grid failed to boot</strong>
                <p>
                  The host reports the failure instead of retrying silently. Select Destroy grid,
                  then Create grid to retry the same construction options.
                </p>
                <Show when={bootError()}>
                  {(message) => <code class="sw-vw-state__error">{message()}</code>}
                </Show>
                <div class="sw-vw-teardown">
                  <div>
                    <span>Kept by the host</span>
                    <ul>
                      <li>lifecycle counter</li>
                      <li>construction options in the URL</li>
                      <li>host page source</li>
                      <li>the stage frame</li>
                    </ul>
                  </div>
                  <div>
                    <span>Next</span>
                    <ul>
                      <li>Destroy grid clears the failed generation</li>
                      <li>Then Create grid retries the same construction options</li>
                    </ul>
                  </div>
                </div>
              </div>
            </Show>
            <Show when={!alive()}>
              <div class="sw-vw-state" data-testid="destroyed" role="status">
                <strong>Grid destroyed</strong>
                <p>
                  destroy() released every resource this generation created. The host keeps only its
                  own record of the ownership boundary.
                </p>
                <div class="sw-vw-teardown">
                  <div>
                    <span>Removed with destroy()</span>
                    <ul>
                      <li>canvas and paint loop</li>
                      <li>toolbar, name box, formula bar</li>
                      <li>timers and store subscriptions</li>
                      <li>WASM store and cached pages</li>
                    </ul>
                  </div>
                  <div>
                    <span>Kept by the host</span>
                    <ul>
                      <li>lifecycle counter</li>
                      <li>construction options in the URL</li>
                      <li>host page source</li>
                      <li>the stage frame</li>
                    </ul>
                  </div>
                </div>
                <p class="sw-vw-state__hint">
                  Create grid in the stage header starts the next generation.
                </p>
              </div>
            </Show>
          </div>

          <footer class="sw-vw-statusbar">
            <span class="sw-vw-statusbar__label">Latest host event</span>
            <span aria-live="polite" class="sw-vw-activity" data-testid="activity" role="log">
              {activity() ?? "Waiting for the first host event"}
            </span>
          </footer>
        </section>

        <aside aria-label="Lifecycle ownership" class="sw-vw-instrument">
          <header class="sw-vw-identity">
            <p class="sw-vw-eyebrow">HOST-OWNED LIFECYCLE</p>
            <div>
              <h2>Host state</h2>
              <span
                class="sw-vw-lifecycle"
                data-generation={generation()}
                data-phase={alive() ? phase() : "destroyed"}
                data-testid="lifecycle"
              >
                {!alive()
                  ? `Generation ${generation()} · destroyed`
                  : phase() === "live"
                    ? `Generation ${generation()} · ready`
                    : phase() === "failed"
                      ? "Boot failed"
                      : `Generation ${generation() + 1} · creating`}
              </span>
            </div>
          </header>

          <dl aria-label="Owned resources" class="sw-vw-ownership">
            <div>
              <dt>Renderer</dt>
              <dd>
                <output
                  class="sw-vw-readout"
                  data-fallback-count={fallbackCount()}
                  data-testid="renderer"
                >
                  <span>
                    <span class="sw-vw-readout__key">Requested:</span> {rendererLabel(requested())}
                  </span>{" "}
                  <span>
                    <span class="sw-vw-readout__key">Active:</span> {activeLabel()}
                  </span>
                  <Show when={live() && rendererState()?.fallback}>
                    {(fallback) => (
                      <>
                        {" "}
                        <span class="sw-vw-readout__fallback">
                          <span class="sw-vw-readout__key">Fallback:</span> {fallback()}
                        </span>
                      </>
                    )}
                  </Show>
                </output>
              </dd>
            </div>
            <div>
              <dt>Datasource</dt>
              <dd>
                <Show
                  fallback={
                    <Show fallback="Not mounted" when={live()}>
                      Dense columnar · host memory
                    </Show>
                  }
                  when={live() && data() === "paged" && imported() === null}
                >
                  <span
                    class="sw-vw-paged"
                    data-chunks={pagedStats()?.chunks ?? 0}
                    data-fully-loaded={pagedStats()?.fullyLoaded ?? false}
                    data-testid="paged-stats"
                  >
                    <span>
                      <Show fallback="Host pages" when={pagedStats()}>
                        {(stats) =>
                          `${stats().chunks.toLocaleString()} pages · ${kilobytes.format(stats().allocatedBytes / 1024)} KB`
                        }
                      </Show>
                    </span>
                    <span class="sw-vw-load-state" data-state={pagedState()}>
                      {pagedState() === "complete"
                        ? "fully loaded"
                        : pagedState() === "partial"
                          ? "partially loaded"
                          : "loading"}
                    </span>
                  </span>
                </Show>
              </dd>
            </div>
            <div>
              <dt>Workbook</dt>
              <dd>{imported()?.label ?? "Revenue pipeline"}</dd>
            </div>
          </dl>

          <section
            aria-labelledby="sw-vw-tab-lifecycle"
            class="sw-vw-panel sw-vw-challenge"
            hidden={scenario() !== "lifecycle"}
            id="sw-vw-panel-lifecycle"
            role="tabpanel"
          >
            <header>
              <span>Lifecycle check</span>
              <strong>Edit, rebuild, then remove the Grid.</strong>
            </header>
            <ol>
              <li>
                <span>1</span>
                <div>
                  <strong>Edit one value</strong>
                  <p>Select B2, type a value in the formula bar, and commit it.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Switch its construction option</strong>
                  <div aria-label="Grid lifecycle" class="sw-vw-lifecycle-actions" role="toolbar">
                    <RenderingModeChoice
                      label="Rendering thread"
                      mode={renderer()}
                      onChange={changeRenderer}
                    />
                  </div>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Destroy, then create</strong>
                  <p>
                    The stage action ends this generation and starts the next one from the same
                    options.
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <section
            aria-labelledby="sw-vw-tab-paged"
            class="sw-vw-panel sw-vw-scenario-panel"
            hidden={scenario() !== "paged"}
            id="sw-vw-panel-paged"
            role="tabpanel"
          >
            <span>HOST DATASOURCE</span>
            <h3>Scroll to request only the pages the viewport needs.</h3>
            <p>
              Allocation above comes from the live store. A full-column total refuses partial data
              instead of inventing a result.
            </p>
            <div aria-label="Paged source actions" class="sw-vw-scenario-actions" role="toolbar">
              <Button disabled>Summary sheet</Button>
              <Button disabled={!live()} onClick={total}>
                Total ARR
              </Button>
              <Button onClick={() => changeData("columnar")}>Restore dense source</Button>
            </div>
            <p class="sw-vw-note">
              Summary sheet stays disabled while the store holds only the visited pages.
            </p>
          </section>

          <section
            aria-labelledby="sw-vw-tab-xlsx"
            class="sw-vw-panel sw-vw-scenario-panel"
            hidden={scenario() !== "xlsx"}
            id="sw-vw-panel-xlsx"
            role="tabpanel"
          >
            <span>HOST WORKBOOK I/O</span>
            <h3>Round-trip the live workbook, not a copied table.</h3>
            <p>Summary formulas, active sheet, and cell values cross the public core API.</p>
            <div aria-label="Workbook operations" class="sw-vw-actions" role="toolbar">
              <Button
                disabled={!live() || (data() === "paged" && imported() === null)}
                onClick={addSummary}
              >
                Summary sheet
              </Button>
              <Button disabled={!live()} onClick={total}>
                Total ARR
              </Button>
              <Button
                aria-busy={exportAction.pending || undefined}
                disabled={!live() || exportAction.pending}
                onClick={exportWorkbook}
              >
                {exportAction.pending ? "Exporting…" : "Export XLSX"}
              </Button>
              <Button
                aria-busy={importAction.pending || undefined}
                disabled={transitioning() || importAction.pending}
                onClick={() => fileInput.click()}
              >
                {importAction.pending ? "Importing…" : "Import XLSX"}
              </Button>
              <input
                accept=".xlsx"
                aria-label="Import an XLSX workbook"
                class="sw-visually-hidden"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file !== undefined) importWorkbook(file);
                }}
                ref={(element) => {
                  fileInput = element;
                }}
                type="file"
              />
            </div>
            <ActionError error={exportAction.error ?? importAction.error} />
          </section>

          <details class="sw-vw-details">
            <summary>Construction &amp; debug controls</summary>
            <div aria-label="Workbench controls" class="sw-vw-controls" role="toolbar">
              <div class="sw-vw-field">
                <span aria-hidden="true" class="sw-vw-field__label">
                  Data path
                </span>
                <RadioGroup
                  label="Data path"
                  onChange={changeData}
                  options={DATA_PATHS}
                  value={data()}
                />
              </div>
              <div class="sw-vw-field">
                <span aria-hidden="true" class="sw-vw-field__label">
                  Live option
                </span>
                <label class="sw-vw-toggle">
                  <input
                    checked={readOnly()}
                    onChange={(event) => toggleReadOnly(event.currentTarget.checked)}
                    type="checkbox"
                  />
                  Read-only
                </label>
              </div>
              <Button disabled={!live()} onClick={() => setResetCount((count) => count + 1)}>
                Reset generation
              </Button>
            </div>
            <nav aria-label="Dedicated capability proofs" class="sw-vw-proofs">
              <span class="sw-vw-proofs__label">Proof pages</span>
              <For each={PROOF_LINKS}>{(link) => <a href={link.href}>{link.label}</a>}</For>
            </nav>
          </details>
        </aside>
      </div>
    </section>
  );
}
