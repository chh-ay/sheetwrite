import assert from "node:assert/strict";
import { act, createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { createApp, defineComponent, h, nextTick, ref, shallowRef } from "vue";
// Bun resolves the public `svelte` entry to its server runtime outside a browser
// bundle, so this lifecycle boundary intentionally selects Svelte's client entry.
import { flushSync, mount, unmount } from "../node_modules/svelte/src/index-client.js";
import type { GridReadyEvent } from "../packages/core/dist/adapter.js";
import { type Grid, SheetwriteError } from "../packages/core/dist/index.js";
import { installCanvasTestStubs } from "../packages/core/src/testing.js";
import { SheetwriteGrid as ReactSheetwriteGrid } from "../packages/react/src/index.js";
import SvelteLifecycleHarness from "../packages/svelte/test/InitializationHarness.svelte";
import {
  type SheetwriteGridExpose,
  SheetwriteGrid as VueSheetwriteGrid,
} from "../packages/vue/src/index.js";
import { makeConformanceWorkbook } from "./adapter-lifecycle-contract.js";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type InitializationSource = Uint8Array | Promise<ArrayBuffer> | undefined;
type InitializationErrorHandler = (error: SheetwriteError) => void;

interface InitializationDriver {
  host: HTMLElement;
  ready: GridReadyEvent[];
  publishedAtReady: Array<Grid | null | undefined>;
  getPublishedGrid(): Grid | null | undefined;
  update(
    source: InitializationSource,
    handler: InitializationErrorHandler,
    readOnly?: boolean,
  ): Promise<void>;
  unmount(): Promise<void>;
}

const workbook = makeConformanceWorkbook();

function assertPendingLiveOptionsAtReady(grid: Grid): void {
  let edits = 0;
  const unsubscribe = grid.on("edit-begin", () => {
    edits += 1;
  });
  try {
    grid.beginEdit(1, 0, "must not write");
    assert.equal(edits, 0, "pending readOnly must be applied before ready");
    grid.setReadOnly(false);
    grid.beginEdit(1, 0, "positive control");
    assert.equal(edits, 1, "the ready grid must have an editable cell");
    grid.setReadOnly(true);
  } finally {
    unsubscribe();
  }
}

async function mountReact(
  source: InitializationSource,
  handler: InitializationErrorHandler,
): Promise<InitializationDriver> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const grid = createRef<Grid>();
  const ready: GridReadyEvent[] = [];
  const publishedAtReady: Array<Grid | null | undefined> = [];

  const render = async (
    nextSource: InitializationSource,
    nextHandler: InitializationErrorHandler,
    readOnly = false,
  ): Promise<void> => {
    await act(async () => {
      root.render(
        createElement(ReactSheetwriteGrid, {
          ref: grid,
          workbook,
          wasmSource: nextSource,
          readOnly,
          onInitializationError: nextHandler,
          onReady: (event: GridReadyEvent) => {
            assertPendingLiveOptionsAtReady(event.grid);
            publishedAtReady.push(grid.current);
            ready.push(event);
          },
          fallback: createElement("span", { "data-lifecycle-fallback": "" }, "loading"),
        }),
      );
    });
  };

  await render(source, handler);
  return {
    host,
    ready,
    publishedAtReady,
    getPublishedGrid: () => grid.current,
    update: render,
    unmount: async () => {
      await act(async () => root.unmount());
    },
  };
}

async function mountVue(
  source: InitializationSource,
  handler: InitializationErrorHandler,
): Promise<InitializationDriver> {
  const host = document.createElement("div");
  document.body.append(host);
  const grid = ref<SheetwriteGridExpose | null>(null);
  const wasmSource = shallowRef<InitializationSource>(source);
  const initializationError = shallowRef(handler);
  const ready: GridReadyEvent[] = [];
  const readOnly = ref(false);
  const publishedAtReady: Array<Grid | null | undefined> = [];
  const Parent = defineComponent({
    setup() {
      return () =>
        h(
          VueSheetwriteGrid,
          {
            ref: grid,
            workbook,
            wasmSource: wasmSource.value,
            readOnly: readOnly.value,
            onInitializationError: initializationError.value,
            onReady: (event: GridReadyEvent) => {
              assertPendingLiveOptionsAtReady(event.grid);
              publishedAtReady.push(grid.value?.grid);
              ready.push(event);
            },
          },
          {
            fallback: () => h("span", { "data-lifecycle-fallback": "" }, "loading"),
          },
        );
    },
  });
  const app = createApp(Parent);
  app.mount(host);
  await nextTick();

  return {
    host,
    ready,
    publishedAtReady,
    getPublishedGrid: () => grid.value?.grid,
    update: async (nextSource, nextHandler, nextReadOnly = false) => {
      wasmSource.value = nextSource;
      initializationError.value = nextHandler;
      readOnly.value = nextReadOnly;
      await nextTick();
    },
    unmount: async () => {
      app.unmount();
      await nextTick();
    },
  };
}

