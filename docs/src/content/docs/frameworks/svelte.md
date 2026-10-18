---
title: Svelte
description: Integrate Sheetwrite with Svelte bindings, callbacks, and reset ownership.
---

`@sheetwrite/svelte` wraps a Grid in a Svelte 5 component. It initializes WASM
in the browser.

<dl class="sw-fw-facts">
<div><dt>Package</dt><dd><code>@sheetwrite/svelte</code></dd></div>
<div><dt>Component</dt><dd><code>Sheetwrite</code></dd></div>
<div><dt>Grid access</dt><dd><code>bind:grid</code> and <code>onReady</code></dd></div>
<div><dt>Change events</dt><dd><code>onGridChange</code> prop</dd></div>
</dl>

## Install

```sh verify
npm install @sheetwrite/svelte
```

Import `@sheetwrite/svelte/styles.css` once in your app.

## Mount a grid

Bind `grid` when the host needs imperative access. Pass callbacks with the
adapter's camel-case props.

```svelte prelude="svelte" partial="requires application-owned rows" title="Svelte adapter"
<script lang="ts">
  import {
    Sheetwrite,
    type Grid,
    type GridReadyEvent,
    type SimpleColumn,
  } from "@sheetwrite/svelte";
  import type { ChangeEvent, Transaction } from "@sheetwrite/core";
  import "@sheetwrite/svelte/styles.css";

  type Row = { name: string; amount: number };
  interface Props {
    columns: readonly SimpleColumn<Row>[];
    rows: readonly Row[];
    save: (transaction: Transaction) => void;
    onReady: (event: GridReadyEvent) => void;
  }

  let { columns, rows, save, onReady }: Props = $props();
  let grid: Grid | undefined;
  const handleGridChange = (event: ChangeEvent) => save(event.transaction);
</script>

<Sheetwrite
  {columns}
  defaultRows={rows}
  height={420}
  bind:grid
  onGridChange={handleGridChange}
  {onReady}
/>
```

## Listen to changes

`onGridChange` reports committed Grid changes. The `grid` binding is set before
`onReady` runs.

## Resets and cleanup

The binding is cleared before a reset or unmount. A reset publishes a new
generation and reason; destroy the coordinators attached to the previous Grid
and create new ones. The [lifecycle page](/docs/frameworks/lifecycle/) lists
which inputs update in place and which reset.

## Server rendering

When the surrounding SvelteKit route renders on the server, use a client-only
boundary.

<div class="sw-next-links">
<a href="/svelte/"><span>Example</span><strong>Run the Svelte example</strong></a>
<a href="/docs/frameworks/lifecycle/"><span>Lifecycle</span><strong>Updates and resets</strong></a>
<a href="/docs/api/svelte/"><span>Reference</span><strong><code>@sheetwrite/svelte</code> API</strong></a>
</div>
