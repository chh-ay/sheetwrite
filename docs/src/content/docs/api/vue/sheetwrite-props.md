---
title: "SheetwriteProps | @sheetwrite/vue"
description: "Simple Vue adapter props for columns and default row objects."
---
<!-- api-export:@sheetwrite/vue|.|SheetwriteProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="interface">interface</span></div>

Simple Vue adapter props for columns and default row objects.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/vue/src/index.ts#L104</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-props-columns" data-pagefind-weight="1" open>
<summary><code>columns</code> <span class="api-member-summary">Ordered schema used to derive the component-owned sheet.</span></summary>

<button class="api-copy" type="button" data-copy-code="columns: readonly SimpleColumn&lt;Row&gt;[];" data-pagefind-ignore>Copy</button>

```ts generated
columns: readonly SimpleColumn<Row>[];
```

</details>

<details class="api-member" id="sheetwrite-props-default-rows" data-pagefind-weight="1" open>
<summary><code>defaultRows</code> <span class="api-member-summary">Rows converted to initial columnar data; missing keys become null.</span></summary>

<button class="api-copy" type="button" data-copy-code="defaultRows: readonly Row[];" data-pagefind-ignore>Copy</button>

```ts generated
defaultRows: readonly Row[];
```

</details>

<details class="api-member" id="sheetwrite-props-sheet-name" data-pagefind-weight="1" open>
<summary><code>sheetName</code> <span class="api-member-summary">Generated sheet name; defaults to Sheet 1.</span></summary>

<button class="api-copy" type="button" data-copy-code="sheetName?: string;" data-pagefind-ignore>Copy</button>

```ts generated
sheetName?: string;
```

</details>

<details class="api-member" id="sheetwrite-props-get-row-id" data-pagefind-weight="1" open>
<summary><code>getRowId</code> <span class="api-member-summary">Opt-in stable identity for each host row.</span></summary>

<button class="api-copy" type="button" data-copy-code="getRowId?: (row: Row, index: number) =&gt; Id;" data-pagefind-ignore>Copy</button>

```ts generated
getRowId?: (row: Row, index: number) => Id;
```

</details>

<details class="api-member" id="sheetwrite-props-create-row-id" data-pagefind-weight="1" open>
<summary><code>createRowId</code> <span class="api-member-summary">Creates stable identities for Grid-inserted rows.</span></summary>

<button class="api-copy" type="button" data-copy-code="createRowId?: Parameters&lt;typeof createSimpleRowBridge&lt;Row, Id&gt;&gt;[0][&quot;createRowId&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
createRowId?: Parameters<typeof createSimpleRowBridge<Row, Id>>[0]["createRowId"];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SheetwriteProps&lt;&#10;  Row extends Record&lt;string, CellScalar&gt; = Record&lt;string, CellScalar&gt;,&#10;  Id extends RowBridgeId = RowBridgeId,&#10;&gt; extends Omit&lt;&#10;  SheetwriteGridProps&lt;Id&gt;,&#10;  &quot;workbook&quot; | &quot;data&quot; | &quot;datasource&quot; | &quot;rowBridge&quot;&#10;&gt; {&#10;  columns: readonly SimpleColumn&lt;Row&gt;[];&#10;  defaultRows: readonly Row[];&#10;  sheetName?: string;&#10;  getRowId?: (row: Row, index: number) =&gt; Id;&#10;  createRowId?: Parameters&lt;&#10;    typeof createSimpleRowBridge&lt;Row, Id&gt;&#10;  &gt;[0][&quot;createRowId&quot;];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SheetwriteProps<
  Row extends Record<string, CellScalar> = Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
> extends Omit<
  SheetwriteGridProps<Id>,
  "workbook" | "data" | "datasource" | "rowBridge"
> {
  columns: readonly SimpleColumn<Row>[];
  defaultRows: readonly Row[];
  sheetName?: string;
  getRowId?: (row: Row, index: number) => Id;
  createRowId?: Parameters<
    typeof createSimpleRowBridge<Row, Id>
  >[0]["createRowId"];
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/vue</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>SheetwriteProps</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/react/sheetwrite/"><code>Sheetwrite</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/sheetwrite/"><code>Sheetwrite</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/sheetwrite/"><code>Sheetwrite</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
