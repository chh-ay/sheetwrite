---
title: "SnapshotCell | @sheetwrite/core"
description: "Serializable cell value and optional style inside a snapshot block."
---
<!-- api-export:@sheetwrite/core|.|SnapshotCell -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Serializable cell value and optional style inside a snapshot block.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/document.ts#L305"><code>packages/core/src/types/document.ts#L305</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="snapshot-cell-row-offset" data-pagefind-weight="1">
<summary><code>rowOffset</code></summary>

```ts generated
rowOffset: number;
```

</details>

<details class="api-member" id="snapshot-cell-col-offset" data-pagefind-weight="1">
<summary><code>colOffset</code></summary>

```ts generated
colOffset: number;
```

</details>

<details class="api-member" id="snapshot-cell-value" data-pagefind-weight="1">
<summary><code>value</code></summary>

```ts generated
value: CellValue;
```

</details>

<details class="api-member" id="snapshot-cell-style" data-pagefind-weight="1">
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
export interface SnapshotCell {
  rowOffset: number;
  colOffset: number;
  value: CellValue;
  style?: CellStyle;
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

<p class="api-consumers-label">Public exports naming <code>SnapshotCell</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/cell-block/"><code>CellBlock</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
