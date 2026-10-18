---
title: Vanilla JavaScript
description: Own Sheetwrite initialization and Grid lifetime without a framework adapter.
---

Use `@sheetwrite/core` directly when the host owns the DOM lifetime. You
initialize the engine, create the Grid, and destroy it yourself.

<dl class="sw-fw-facts">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Entry points</dt><dd><code>initSheetwrite</code>, <code>createGrid</code></dd></div>
<div><dt>Grid access</dt><dd>The returned <code>Grid</code></dd></div>
<div><dt>Change events</dt><dd><code>grid.on("change")</code></dd></div>
</dl>

## Install

```sh verify
npm install @sheetwrite/core
```

## Mount a grid

Call `initSheetwrite()` on the client, pass an existing element to `createGrid`,
and keep the returned `Grid` for events and commands.

```ts prelude="framework" partial="requires host-owned workbook data" title="Vanilla lifecycle"
import {
  createGrid,
  initSheetwrite,
  type ChangeEvent,
  type ColumnarData,
  type Workbook,
} from "@sheetwrite/core";

export async function mountSheetwrite(
  host: HTMLElement,
  workbook: Workbook,
  data: ColumnarData,
  persistChange: (event: ChangeEvent) => void,
) {
  await initSheetwrite();
  const grid = createGrid(host, { workbook, data });
  const off = grid.on("change", persistChange);

  return () => {
    off();
    grid.destroy();
  };
}
```

## Listen to changes

`grid.on("change", …)` reports committed changes and returns a function that
removes the listener. The cleanup function in the example removes the listener
and then destroys the Grid.

## Data and rendering

A datasource-backed Grid can use dense storage or allocation-lazy paged storage.
Full-sheet operations can throw `IncompleteDataError` until every required page
is loaded. Worker rendering falls back to the main-thread canvas when the
browser lacks a capability or the worker fails to start; listen to
`renderer-fallback` if the host must report that change.

<div class="sw-next-links">
<a href="/vanilla/"><span>Example</span><strong>Run the Vanilla example</strong></a>
<a href="/docs/start/installation/"><span>Setup</span><strong>Installation and WASM sources</strong></a>
<a href="/docs/api/core/"><span>Reference</span><strong><code>@sheetwrite/core</code> API</strong></a>
</div>
