import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";

import type {
  GridAdapterEventHandlers,
  GridReadyEvent,
  SheetwriteInitializationProps,
} from "../packages/core/src/adapter.js";
import type {
  CellEditor,
  ColumnarData,
  DataSource,
  DataSourcePage,
  Grid,
  GridEvents,
  GridOptions,
  Workbook,
} from "../packages/core/src/index.js";
import type * as Core from "../packages/core/src/index.js";
import type * as Testing from "../packages/core/src/testing.js";
import type * as XlsxSlots from "../packages/core/src/xlsx-slots.js";
import { expectDifferent, expectSame } from "./expect-same.js";

// The adapters load core's built entry, and the built package keeps no declarations for these
// internal paths, so the test loads their runtime from dist with the source modules' types.
const BUILT_CORE: string = "../packages/core/dist/index.js";
const BUILT_TESTING: string = "../packages/core/dist/testing.js";
const BUILT_XLSX_SLOTS: string = "../packages/core/dist/xlsx-slots.js";
const { initSheetwrite } = (await import(BUILT_CORE)) as typeof Core;
const { installCanvasTestStubs } = (await import(BUILT_TESTING)) as typeof Testing;
const { setXlsxTableExportBackend, xlsxTableExportBackend } = (await import(
  BUILT_XLSX_SLOTS
)) as typeof XlsxSlots;

export function makeConformanceWorkbook(label = "Lifecycle"): Workbook {
  return {
    activeSheet: "lifecycle",
    sheets: [
      {
        id: "lifecycle",
        name: label,
        rowCount: 3,
        columns: [{ key: "name", header: "Name", width: 140, type: "text" }],
      },
    ],
  };
}

function makeConformanceData(): ColumnarData {
  return { rowCount: 3, columns: { name: ["Row 1", "Row 2", "Row 3"] } };
}