interface SvelteLifecycleHarnessApi {
  update(props: SvelteInitializationProps): void;
  updateReadOnly(readOnly: boolean): void;
  getGrid(): Grid | undefined;
  getPublishedAtReady(): Array<Grid | null | undefined>;
}

interface SvelteInitializationProps {
  workbook: typeof workbook;
  wasmSource: InitializationSource;
  fallbackLabel: string;
  readOnly?: boolean;
  onInitializationError: InitializationErrorHandler;
  onReady(event: GridReadyEvent): void;
}

async function mountSvelte(
  source: InitializationSource,
  handler: InitializationErrorHandler,
): Promise<InitializationDriver> {
  const host = document.createElement("div");
  document.body.append(host);
  const ready: GridReadyEvent[] = [];
  const initialProps: SvelteInitializationProps = {
    workbook,
    wasmSource: source,
    fallbackLabel: "loading",
    readOnly: false,
    onInitializationError: handler,
    onReady: (event) => {
      assertPendingLiveOptionsAtReady(event.grid);
      ready.push(event);
    },
  };
  const component = mount(SvelteLifecycleHarness, {
    target: host,
    props: { initialProps },
  }) as SvelteLifecycleHarnessApi;
  flushSync();
  await Promise.resolve();
  flushSync();
  let committedSource = source;
  let committedHandler = handler;

  return {
    host,
    ready,
    publishedAtReady: component.getPublishedAtReady(),
    getPublishedGrid: () => component.getGrid(),
    update: async (nextSource, nextHandler, readOnly = false) => {
      if (nextSource === committedSource && nextHandler === committedHandler) {
        component.updateReadOnly(readOnly);
      } else {
        component.update({
          ...initialProps,
          wasmSource: nextSource,
          onInitializationError: nextHandler,
          readOnly,
        });
        committedSource = nextSource;
        committedHandler = nextHandler;
      }
      flushSync();
      await Promise.resolve();
      flushSync();
    },
    unmount: async () => {
      await unmount(component);
      flushSync();
    },
  };
}

const adapter = process.argv[process.argv.length - 1];
assert.ok(adapter === "react" || adapter === "vue" || adapter === "svelte", "adapter required");
const mountAdapter = adapter === "react" ? mountReact : adapter === "vue" ? mountVue : mountSvelte;

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await Bun.sleep(5);
  }
  throw new Error(message);
}

const restoreCanvas = installCanvasTestStubs();
// wasm-bindgen awaits module inputs before instantiation. A deferred buffer is
// used only at this test seam to make stale asynchronous work deterministic.

