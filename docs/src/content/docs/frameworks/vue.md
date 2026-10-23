---
title: Vue
description: Integrate Sheetwrite with Vue events, exposed Grid state, and resets.
---

`@sheetwrite/vue` wraps a Grid in a Vue component. It initializes WASM after the
component mounts on the client.

<dl class="sw-fw-facts">
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Component</dt><dd><code>Sheetwrite</code></dd></div>
<div><dt>Grid access</dt><dd>Exposed <code>grid</code> and <code>@ready</code></dd></div>
<div><dt>Change events</dt><dd><code>@grid-change</code></dd></div>
</dl>

## Install

```sh verify
npm install @sheetwrite/vue
```

Import `@sheetwrite/vue/styles.css` once in your app.

## Mount a grid

The component accepts `columns` and `default-rows`. Templates use kebab-case
event listeners.

```vue prelude="vue" partial="requires application-owned rows" title="Vue adapter"
<script setup lang="ts">
import { Sheetwrite, type GridReadyEvent, type SimpleColumn } from "@sheetwrite/vue";
import type { ChangeEvent } from "@sheetwrite/core";
import "@sheetwrite/vue/styles.css";

type Row = { name: string; amount: number };

const { columns, rows } = defineProps<{
  columns: readonly SimpleColumn<Row>[];
  rows: readonly Row[];
}>();
const emit = defineEmits<{
  gridChange: [event: ChangeEvent];
  ready: [event: GridReadyEvent];
}>();

const handleGridChange = (event: ChangeEvent) => emit("gridChange", event);
const handleReady = (event: GridReadyEvent) => emit("ready", event);
</script>

<template>
  <Sheetwrite
    :columns="columns"
    :default-rows="rows"
    :height="420"
    @grid-change="handleGridChange"
    @ready="handleReady"
  />
</template>
```

## Listen to changes

`@grid-change` reports committed Grid changes. The component exposes `grid`
before it emits `ready`.

## Resets and cleanup

A reset clears the old exposed handle, creates a new generation, and then
publishes the replacement. Attach again any coordinator that subscribed to the
old Grid. The [lifecycle page](/docs/frameworks/lifecycle/) lists which inputs
update in place and which reset.

## Server rendering

Importing or rendering the component on the server does not start WASM. In Nuxt
or another server-rendered host, use a client-only boundary.

<div class="sw-next-links">
<a href="/vue/"><span>Example</span><strong>Run the Vue example</strong></a>
<a href="/docs/frameworks/lifecycle/"><span>Lifecycle</span><strong>Updates and resets</strong></a>
<a href="/docs/api/vue/"><span>Reference</span><strong><code>@sheetwrite/vue</code> API</strong></a>
</div>
