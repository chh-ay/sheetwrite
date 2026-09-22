---
title: "WorkbookTable | @sheetwrite/core"
description: "Serializable canonical workbook table."
---
<!-- api-export:@sheetwrite/core|.|WorkbookTable -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Serializable canonical workbook table. Its range includes header/totals rows.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/table.ts#L38</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#workbook-table-id"><code>id</code></a>
<a href="#workbook-table-name"><code>name</code></a>
<a href="#workbook-table-range"><code>range</code></a>
<a href="#workbook-table-columns"><code>columns</code></a>
<a href="#workbook-table-header-row"><code>headerRow</code></a>
<a href="#workbook-table-totals-row"><code>totalsRow</code></a>
<a href="#workbook-table-style"><code>style</code></a>
<a href="#workbook-table-unsupported-features"><code>unsupportedFeatures</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>8</span>

<div class="api-member-list">

<details class="api-member" id="workbook-table-id" data-pagefind-weight="1" open>
<summary><code>id</code></summary>

<button class="api-copy" type="button" data-copy-code="id: WorkbookTableId;" data-pagefind-ignore>Copy</button>

```ts generated
id: WorkbookTableId;
```

</details>

<details class="api-member" id="workbook-table-name" data-pagefind-weight="1" open>
<summary><code>name</code> <span class="api-member-summary">Workbook-global, case-insensitively unique structured-reference name.</span></summary>

<button class="api-copy" type="button" data-copy-code="name: string;" data-pagefind-ignore>Copy</button>

```ts generated
name: string;
```

</details>

<details class="api-member" id="workbook-table-range" data-pagefind-weight="1" open>
<summary><code>range</code> <span class="api-member-summary">Inclusive table rectangle on one stable sheet ID.</span></summary>

<button class="api-copy" type="button" data-copy-code="range: Range;" data-pagefind-ignore>Copy</button>

```ts generated
range: Range;
```

</details>

<details class="api-member" id="workbook-table-columns" data-pagefind-weight="1" open>
<summary><code>columns</code> <span class="api-member-summary">Ordered stable columns; length is exactly the table rectangle width.</span></summary>

<button class="api-copy" type="button" data-copy-code="columns: WorkbookTableColumn[];" data-pagefind-ignore>Copy</button>

```ts generated
columns: WorkbookTableColumn[];
```

</details>

<details class="api-member" id="workbook-table-header-row" data-pagefind-weight="1" open>
<summary><code>headerRow</code> <span class="api-member-summary">Whether the first range row is the structured-reference header row.</span></summary>

<button class="api-copy" type="button" data-copy-code="headerRow: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
headerRow: boolean;
```

</details>

<details class="api-member" id="workbook-table-totals-row" data-pagefind-weight="1" open>
<summary><code>totalsRow</code> <span class="api-member-summary">Whether the last range row is the structured-reference totals row.</span></summary>

<button class="api-copy" type="button" data-copy-code="totalsRow: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
totalsRow: boolean;
```

</details>

<details class="api-member" id="workbook-table-style" data-pagefind-weight="1" open>
<summary><code>style</code></summary>

<button class="api-copy" type="button" data-copy-code="style?: WorkbookTableStyle;" data-pagefind-ignore>Copy</button>

```ts generated
style?: WorkbookTableStyle;
```

</details>

<details class="api-member" id="workbook-table-unsupported-features" data-pagefind-weight="1" open>
<summary><code>unsupportedFeatures</code></summary>

<button class="api-copy" type="button" data-copy-code="unsupportedFeatures?: WorkbookTableUnsupportedFeature[];" data-pagefind-ignore>Copy</button>

```ts generated
unsupportedFeatures?: WorkbookTableUnsupportedFeature[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface WorkbookTable {&#10;  id: WorkbookTableId;&#10;  name: string;&#10;  range: Range;&#10;  columns: WorkbookTableColumn[];&#10;  headerRow: boolean;&#10;  totalsRow: boolean;&#10;  style?: WorkbookTableStyle;&#10;  unsupportedFeatures?: WorkbookTableUnsupportedFeature[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface WorkbookTable {
  id: WorkbookTableId;
  name: string;
  range: Range;
  columns: WorkbookTableColumn[];
  headerRow: boolean;
  totalsRow: boolean;
  style?: WorkbookTableStyle;
  unsupportedFeatures?: WorkbookTableUnsupportedFeature[];
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

<p class="api-consumers-label">Public exports naming <code>WorkbookTable</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet/"><code>Sheet</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet-snapshot/"><code>SheetSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/valid-workbook-table/"><code>validWorkbookTable</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