/** Returns `value`, failing the test with `what` when it is missing. */
export function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Missing ${what}`);
  return value;
}

const WAIT_FOR_EVENT_MS = 5_000;

/** Lets tasks run until `predicate` holds. */
async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + WAIT_FOR_EVENT_MS;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for adapter event");
    await Bun.sleep(0);
  }
}

export interface AdapterConformanceProps
  extends GridOptions, GridAdapterEventHandlers, SheetwriteInitializationProps {
  fallbackLabel: string;
}

export interface MountedAdapter {
  readonly host: HTMLElement;
  readonly publishedAtReady: Array<Grid | null | undefined>;
  getPublishedGrid(): Grid | null | undefined;
  render(props: AdapterConformanceProps): Promise<void>;
  unmount(): Promise<void>;
}

export type MountAdapter = (props: AdapterConformanceProps) => Promise<MountedAdapter>;

/** Ready events of a mount, with the number of times each created grid was destroyed. */
function createLifecycleRecorder() {
  const ready: GridReadyEvent[] = [];
  const destroyCalls = new Map<Grid, number>();
  const onReady = (event: GridReadyEvent): void => {
    const originalDestroy = event.grid.destroy.bind(event.grid);
    destroyCalls.set(event.grid, 0);
    event.grid.destroy = () => {
      destroyCalls.set(event.grid, (destroyCalls.get(event.grid) ?? 0) + 1);
      originalDestroy();
    };
    ready.push(event);
  };
  const props: AdapterConformanceProps = {
    workbook: makeConformanceWorkbook(),
    data: makeConformanceData(),
    fallbackLabel: "lifecycle fallback",
    onReady,
  };
  return { ready, destroyCalls, onReady, props };
}

/** Mounts with the recorder's props plus `extra`, and returns the published grid too. */
async function mountRecorded(mount: MountAdapter, extra: Partial<AdapterConformanceProps> = {}) {
  const recorder = createLifecycleRecorder();
  const props: AdapterConformanceProps = { ...recorder.props, ...extra };
  const mounted = await mount(props);
  return { ...recorder, props, mounted, grid: present(mounted.getPublishedGrid(), "grid") };
}

export function runSharedAdapterLifecycleContract(adapter: string, mount: MountAdapter): void {
  let restoreStubs = (): void => {};
  beforeAll(async () => {
    await initSheetwrite();
  });
  beforeEach(() => {
    document.body.replaceChildren();
    restoreStubs = installCanvasTestStubs();
  });
  afterEach(() => restoreStubs());

  describe(`${adapter} shared lifecycle contract`, () => {
    it("aborts pending summary, clipboard and save work when the framework unmounts", async () => {
      const clipboardRead = Promise.withResolvers<string>();
      const savedBytes = Promise.withResolvers<Uint8Array>();
      const saveStarted = Promise.withResolvers<AbortSignal | undefined>();
      const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
      const errors = spyOn(console, "error").mockImplementation(() => undefined);
      const warnings = spyOn(console, "warn").mockImplementation(() => undefined);
      const reportedErrors: unknown[] = [];
      let callbacksAfterUnmount = 0;
      let isUnmounted = false;
      const observeCallback = () => {
        if (isUnmounted) callbacksAfterUnmount += 1;
      };
      const workbook = makeConformanceWorkbook();
      const sheet = present(workbook.sheets[0], "sheet");
      // Large enough that summarizing the selection is still pending at unmount.
      sheet.rowCount = 100_000;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { readText: () => clipboardRead.promise },
      });
      // The test's exporter stands in for any installed one, which it puts back.
      const installedTableExport = xlsxTableExportBackend();
      setXlsxTableExportBackend({
        name: "pending-unmount-save",
        toXlsxTable(_workbook, _store, options) {
          saveStarted.resolve(options?.signal);
          return savedBytes.promise;
        },
      });
      let mounted: MountedAdapter | undefined;
      try {
        mounted = await mount({
          workbook,
          presentation: "data-grid",
          fallbackLabel: "Loading",
          onReady: observeCallback,
          onGridChange: observeCallback,
          onSelectionChange: observeCallback,
          onExportError: (event) => reportedErrors.push(event),
        });
        const grid = present(mounted.getPublishedGrid(), "grid");
        grid.actions.exportXlsx();
        const saveSignal = await saveStarted.promise;
        grid.setSelection({
          kind: "range",
          range: {
            sheet: sheet.id,
            start: { row: 0, col: 0 },
            end: { row: sheet.rowCount - 1, col: 0 },
          },
        });
        const summary = grid.summarizeSelection().then(observeCallback, (error: unknown) => error);
        const paste = grid.actions.paste();
        grid.actions.find();
        await mounted.unmount();
        mounted = undefined;
        isUnmounted = true;
        expect(saveSignal?.aborted).toBe(true);
        clipboardRead.resolve("late clipboard");
        savedBytes.reject(new Error("late save failure"));
        expect(await summary).toMatchObject({ name: "AbortError" });
        expect(await paste).toBe("empty");
        await Bun.sleep(0);
        expect(callbacksAfterUnmount).toBe(0);
        expect(reportedErrors).toHaveLength(0);
        expect(errors).toHaveBeenCalledTimes(0);
        expect(warnings).toHaveBeenCalledTimes(0);
      } finally {
        await mounted?.unmount();
        setXlsxTableExportBackend(installedTableExport);
        if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
        else Reflect.deleteProperty(navigator, "clipboard");
        errors.mockRestore();
        warnings.mockRestore();
      }
    });

    it("shares fallback, current-error, retry, stale-generation and pending-option semantics", async () => {
      // WASM initialization is process-wide, so the probe needs a fresh process.
      const root = new URL("../", import.meta.url).pathname;
      const preloads = ["../test-setup.ts", "../test-setup-svelte.ts"].flatMap((path) => [
        "--preload",
        new URL(path, import.meta.url).pathname,
      ]);
      const probe = new URL("./adapter-initialization-probe.ts", import.meta.url).pathname;
      const child = Bun.spawn(["bun", ...preloads, probe, adapter.toLowerCase()], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stderr, exitCode] = await Promise.all([
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(exitCode, stderr).toBe(0);
    });

    it("retires a generation when onReady throws without reclassifying the consumer error", async () => {
      const recorder = createLifecycleRecorder();
      const failure = new Error("ready consumer failed");
      const initializationErrors: unknown[] = [];
      const consumerErrors: unknown[] = [];
      const originalReportError = globalThis.reportError;
      globalThis.reportError = (error) => consumerErrors.push(error);
      let mounted: MountedAdapter | undefined;
      try {
        try {
          mounted = await mount({
            ...recorder.props,
            onReady(event) {
              recorder.onReady(event);
              throw failure;
            },
            onInitializationError: (error) => initializationErrors.push(error),
          });
        } catch (error) {
          consumerErrors.push(error);
        }
        await Promise.resolve();
        expect(consumerErrors).toContain(failure);
        expect(initializationErrors).toEqual([]);
        expect(document.querySelector('[role="grid"]')).toBeNull();
        expect(mounted?.getPublishedGrid() ?? null).toBeNull();
        expect(recorder.ready).toHaveLength(1);
        expect([...recorder.destroyCalls.values()]).toEqual([1]);
      } finally {
        globalThis.reportError = originalReportError;
        await mounted?.unmount();
      }
    });

    for (const [resetCase, reason] of [
      ["workbook", "input-reset"],
      ["renderer", "renderer-reset"],
    ] as const) {
      it(`publishes one live grid, recreates once when ${resetCase} changes, and cleans up`, async () => {
        const { mounted, props, ready, destroyCalls, grid } = await mountRecorded(mount);
        expect(ready).toMatchObject([{ grid, generation: 1, reason: "initial" }]);
        expect(mounted.publishedAtReady).toEqual([grid]);

        await mounted.render({
          ...props,
          workbook: resetCase === "workbook" ? makeConformanceWorkbook("Next") : props.workbook,
          renderer: resetCase === "renderer" ? "worker" : props.renderer,
        });
        const second = present(mounted.getPublishedGrid(), "replacement grid");

        expectDifferent(second, grid);
        expect(ready).toHaveLength(2);
        expect(ready[1]).toMatchObject({ grid: second, generation: 2, reason });
        expectSame(mounted.publishedAtReady.at(-1), second);
        expect(destroyCalls.get(grid)).toBe(1);
        expect(mounted.host.querySelectorAll('[role="grid"]')).toHaveLength(1);

        await mounted.unmount();
        expect(destroyCalls.get(second)).toBe(1);
        expect(mounted.getPublishedGrid() ?? null).toBeNull();
        expect(mounted.host.childElementCount).toBe(0);
      });
    }

    it("delivers grid events to the current callbacks and applies live options in place", async () => {
      const log: string[] = [];
      const handlersFor = (tag: string): Partial<AdapterConformanceProps> => ({
        onViewportChange: () => log.push(`${tag} viewport`),
        onCommandStateChange: () => log.push(`${tag} command`),
        onGridChange: (event) => log.push(`${tag} change ${event.transaction.patches.length}`),
        onSelectionChange: (selection) => log.push(`${tag} select ${selection?.kind ?? "none"}`),
        onActiveSheetChange: (event) => log.push(`${tag} sheet ${event.sheet}`),
      });
      const workbook = makeConformanceWorkbook();
      const first = present(workbook.sheets[0], "sheet");
      workbook.sheets.push({ ...first, id: "second", name: "Second" });
      const { mounted, props, ready, destroyCalls, grid } = await mountRecorded(mount, {
        workbook,
        ...handlersFor("old"),
      });
      // Edits, selects a cell, then switches sheets, which selects the other
      // sheet's last cell, or A1, as in Excel.
      const exercise = (row: number, nextSheet: string): string[] => {
        log.length = 0;
        const value = { kind: "literal" as const, value: `edit ${row}` };
        grid.store.applyTransaction({
          patches: [{ op: "set", addr: { sheet: "lifecycle", row, col: 0 }, value }],
        });
        grid.setSelection({ kind: "cell", addr: { sheet: grid.getActiveSheet(), row, col: 0 } });
        grid.setActiveSheet(nextSheet);
        grid.refresh();
        return [...new Set(log)].sort();
      };
      const expected = (tag: string, sheet: string) =>
        [
          `${tag} change 1`,
          `${tag} command`,
          `${tag} select cell`,
          `${tag} sheet ${sheet}`,
          `${tag} viewport`,
        ].sort();

      expect(exercise(1, "second")).toEqual(expected("old", "second"));

      await mounted.render({
        ...props,
        ...handlersFor("new"),
        theme: { bg: "#102030" },
        overscan: 9,
        minColumns: 12,
      });
      expectSame(mounted.getPublishedGrid(), grid);
      expect(ready).toHaveLength(1);
      expect(grid.getEffectiveTheme().bg).toBe("#102030");
      expect(mounted.host.querySelector('[role="grid"]')?.getAttribute("aria-colcount")).toBe("12");
      expect(exercise(2, "lifecycle")).toEqual(expected("new", "lifecycle"));

      await mounted.render({ ...props, ...handlersFor("new"), onCommandStateChange: undefined });
      expect(exercise(0, "second")).not.toContain("new command");

      await mounted.unmount();
      expect(destroyCalls.get(grid)).toBe(1);
    });

    it("forwards mutation, renderer, datasource and export failures to their callbacks", async () => {
      const events: string[] = [];
      const exported = Promise.withResolvers<void>();
      const workbook = makeConformanceWorkbook();
      const locked = { sheet: "lifecycle", row: 0, col: 0 };
      present(workbook.sheets[0], "sheet").protectedRanges = [
        { id: "locked", range: { sheet: "lifecycle", start: locked, end: locked } },
      ];
      let requests = 0;
      // A synchronous throw from the first request must still reach the mounted adapter.
      const datasource: DataSource = {
        capabilities: { protocol: 2, columns: "windowed" },
        getRows() {
          requests += 1;
          if (requests === 1) throw new Error("datasource failure");
          return Promise.withResolvers<DataSourcePage>().promise;
        },
      };
      const { mounted, grid } = await mountRecorded(mount, {
        workbook,
        data: undefined,
        datasource,
        renderer: "worker",
        onMutationRejected: (event) => events.push(`mutation ${event.issues[0]?.kind}`),
        onRendererFallback: (event) => events.push(`fallback ${event.requested}`),
        onDatasourceError: (event) => events.push(`datasource ${event.error.code}`),
        onExportError: (event) => {
          events.push(`export ${event.error.code}`);
          exported.resolve();
        },
      });
      const installedTableExport = xlsxTableExportBackend();
      setXlsxTableExportBackend({
        name: "adapter-rejecting-export",
        async toXlsxTable() {
          throw new Error("export failure");
        },
      });
      try {
        const value = { kind: "literal" as const, value: "rejected" };
        grid.applyTransaction({ patches: [{ op: "set", addr: locked, value }] });
        grid.actions.exportXlsx();
        await exported.promise;
        await waitFor(() => events.length === 4);
      } finally {
        setXlsxTableExportBackend(installedTableExport);
      }

      expect(events.sort()).toEqual([
        "datasource datasource-request-failed",
        "export export-failed",
        "fallback worker",
        "mutation protection",
      ]);
      await mounted.unmount();
    });

    it("drops stale datasource delivery after replacement and unmount", async () => {
      const delivered: string[] = [];
      /** A datasource whose requests stay pending until the returned `fail` runs. */
      const pendingDatasource = () => {
        const request = Promise.withResolvers<DataSourcePage>();
        const state = { requests: 0 };
        const datasource: DataSource = {
          capabilities: { protocol: 2, columns: "windowed" },
          getRows() {
            state.requests += 1;
            return request.promise;
          },
        };
        return { datasource, state, fail: (message: string) => request.reject(new Error(message)) };
      };
      const stale = pendingDatasource();
      const { mounted, props, grid } = await mountRecorded(mount, {
        data: undefined,
        datasource: stale.datasource,
        onDatasourceError: () => delivered.push("stale"),
      });
      await waitFor(() => stale.state.requests > 0);

      const current = pendingDatasource();
      const onDatasourceError = (event: GridEvents["datasource-error"]) =>
        delivered.push(event.error.message);
      await mounted.render({ ...props, datasource: current.datasource, onDatasourceError });
      await waitFor(() => current.state.requests > 0);
      expectDifferent(mounted.getPublishedGrid(), grid);

      stale.fail("stale generation");
      await Bun.sleep(0);
      expect(delivered).toEqual([]);
      current.fail("current generation");
      await waitFor(() => delivered.length === 1);
      expect(delivered).toEqual(["current generation"]);

      const unmounted = pendingDatasource();
      await mounted.render({ ...props, datasource: unmounted.datasource, onDatasourceError });
      await waitFor(() => unmounted.state.requests > 0);
      await mounted.unmount();
      unmounted.fail("unmounted generation");
      await Bun.sleep(0);
      expect(delivered).toEqual(["current generation"]);
    });

    it("forwards semantic headers, and aborts and destroys a custom editor when the framework unmounts", async () => {
      const workbook = makeConformanceWorkbook();
      present(workbook.sheets[0]?.columns[0], "column").editor = "framework";
      const lifecycle: string[] = [];
      let signal: AbortSignal | undefined;
      const editor: CellEditor = {
        mount(host, context) {
          signal = context.signal;
          lifecycle.push("mount");
          const input = host.appendChild(document.createElement("input"));
          return {
            update() {},
            reposition() {},
            commit: () => input.value,
            cancel() {},
            destroy: () => lifecycle.push("destroy"),
          };
        },
      };
      const { mounted, grid } = await mountRecorded(mount, {
        workbook,
        presentation: "data-grid",
        editors: { framework: editor },
      });

      expect(mounted.host.querySelector('[role="columnheader"]')?.textContent).toBe("Name");
      grid.beginEdit(0, 0);
      expect([lifecycle, signal?.aborted]).toEqual([["mount"], false]);

      await mounted.unmount();
      expect([lifecycle, signal?.aborted]).toEqual([["mount", "destroy"], true]);
    });
  });
}

/** Props for an adapter's simple `Sheetwrite` component; the size props may break its rule. */
export interface SimpleAdapterSizeProps {
  columns: readonly { key: string; title: string }[];
  defaultRows: readonly Record<string, string>[];
  height?: number;
  fill?: true;
}

/** Renders the simple component into `host`; `error` is what the framework reported, if anything. */
export type RenderSimpleAdapter = (
  host: HTMLElement,
  props: SimpleAdapterSizeProps,
) => Promise<{ error: unknown; unmount(): Promise<void> }>;

const BAD_SIZES: ReadonlyArray<[string, Pick<SimpleAdapterSizeProps, "height" | "fill">]> = [
  ["both height and fill", { height: 200, fill: true }],
  ["neither height nor fill", {}],
];

export function runSimpleAdapterSizeContract(adapter: string, render: RenderSimpleAdapter): void {
  describe(`${adapter} simple component size rule`, () => {
    for (const [label, size] of BAD_SIZES) {
      it(`rejects ${label} while rendering, before a grid host exists`, async () => {
        const errors = spyOn(console, "error").mockImplementation(() => undefined);
        const warnings = spyOn(console, "warn").mockImplementation(() => undefined);
        const host = document.body.appendChild(document.createElement("div"));
        try {
          const rendered = await render(host, {
            columns: [{ key: "name", title: "Name" }],
            defaultRows: [{ name: "Ada" }],
            ...size,
          });

          expect(rendered.error).toMatchObject({
            name: "SheetwriteError",
            code: "invalid-argument",
            operation: "create-grid",
          });
          expect(host.querySelector(".sheetwrite")).toBeNull();
          await rendered.unmount();
        } finally {
          host.remove();
          errors.mockRestore();
          warnings.mockRestore();
        }
      });
    }
  });
}
