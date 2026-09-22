---
title: "SimpleSheetwriteOptions | @sheetwrite/core/adapter"
description: "Framework-neutral simple columns, rows, sizing, and grid options."
---
<!-- api-export:@sheetwrite/core|./adapter|SimpleSheetwriteOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Framework-neutral simple columns, rows, sizing, and grid options.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L244</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="simple-sheetwrite-options-columns" data-pagefind-weight="1" open>
<summary><code>columns</code></summary>

<button class="api-copy" type="button" data-copy-code="columns: readonly SimpleColumn&lt;Row&gt;[];" data-pagefind-ignore>Copy</button>

```ts generated
columns: readonly SimpleColumn<Row>[];
```

</details>

<details class="api-member" id="simple-sheetwrite-options-default-rows" data-pagefind-weight="1" open>
<summary><code>defaultRows</code></summary>

<button class="api-copy" type="button" data-copy-code="defaultRows: readonly Row[];" data-pagefind-ignore>Copy</button>

```ts generated
defaultRows: readonly Row[];
```

</details>

<details class="api-member" id="simple-sheetwrite-options-sheet-name" data-pagefind-weight="1" open>
<summary><code>sheetName</code></summary>

<button class="api-copy" type="button" data-copy-code="sheetName?: string;" data-pagefind-ignore>Copy</button>

```ts generated
sheetName?: string;
```

</details>

<details class="api-member" id="simple-sheetwrite-options-get-row-id" data-pagefind-weight="1" open>
<summary><code>getRowId</code> <span class="api-member-summary">Opt-in stable data-row identity extractor.</span></summary>

<button class="api-copy" type="button" data-copy-code="getRowId?: (row: Row, index: number) =&gt; Id;" data-pagefind-ignore>Copy</button>

```ts generated
getRowId?: (row: Row, index: number) => Id;
```

</details>

<details class="api-member" id="simple-sheetwrite-options-create-row-id" data-pagefind-weight="1" open>
<summary><code>createRowId</code> <span class="api-member-summary">Optional identity factory for rows inserted by the Grid.</span></summary>

<button class="api-copy" type="button" data-copy-code="createRowId?: RowBridgeOptions&lt;Row, Id&gt;[&quot;createRowId&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
createRowId?: RowBridgeOptions<Row, Id>["createRowId"];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SimpleSheetwriteOptions&lt;&#10;  Row extends Record&lt;string, CellScalar&gt;,&#10;  Id extends RowBridgeId = RowBridgeId,&#10;&gt; {&#10;  columns: readonly SimpleColumn&lt;Row&gt;[];&#10;  defaultRows: readonly Row[];&#10;  sheetName?: string;&#10;  getRowId?: (row: Row, index: number) =&gt; Id;&#10;  createRowId?: RowBridgeOptions&lt;Row, Id&gt;[&quot;createRowId&quot;];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SimpleSheetwriteOptions<
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
> {
  columns: readonly SimpleColumn<Row>[];
  defaultRows: readonly Row[];
  sheetName?: string;
  getRowId?: (row: Row, index: number) => Id;
  createRowId?: RowBridgeOptions<Row, Id>["createRowId"];
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

<p class="api-consumers-label">Public exports naming <code>SimpleSheetwriteOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-adapter/create-simple-grid-input/"><code>createSimpleGridInput</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/create-simple-row-bridge/"><code>createSimpleRowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>

<script>
(() => {
  if (window.__sheetwriteApiCopy !== undefined) return;
  window.__sheetwriteApiCopy = true;
  const selectCopy = (text) => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  };
  const copy = (button) => {
    const text = button.dataset.copyCode ?? "";
    const confirm = () => {
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = "Copy"; }, 1400);
    };
    if (navigator.clipboard === undefined) {
      if (selectCopy(text)) confirm();
      return;
    }
    navigator.clipboard.writeText(text).then(confirm, () => {
      if (selectCopy(text)) confirm();
    });
  };
  document.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest(".api-copy") : null;
    if (button !== null) copy(button);
  });
})();
</script>
