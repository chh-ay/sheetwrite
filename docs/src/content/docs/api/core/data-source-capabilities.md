---
title: "DataSourceCapabilities | @sheetwrite/core"
description: "Declares whether a source can load only the requested column runs."
---
<!-- api-export:@sheetwrite/core|.|DataSourceCapabilities -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Declares whether a source can load only the requested column runs.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/data.ts#L60"><code>packages/core/src/types/data.ts#L60</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="data-source-capabilities-protocol" data-pagefind-weight="1">
<summary><code>protocol</code></summary>

```ts generated
protocol: 2;
```

</details>

<details class="api-member" id="data-source-capabilities-columns" data-pagefind-weight="1">
<summary><code>columns</code></summary>

```ts generated
columns: "windowed" | "full-width";
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DataSourceCapabilities {
  protocol: 2;
  columns: "windowed" | "full-width";
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

<p class="api-consumers-label">Public exports naming <code>DataSourceCapabilities</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/data-source/"><code>DataSource</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
