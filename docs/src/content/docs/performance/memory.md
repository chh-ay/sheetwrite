---
title: "Memory"
description: "Release retained engine memory, free grids and trim their caches, and read which owner holds each byte."
---

## Release retained engine memory

WebAssembly linear memory grows but does not shrink after cells or stores are cleared. When your application is idle after a large import, clear, or workbook disposal, call [`releaseEngineMemory`](/docs/api/core/release-engine-memory/) explicitly. Sheetwrite never schedules a release automatically.

```ts prelude="core" partial="requires an initialized application at an idle point" title="Explicit idle memory release"
import { releaseEngineMemory } from "@sheetwrite/core";

const report = await releaseEngineMemory();
```

The call waits for synchronous transactions and active datasource page loads, then moves all live stores together into a fresh instance of the selected engine. Cell sources, styles, cached formula results (including volatile results), resident datasource pages, unsaved dirty edits, and compact undo/redo history survive. Unloaded clean pages remain unloaded and can be fetched again from the datasource. Worker renderers rebuild their frames without document-change events.

The main-thread pause scales with resident cells and compact history, so do not invoke it on an interaction-critical path. Migration temporarily needs both instances and packed transfer buffers; it can increase peak memory before garbage collection reclaims the retired instance. If preparation fails, every live store stays on the original instance. Concurrent calls share the same release.

`report.wasmBytesBefore` and `report.wasmBytesAfter` are committed linear-memory bytes, not live-cell bytes or process memory. `report.pauseMs` measures migration, excluding the idle wait. A release is not guaranteed to reduce committed bytes: surviving data, compact history, and migration scratch can still require substantial memory. Actual process-memory reclamation depends on garbage collection.

## Grid lifetime and trimMemory

A grid owns its DOM, listeners, timers, renderer, worker and caches. Call `grid.destroy()` when the host view goes away. It frees all of them, and the store that the grid created. Caches that are not on the grid are keyed by their owner in a `WeakMap`, so they go with the grid; the few page-wide caches have a fixed size limit. A second `destroy()` call does nothing.

`grid.trimMemory()` gives back the memory that an open grid can build again: decoded cell strings, rendered number text, compiled number formats, text measurement and unused overlay nodes, in the grid and in its worker renderer. Document data, undo history and the visible output do not change. The next frame reads its window again and builds only what it paints. Call it on a memory signal from the host, or when the page goes to the background:

```ts prelude="core" partial="requires a mounted grid" title="Trim a grid in the background"
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") grid.trimMemory();
});
```

The number format caches are shared by all grids on the page, so one trim drops them for every grid. A trim does not shrink WebAssembly memory; call [`releaseEngineMemory`](/docs/api/core/release-engine-memory/) at an idle point for that. A trim after `destroy()` does nothing.

Two checks hold these rules. A Chromium browser test (`test/browser/grid-memory.spec.ts`) scrolls a 200,000-row sheet, trims, and requires the same screenshot, the same document and a lower retained heap. A Chromium benchmark creates and destroys 100 grids in one page and requires the retained heap after a full collection to stay within 5% of the heap after one warm-up grid, as the median of three runs in a fresh browser:

```sh verify title="Grid lifetime memory"
bun run build:packages
bun bench/src/grid-lifetime-browser-bench.ts --runs 3 --cycles 100
```

## Runtime resource ownership

The performance showcase at `/showcases/performance#resource-ownership` renders the public [`RuntimeResourceSnapshot`](/docs/api/core/runtime-resource-snapshot/) protocol directly. It keeps exclusive-owner logical bytes, allocated capacity, WASM committed pages, and independent browser runtime observations in separate buckets; committed pages are never summed into live payload. Bulk-edit before/settled deltas use [`diffRuntimeResourcePhases`](/docs/api/core/diff-runtime-resource-phases/) and omit unchanged owners.

The UI and this reference share [`RUNTIME_RESOURCE_SCHEMA_VERSION`](/docs/api/core/runtime-resource-schema-version/). Detailed peak phases remain in the validated benchmark artifact rather than being presented as measurements from the visitor's browser.

String collection reclaims obsolete pool text and densely remaps surviving IDs. Automatic collection runs only at committed edit transaction barriers, never during painting or page loading, when dead arena/span storage exceeds 256 KiB and the surviving arena/span storage. Growth-based backoff avoids repeatedly scanning unchanged live data. Bulk clears and sheet removal request a new threshold check at the next commit.

`compactStringStorage()` explicitly collects unreachable text and trims growth slack outside an active mutation/page load. Raw IDs are valid only within `stringPoolEpoch()`; retain the epoch with projections and invalidate caches on a change, as described in the [worker rendering guide](/docs/features/worker-rendering/#raw-string-ids-and-epochs). History snapshots own captured text. Persist resolved values, not pool IDs. Reclaimed Rust ownership does not imply that WebAssembly committed linear memory shrinks.

Reproduce and validate the full owner/operation matrix with:

```sh verify title="Runtime resource evidence"
bun run --filter @sheetwrite/bench bench:resource
```
