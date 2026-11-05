---
title: "HistoryDiffCell | @sheetwrite/core/history"
description: "HistoryDiffCell interface in @sheetwrite/core/history: Source and style of one cell in one version."
---
<!-- api-export:@sheetwrite/core|./history|HistoryDiffCell -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Source and style of one cell in one version.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/diff.ts#L82"><code>packages/core/src/version-history/diff.ts#L82</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="history-diff-cell-value" data-pagefind-weight="1">
<summary><code>value</code> <span class="api-member-summary">Calculated value in that version, for preview.</span></summary>

```ts generated
value: CellScalar;
```

</details>

<details class="api-member" id="history-diff-cell-formula" data-pagefind-weight="1">
<summary><code>formula</code></summary>

```ts generated
formula?: string;
```

</details>

<details class="api-member" id="history-diff-cell-style" data-pagefind-weight="1">
<summary><code>style</code></summary>

```ts generated
style?: CellStyle;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryDiffCell {
  value: CellScalar;
  formula?: string;
  style?: CellStyle;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/queries</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>HistoryDiffCell</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-diff-detail/"><code>HistoryDiffDetail</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
