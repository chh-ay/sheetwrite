---
title: "SheetwriteEngine | @sheetwrite/core"
description: "A complete engine module from @sheetwrite/wasm or @sheetwrite/formulas."
---
<!-- api-export:@sheetwrite/core|.|SheetwriteEngine -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

A complete engine module from `@sheetwrite/wasm` or `@sheetwrite/formulas`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/engine.ts#L4"><code>packages/core/src/engine.ts#L4</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-engine-cell-store" data-pagefind-weight="1">
<summary><code>CellStore</code></summary>

```ts generated
CellStore: typeof defaultEngine.CellStore;
```

</details>

<details class="api-member" id="sheetwrite-engine-load" data-pagefind-weight="1">
<summary><code>load</code></summary>

```ts generated
load: typeof defaultEngine.load;
```

</details>

<details class="api-member" id="sheetwrite-engine-is-loaded" data-pagefind-weight="1">
<summary><code>isLoaded</code></summary>

```ts generated
isLoaded: typeof defaultEngine.isLoaded;
```

</details>

<details class="api-member" id="sheetwrite-engine-function-names" data-pagefind-weight="1">
<summary><code>functionNames</code> <span class="api-member-summary">The optional full engine reports its accepted function names.</span></summary>

```ts generated
functionNames?: () => string[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SheetwriteEngine {
  CellStore: typeof defaultEngine.CellStore;
  load: typeof defaultEngine.load;
  isLoaded: typeof defaultEngine.isLoaded;
  functionNames?: () => string[];
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>SheetwriteEngine</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/init-sheetwrite/"><code>initSheetwrite</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
