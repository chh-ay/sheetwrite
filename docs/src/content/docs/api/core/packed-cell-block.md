---
title: "PackedCellBlock | @sheetwrite/core"
description: "Dense row-major mutation payload."
---
<!-- api-export:@sheetwrite/core|.|PackedCellBlock -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Dense row-major mutation payload. Primitive arrays keep large paste/fill
operations JSON-safe without allocating one operation object per cell.
Formula/reference tuples are sparse exceptions keyed by row-major offset.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L316</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#packed-cell-block-row-count"><code>rowCount</code></a>
<a href="#packed-cell-block-col-count"><code>colCount</code></a>
<a href="#packed-cell-block-values"><code>values</code></a>
<a href="#packed-cell-block-formulas"><code>formulas</code></a>
<a href="#packed-cell-block-refs"><code>refs</code></a>
<a href="#packed-cell-block-style-table"><code>styleTable</code></a>
<a href="#packed-cell-block-style-ids"><code>styleIds</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="packed-cell-block-row-count" data-pagefind-weight="1" open>
<summary><code>rowCount</code></summary>

<button class="api-copy" type="button" data-copy-code="rowCount: number;" data-pagefind-ignore>Copy</button>

```ts generated
rowCount: number;
```

</details>

<details class="api-member" id="packed-cell-block-col-count" data-pagefind-weight="1" open>
<summary><code>colCount</code></summary>

<button class="api-copy" type="button" data-copy-code="colCount: number;" data-pagefind-ignore>Copy</button>

```ts generated
colCount: number;
```

</details>

<details class="api-member" id="packed-cell-block-values" data-pagefind-weight="1" open>
<summary><code>values</code></summary>

<button class="api-copy" type="button" data-copy-code="values: CellScalar[];" data-pagefind-ignore>Copy</button>

```ts generated
values: CellScalar[];
```

</details>

<details class="api-member" id="packed-cell-block-formulas" data-pagefind-weight="1" open>
<summary><code>formulas</code></summary>

<button class="api-copy" type="button" data-copy-code="formulas?: Array&lt;[offset: number, source: string]&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
formulas?: Array<[offset: number, source: string]>;
```

</details>

<details class="api-member" id="packed-cell-block-refs" data-pagefind-weight="1" open>
<summary><code>refs</code></summary>

<button class="api-copy" type="button" data-copy-code="refs?: Array&lt;[offset: number, target: CellAddress]&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
refs?: Array<[offset: number, target: CellAddress]>;
```

</details>

<details class="api-member" id="packed-cell-block-style-table" data-pagefind-weight="1" open>
<summary><code>styleTable</code></summary>

<button class="api-copy" type="button" data-copy-code="styleTable?: CellStyle[];" data-pagefind-ignore>Copy</button>

```ts generated
styleTable?: CellStyle[];
```

</details>

<details class="api-member" id="packed-cell-block-style-ids" data-pagefind-weight="1" open>
<summary><code>styleIds</code></summary>

<button class="api-copy" type="button" data-copy-code="styleIds?: number[];" data-pagefind-ignore>Copy</button>

```ts generated
styleIds?: number[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface PackedCellBlock {&#10;  rowCount: number;&#10;  colCount: number;&#10;  values: CellScalar[];&#10;  formulas?: Array&lt;[offset: number, source: string]&gt;;&#10;  refs?: Array&lt;[offset: number, target: CellAddress]&gt;;&#10;  styleTable?: CellStyle[];&#10;  styleIds?: number[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface PackedCellBlock {
  rowCount: number;
  colCount: number;
  values: CellScalar[];
  formulas?: Array<[offset: number, source: string]>;
  refs?: Array<[offset: number, target: CellAddress]>;
  styleTable?: CellStyle[];
  styleIds?: number[];
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

<p class="api-consumers-label">Public exports naming <code>PackedCellBlock</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
