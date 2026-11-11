import assert from "node:assert/strict";

import { act } from "react";

import type { GridReadyEvent } from "../packages/core/dist/adapter.js";
import { type Grid, SheetwriteError } from "../packages/core/dist/index.js";
import { installCanvasTestStubs } from "../packages/core/src/testing.js";
import { mountReact } from "../packages/react/test/mount.js";
import { mountSvelte } from "../packages/svelte/test/mount.js";
import { mountVue } from "../packages/vue/test/mount.js";
import {
  type AdapterConformanceProps,
  makeConformanceWorkbook,
} from "./adapter-lifecycle-contract.js";

// Runs in its own process: WASM initialization is process-wide, and this probe
// observes an adapter mounting before, during and after it.
const MOUNTS = { react: mountReact, vue: mountVue, svelte: mountSvelte };
const adapter = process.argv.at(-1);
assert.ok(adapter === "react" || adapter === "vue" || adapter === "svelte", "adapter required");
const mountAdapter = MOUNTS[adapter];
const workbook = makeConformanceWorkbook();
const POLL_MS = 5;
const POLL_ATTEMPTS = 200;
const SETTLE_MS = 20;

// wasm-bindgen awaits module inputs before instantiation, so a deferred buffer
// makes stale asynchronous work deterministic at this test seam.
type InitializationSource = AdapterConformanceProps["wasmSource"] | Promise<ArrayBuffer>;
type InitializationErrorHandler = (error: SheetwriteError) => void;

/** Readiness must see a `readOnly` change committed while initialization was pending. */
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

/** Mounts the adapter; `update` re-renders it with another source, handler or `readOnly`. */
async function mountDriver(source: InitializationSource, handler: InitializationErrorHandler) {
  const ready: GridReadyEvent[] = [];
  const props = (
    wasmSource: InitializationSource,
    onInitializationError: InitializationErrorHandler,
    readOnly: boolean,
  ): AdapterConformanceProps => ({
    workbook,
    wasmSource: wasmSource as AdapterConformanceProps["wasmSource"],
    readOnly,
    onInitializationError,
    fallbackLabel: "loading",
    onReady: (event) => {
      assertPendingLiveOptionsAtReady(event.grid);
      ready.push(event);
    },
  });
  const mounted = await mountAdapter(props(source, handler, false));
  const update = (
    nextSource: InitializationSource,
    nextHandler: InitializationErrorHandler,
    readOnly = false,
  ) => mounted.render(props(nextSource, nextHandler, readOnly));
  return { mounted, ready, update };
}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    if (predicate()) return;
    await Bun.sleep(POLL_MS);
  }
  throw new Error(message);
}

const restoreCanvas = installCanvasTestStubs();
try {
  // A source that settles after unmount publishes nothing and reports nothing.
  const staleSource = Promise.withResolvers<ArrayBuffer>();
  let staleErrors = 0;
  const stale = await mountDriver(staleSource.promise, () => {
    staleErrors += 1;
  });
  assert.ok(stale.mounted.host.querySelector("[data-lifecycle-fallback]"));
  await stale.mounted.unmount();
  staleSource.resolve(new Uint8Array([0]).buffer);
  await Bun.sleep(SETTLE_MS);
  assert.equal(stale.ready.length, 0);
  assert.equal(staleErrors, 0);
  assert.equal(stale.mounted.getPublishedGrid() ?? null, null);

  // Each failed current source reports once, through the current handler.
  const currentFailures: SheetwriteError[] = [];
  const reportCurrentFailure: InitializationErrorHandler = (error) => {
    assert.ok(error instanceof SheetwriteError);
    assert.equal(error.code, "initialization-failed");
    assert.equal(error.operation, "initialize");
    currentFailures.push(error);
  };
  const current = await mountDriver(new Uint8Array([0]), reportCurrentFailure);
  const { host } = current.mounted;
  assert.ok(host.querySelector("[data-lifecycle-fallback]"));
  await waitFor(() => currentFailures.length === 1, "initialization failure was not reported once");

  const sourceA = Promise.withResolvers<ArrayBuffer>();
  await current.update(sourceA.promise, reportCurrentFailure);
  const conflictingSource = new Uint8Array([1]);
  await current.update(conflictingSource, reportCurrentFailure);
  await waitFor(() => currentFailures.length === 2, "conflicting source was not reported once");
  // Committed while sourceA is still pending; readiness must already apply it.
  await current.update(conflictingSource, reportCurrentFailure, true);
  assert.equal(currentFailures[0]?.toJSON().name, "SheetwriteError");

  // The pending first source still makes the current mount ready.
  const wasm = await Bun.file(
    new URL("../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url),
  ).arrayBuffer();
  const resolveSourceA = async () => {
    sourceA.resolve(wasm);
    await Promise.resolve();
  };
  await (adapter === "react" ? act(resolveSourceA) : resolveSourceA());
  await waitFor(() => current.ready.length === 1, "the first source did not make the mount ready");
  const readyEvent = current.ready[0];
  assert.ok(readyEvent, "initialized adapter must publish a ready generation");
  assert.equal(current.mounted.publishedAtReady[0], readyEvent.grid);
  assert.equal(current.mounted.getPublishedGrid(), readyEvent.grid);
  assert.deepEqual(
    { generation: readyEvent.generation, reason: readyEvent.reason },
    { generation: 1, reason: "initial" },
  );
  assert.equal(host.querySelectorAll('[role="grid"]').length, 1);
  assert.equal(host.querySelector("[data-lifecycle-fallback]"), null);

  // A later source change keeps the live grid, its selection and its edits.
  const liveGrid = readyEvent.grid;
  liveGrid.setReadOnly(false);
  const selectedAddress = { sheet: "lifecycle", row: 1, col: 0 };
  const selection = { kind: "cell" as const, addr: selectedAddress };
  liveGrid.setSelection(selection);
  liveGrid.applyTransaction({
    patches: [{ op: "set", addr: selectedAddress, value: { kind: "literal", value: "kept" } }],
  });
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    await current.update(new Uint8Array([2]), reportCurrentFailure);
    await Bun.sleep(SETTLE_MS);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1, "changed explicit source must retain loader diagnostics");
  assert.match(String(warnings[0]?.[0]), /keeping the first module/);
  assert.equal(current.mounted.getPublishedGrid(), liveGrid);
  assert.deepEqual(liveGrid.getSelection(), selection);
  assert.equal(liveGrid.store.getCell(selectedAddress).resolved, "kept");
  assert.equal(current.ready.length, 1);
  assert.equal(currentFailures.length, 2);
  await current.mounted.unmount();
  assert.equal(current.mounted.getPublishedGrid() ?? null, null);
} finally {
  restoreCanvas();
}
