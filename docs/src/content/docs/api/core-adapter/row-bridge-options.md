---
title: "RowBridgeOptions | @sheetwrite/core/adapter"
description: "Options for the framework-neutral, opt-in row bridge."
---
<!-- api-export:@sheetwrite/core|./adapter|RowBridgeOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Options for the framework-neutral, opt-in row bridge.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L23</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-options-columns" data-pagefind-weight="1" open>
<summary><code>columns</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly columns: readonly RowBridgeColumn&lt;Row&gt;[];" data-pagefind-ignore>Copy</button>

```ts generated
readonly columns: readonly RowBridgeColumn<Row>[];
```

</details>

<details class="api-member" id="row-bridge-options-default-rows" data-pagefind-weight="1" open>
<summary><code>defaultRows</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly defaultRows: readonly Row[];" data-pagefind-ignore>Copy</button>

```ts generated
readonly defaultRows: readonly Row[];
```

</details>

<details class="api-member" id="row-bridge-options-get-row-id" data-pagefind-weight="1" open>
<summary><code>getRowId</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly getRowId: (row: Row, index: number) =&gt; Id;" data-pagefind-ignore>Copy</button>

```ts generated
readonly getRowId: (row: Row, index: number) => Id;
```

</details>

<details class="api-member" id="row-bridge-options-sheet" data-pagefind-weight="1" open>
<summary><code>sheet</code> <span class="api-member-summary">Sheet identity used by the simple data-first adapter.</span></summary>

<button class="api-copy" type="button" data-copy-code="readonly sheet?: SheetId;" data-pagefind-ignore>Copy</button>

```ts generated
readonly sheet?: SheetId;
```

<p class="api-member-doc">Sheet identity used by the simple data-first adapter. Defaults to `sheet1`.</p>
</details>

<details class="api-member" id="row-bridge-options-create-row-id" data-pagefind-weight="1" open>
<summary><code>createRowId</code> <span class="api-member-summary">Optional identity factory for rows created by an addRows operation.</span></summary>

<button class="api-copy" type="button" data-copy-code="readonly createRowId?: (context: RowBridgeInsertContext) =&gt; Id;" data-pagefind-ignore>Copy</button>

```ts generated
readonly createRowId?: (context: RowBridgeInsertContext) => Id;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface RowBridgeOptions&lt;&#10;  Row extends Record&lt;string, CellScalar&gt;,&#10;  Id extends RowBridgeId = RowBridgeId,&#10;&gt; {&#10;  readonly columns: readonly RowBridgeColumn&lt;Row&gt;[];&#10;  readonly defaultRows: readonly Row[];&#10;  readonly getRowId: (row: Row, index: number) =&gt; Id;&#10;  readonly sheet?: SheetId;&#10;  readonly createRowId?: (context: RowBridgeInsertContext) =&gt; Id;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface RowBridgeOptions<
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
> {
  readonly columns: readonly RowBridgeColumn<Row>[];
  readonly defaultRows: readonly Row[];
  readonly getRowId: (row: Row, index: number) => Id;
  readonly sheet?: SheetId;
  readonly createRowId?: (context: RowBridgeInsertContext) => Id;
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

<p class="api-consumers-label">Public exports naming <code>RowBridgeOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/create-row-bridge/"><code>createRowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/create-row-bridge/"><code>createRowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/simple-sheetwrite-options/"><code>SimpleSheetwriteOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
