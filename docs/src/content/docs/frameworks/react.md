---
title: React
description: Integrate Sheetwrite with React ownership, readiness, and controlled resets.
---

`@sheetwrite/react` wraps a Grid in a React component. It initializes WASM after
the component mounts on the client, so the page stays server-renderable.

<dl class="sw-fw-facts">
<div><dt>Package</dt><dd><code>@sheetwrite/react</code></dd></div>
<div><dt>Components</dt><dd><code>Sheetwrite</code>, <code>SheetwriteGrid</code></dd></div>
<div><dt>Grid access</dt><dd>Forwarded ref and <code>onReady</code></dd></div>
<div><dt>Change events</dt><dd><code>onGridChange</code> prop</dd></div>
</dl>

## Install

```sh verify
npm install @sheetwrite/react
```

Import `@sheetwrite/react/styles.css` once in your app.

## Mount a grid

Use `Sheetwrite` for the simple `columns` and `defaultRows` contract. Use
`SheetwriteGrid` when the host supplies a `Workbook` plus eager data or a
datasource.

```tsx prelude="react" partial="requires application-owned save state" title="React adapter"
import { Sheetwrite, type GridReadyEvent, type SimpleColumn } from "@sheetwrite/react";
import type { Transaction } from "@sheetwrite/core";
import "@sheetwrite/react/styles.css";

type Row = { name: string; amount: number };

interface SheetProps {
  columns: readonly SimpleColumn<Row>[];
  rows: readonly Row[];
  save: (transaction: Transaction) => void;
  onReady: (event: GridReadyEvent) => void;
}

export function Sheet({ columns, rows, save, onReady }: SheetProps) {
  return (
    <Sheetwrite
      columns={columns}
      defaultRows={rows}
      height={420}
      onGridChange={(event) => save(event.transaction)}
      onReady={onReady}
    />
  );
}
```

## Listen to changes

`onGridChange` reports committed Grid changes. `onReady` receives
`{ grid, generation, reason }` after the forwarded ref is assigned.

## Resets and cleanup

Replacing a reset-sensitive input creates a new Grid generation. Destroy the
persistence and sync coordinators that you attached to the previous Grid, then
attach new ones in `onReady`. The [lifecycle page](/docs/frameworks/lifecycle/)
lists which inputs update in place and which reset.

## Server rendering

Rendering the component on the server does not initialize WASM. In frameworks
that render on the server, mount it in a client component.

<div class="sw-next-links">
<a href="/react/"><span>Example</span><strong>Run the React example</strong></a>
<a href="/docs/frameworks/lifecycle/"><span>Lifecycle</span><strong>Updates and resets</strong></a>
<a href="/docs/api/react/"><span>Reference</span><strong><code>@sheetwrite/react</code> API</strong></a>
</div>