try {
  if (process.env.ADAPTER_PENDING_LIVE_ONLY === "1") {
    const source = Promise.withResolvers<ArrayBuffer>();
    const errorHandler: InitializationErrorHandler = (error) => {
      throw error;
    };
    const pending = await mountAdapter(source.promise, errorHandler);
    await pending.update(source.promise, errorHandler, true);
    source.resolve(
      await Bun.file(
        new URL("../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url),
      ).arrayBuffer(),
    );
    await waitFor(() => pending.ready.length === 1, "pending live options were not ready");
    assert.equal(pending.publishedAtReady[0], pending.ready[0]?.grid);
    await pending.unmount();
    restoreCanvas();
    process.stdout.write('{"pendingLiveOptions":true}\n');
    process.exit(0);
  }
  const staleSource = Promise.withResolvers<ArrayBuffer>();
  let staleErrors = 0;
  const stale = await mountAdapter(staleSource.promise, () => {
    staleErrors += 1;
  });
  assert.ok(stale.host.querySelector("[data-lifecycle-fallback]"));
  await stale.unmount();
  staleSource.resolve(new Uint8Array([0]).buffer);
  await Bun.sleep(20);
  assert.equal(stale.ready.length, 0);
  assert.equal(staleErrors, 0);
  assert.equal(stale.getPublishedGrid() ?? null, null);

  let currentErrors = 0;
  const currentFailures: SheetwriteError[] = [];
  const reportCurrentFailure: InitializationErrorHandler = (error) => {
    assert.ok(error instanceof SheetwriteError);
    assert.equal(error.code, "initialization-failed");
    assert.equal(error.operation, "initialize");
    currentErrors += 1;
    currentFailures.push(error);
  };
  const replacement = await mountAdapter(new Uint8Array([0]), reportCurrentFailure);
  assert.ok(replacement.host.querySelector("[data-lifecycle-fallback]"));
  await waitFor(() => currentErrors === 1, "true initialization failure was not reported once");

  const sourceA = Promise.withResolvers<ArrayBuffer>();
  await replacement.update(sourceA.promise, reportCurrentFailure);
  const conflictingSource = new Uint8Array([1]);
  await replacement.update(conflictingSource, reportCurrentFailure);
  await waitFor(() => currentErrors === 2, "conflicting source rejection was not reported once");
  await replacement.update(conflictingSource, reportCurrentFailure, true);
  assert.equal(currentFailures.length, 2);
  const firstFailure = currentFailures[0];
  assert.ok(firstFailure, "initial source must report its failure");
  assert.equal(firstFailure.toJSON().name, "SheetwriteError");

  const wasm = await Bun.file(
    new URL("../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url),
  ).arrayBuffer();
  if (adapter === "react") {
    await act(async () => {
      sourceA.resolve(wasm);
      await Promise.resolve();
    });
    await waitFor(
      () => replacement.ready.length === 1,
      "successful first source did not make the current component ready",
    );
  } else {
    sourceA.resolve(wasm);
    await waitFor(
      () => replacement.ready.length === 1,
      "successful first source did not make the current component ready",
    );
  }
  const readyEvent = replacement.ready[0];
  assert.ok(readyEvent, "initialized adapter must publish a ready generation");
  assert.equal(replacement.publishedAtReady[0], readyEvent.grid);
  assert.equal(replacement.getPublishedGrid(), readyEvent.grid);
  assert.deepEqual(
    { generation: readyEvent.generation, reason: readyEvent.reason },
    { generation: 1, reason: "initial" },
  );
  assert.equal(replacement.host.querySelectorAll('[role="grid"]').length, 1);
  assert.equal(replacement.host.querySelector("[data-lifecycle-fallback]"), null);

  readyEvent.grid.setReadOnly(false);
  const liveGrid = readyEvent.grid;
  const selectedAddress = { sheet: "lifecycle", row: 1, col: 0 };
  const selection = { kind: "cell" as const, addr: selectedAddress };
  liveGrid.setSelection(selection);
  liveGrid.applyTransaction({
    patches: [
      {
        op: "set",
        addr: selectedAddress,
        value: { kind: "literal", value: "preserved edit" },
      },
    ],
  });
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...arguments_) => warnings.push(arguments_);
  try {
    await replacement.update(new Uint8Array([2]), reportCurrentFailure);
    await Bun.sleep(10);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1, "changed explicit source must retain loader diagnostics");
  assert.match(String(warnings[0]?.[0]), /keeping the first module/);
  assert.equal(replacement.getPublishedGrid(), liveGrid);
  assert.deepEqual(liveGrid.getSelection(), selection);
  assert.equal(liveGrid.store.getCell(selectedAddress).resolved, "preserved edit");
  assert.equal(replacement.ready.length, 1);
  assert.equal(currentErrors, 2);
  const sameGrid = replacement.getPublishedGrid() === liveGrid;
  const selectionPreserved = JSON.stringify(liveGrid.getSelection()) === JSON.stringify(selection);
  const editPreserved = liveGrid.store.getCell(selectedAddress).resolved === "preserved edit";
  await replacement.unmount();
  assert.equal(replacement.getPublishedGrid() ?? null, null);

  process.stdout.write(
    `${JSON.stringify({
      adapter,
      staleReady: stale.ready.length,
      staleErrors,
      currentErrors,
      generation: readyEvent.generation,
      reason: readyEvent.reason,
      readyCount: replacement.ready.length,
      publishedBeforeReady: replacement.publishedAtReady[0] === readyEvent.grid,
      sameGrid,
      selectionPreserved,
      editPreserved,
    })}\n`,
  );
} finally {
  restoreCanvas();
}
