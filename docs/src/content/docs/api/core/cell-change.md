---
title: "CellChange | @sheetwrite/core"
description: "One committed cell edit, carrying enough to roll back."
---
<!-- api-export:@sheetwrite/core|.|CellChange -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One committed cell edit, carrying enough to roll back.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/transaction.ts#L185"><code>packages/core/src/types/transaction.ts#L185</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="cell-change-addr" data-pagefind-weight="1">
<summary><code>addr</code></summary>

```ts generated
addr: CellAddress;
```

</details>

<details class="api-member" id="cell-change-old-value" data-pagefind-weight="1">
<summary><code>oldValue</code></summary>

```ts generated
oldValue: CellValue;
```

</details>

<details class="api-member" id="cell-change-new-value" data-pagefind-weight="1">
<summary><code>newValue</code></summary>

```ts generated
newValue: CellValue;
```

</details>

<details class="api-member" id="cell-change-old-style" data-pagefind-weight="1">
<summary><code>oldStyle</code></summary>

```ts generated
oldStyle?: CellStyle;
```

</details>

<details class="api-member" id="cell-change-new-style" data-pagefind-weight="1">
<summary><code>newStyle</code></summary>

```ts generated
newStyle?: CellStyle;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CellChange {
  addr: CellAddress;
  oldValue: CellValue;
  newValue: CellValue;
  oldStyle?: CellStyle;
  newStyle?: CellStyle;
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

<p class="api-consumers-label">Public exports naming <code>CellChange</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/change-event/"><code>ChangeEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
