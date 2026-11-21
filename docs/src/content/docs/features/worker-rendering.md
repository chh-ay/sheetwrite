---
title: Worker rendering
description: Paint the grid in a Web Worker with OffscreenCanvas, and fall back to the main thread when the browser can't.
---

Sheetwrite paints on the main thread by default (`renderer: "canvas"`). When a
busy main thread could stall scrolling, paint in a Web Worker instead. The
worker draws into an OffscreenCanvas, and the rest of the grid works as before.

## Enabling it

Set `renderer: "worker"`. Vite, webpack 5 and Parcel build the worker for you,
so nothing else is needed with them. To confirm that the worker started, see
[Verify it actually started](#verify-it-actually-started).

```ts prelude="wasm" partial="requires surrounding host state" title="Partial example"
const grid = createGrid(host, { workbook, datasource, renderer: "worker" });
```

Pass `workerUrl` when no bundler builds the worker: you use no bundler, or
yours copies the file without building it. The URL must be the one the browser
fetches. The worker ships as `@sheetwrite/core/dist/worker.js`, exported as
`@sheetwrite/core/worker`. The browser's `Worker` and `URL` don't read package
exports, so `new URL("@sheetwrite/core/worker", import.meta.url)` gives a URL
that returns 404. Use one of these two recipes.

**Any setup:** the worker is an ES module that imports its sibling files, so
copying `worker.js` alone breaks it. Copy the package's whole `dist/` folder
into your static files, and pass the URL of the copied `worker.js`:

```sh verify title="Verified command"
cp -r node_modules/@sheetwrite/core/dist public/sheetwrite
```

```ts prelude="wasm" partial="requires surrounding host state" title="Partial example"
import { createGrid, initSheetwrite } from "@sheetwrite/core";

await initSheetwrite();

const grid = createGrid(host, {
  workbook,
  datasource,
  renderer: "worker",
  workerUrl: "/sheetwrite/worker.js",
});
```

**Vite:** import the worker with the `?worker&url` query. Vite bundles the
worker and its imports into one file and gives you its URL:

```ts prelude="wasm" partial="requires surrounding host state" title="Partial example"
import workerUrl from "@sheetwrite/core/worker?worker&url";
```

`workerUrl` accepts a `string | URL`.

## Verify it actually started

When the worker can't start, the grid paints on the main thread instead (see
[Automatic fallback](#automatic-fallback)). Check which one runs:

```ts prelude="wasm" partial="requires surrounding host state" title="Partial example"
grid.on("renderer-fallback", ({ error }) => {
  console.warn("Sheetwrite worker renderer unavailable, using canvas:", error);
});

if (grid.rendererKind() !== "worker") {
  // main-thread rendering is active
}
```


## How it works

- On mount the renderer constructs the `Worker`, creates a `<canvas>`, and
  transfers control of it to the worker with `transferControlToOffscreen()`. The
  worker paints into that `OffscreenCanvas` off the main thread.
- Layout, theme, viewport, and each painted window are posted to the worker as
  messages. The window snapshot is the same typed-array-backed `VisibleWindowView`
  the store produces, so it is cheap to transfer.
- Painting therefore continues smoothly even when the main thread is busy.

### Raw string IDs and epochs

Every `VisibleWindowView` carries a store-wide `stringPoolEpoch` (a u32 exposed
as a JavaScript number). Its `stringPoolIds` and `stringPoolUpdateIds` are valid
only in that epoch. Committed string collection can remap IDs: the same numeric
ID may name different text afterward. Never persist raw pool IDs as document
values or retain an ID-to-text cache across an epoch change.

Both transferable and shared-memory frames, including frozen panes, carry the
issuing epoch. The host reader and paint worker invalidate their own caches
before resolving IDs or applying that epoch's string updates. Resolved `values`
and window-local error strings do not require pool lookup; the view still has
its normal lifetime until the next store mutation or window refresh.

Direct WASM readers must compare `WindowView.stringPoolEpoch()` with
`CellStore.stringPoolEpoch()` before passing IDs to `poolStrings`. For raw
`persistedCellData` projections, capture the store epoch alongside the read and
resolve those IDs before any operation that can collect strings. If the epoch
has changed, discard the raw projection and read it again.

## Automatic fallback

The grid creates the worker **before** it hands over the canvas. If that
fails, because the browser has no `OffscreenCanvas` or blocks the worker URL,
the grid paints on the main thread with `CanvasRenderer`. It emits one
`renderer-fallback` event with a `SheetwriteError`. The grid keeps working:
worker rendering is an improvement, never a requirement.

The grid also falls back when the worker stops later: after a crash, a message
one side cannot read, no `ready` reply in 10 seconds, or a lost 2D context.
`error.context.failure` names the cause; see
[Error handling](/docs/concepts/error-handling/#recovery-by-boundary).

## Limitation: no custom renderers

Custom cell renderers are functions, and functions can't be sent to a worker.
With `renderer: "worker"`, the `renderers` option and `defineCellRenderer`
have no effect, because the worker has no renderers of its own. If you use a
custom [`CellRenderer`](/docs/features/grid/options-and-presentation/#gridoptions),
use the main-thread `canvas` renderer.

## See also

- [Configuration](/docs/features/grid/options-and-presentation/#gridoptions) for `renderer` and `workerUrl`.
- [Concepts](/docs/concepts/runtime-ownership/#canvas-rendering-and-the-wasm-columnar-store) for the transferable window snapshot.
