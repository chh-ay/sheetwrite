---
title: "CalculationSettings | @sheetwrite/core"
description: "Workbook calculation options, mirroring Excel's \"Enable iterative calculation\"."
---
<!-- api-export:@sheetwrite/core|.|CalculationSettings -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Workbook calculation options, mirroring Excel's "Enable iterative calculation".
A workbook without this record uses the defaults.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/document.ts#L110"><code>packages/core/src/types/document.ts#L110</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="calculation-settings-iterate" data-pagefind-weight="1">
<summary><code>iterate</code> <span class="api-member-summary">Recalculate circular references iteratively instead of showing #CYCLE!; Excel default false.</span></summary>

```ts generated
iterate: boolean;
```

</details>

<details class="api-member" id="calculation-settings-max-iterations" data-pagefind-weight="1">
<summary><code>maxIterations</code> <span class="api-member-summary">Most passes over each circular reference; an integer from 1 to 32,767, Excel default 100.</span></summary>

```ts generated
maxIterations: number;
```

</details>

<details class="api-member" id="calculation-settings-max-change" data-pagefind-weight="1">
<summary><code>maxChange</code> <span class="api-member-summary">Iteration stops once no value changes by more than this; finite and &gt;= 0, Excel default 0.001.</span></summary>

```ts generated
maxChange: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CalculationSettings {
  iterate: boolean;
  maxIterations: number;
  maxChange: number;
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

<p class="api-consumers-label">Public exports naming <code>CalculationSettings</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/workbook/"><code>Workbook</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/workbook-snapshot/"><code>WorkbookSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
