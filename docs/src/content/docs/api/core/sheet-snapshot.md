---
title: "SheetSnapshot | @sheetwrite/core"
description: "Serializable complete state for one workbook sheet."
---
<!-- api-export:@sheetwrite/core|.|SheetSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Serializable complete state for one workbook sheet.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L336</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#sheet-snapshot-id"><code>id</code></a>
<a href="#sheet-snapshot-name"><code>name</code></a>
<a href="#sheet-snapshot-order"><code>order</code></a>
<a href="#sheet-snapshot-visibility"><code>visibility</code></a>
<a href="#sheet-snapshot-row-count"><code>rowCount</code></a>
<a href="#sheet-snapshot-columns"><code>columns</code></a>
<a href="#sheet-snapshot-frozen-rows"><code>frozenRows</code></a>
<a href="#sheet-snapshot-frozen-cols"><code>frozenCols</code></a>
<a href="#sheet-snapshot-row-meta"><code>rowMeta</code></a>
<a href="#sheet-snapshot-merges"><code>merges</code></a>
<a href="#sheet-snapshot-conditional-formats"><code>conditionalFormats</code></a>
<a href="#sheet-snapshot-hyperlinks"><code>hyperlinks</code></a>
<a href="#sheet-snapshot-validation-rules"><code>validationRules</code></a>
<a href="#sheet-snapshot-protected-ranges"><code>protectedRanges</code></a>
<a href="#sheet-snapshot-notes"><code>notes</code></a>
<a href="#sheet-snapshot-sort-keys"><code>sortKeys</code></a>
<a href="#sheet-snapshot-filters"><code>filters</code></a>
<a href="#sheet-snapshot-row-groups"><code>rowGroups</code></a>
<a href="#sheet-snapshot-tables"><code>tables</code></a>
<a href="#sheet-snapshot-cells"><code>cells</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>20</span>

<div class="api-member-list">

<details class="api-member" id="sheet-snapshot-id" data-pagefind-weight="1" open>
<summary><code>id</code></summary>

<button class="api-copy" type="button" data-copy-code="id: SheetId;" data-pagefind-ignore>Copy</button>

```ts generated
id: SheetId;
```

</details>

<details class="api-member" id="sheet-snapshot-name" data-pagefind-weight="1" open>
<summary><code>name</code></summary>

<button class="api-copy" type="button" data-copy-code="name: string;" data-pagefind-ignore>Copy</button>

```ts generated
name: string;
```

</details>

<details class="api-member" id="sheet-snapshot-order" data-pagefind-weight="1" open>
<summary><code>order</code></summary>

<button class="api-copy" type="button" data-copy-code="order: number;" data-pagefind-ignore>Copy</button>

```ts generated
order: number;
```

</details>

<details class="api-member" id="sheet-snapshot-visibility" data-pagefind-weight="1" open>
<summary><code>visibility</code> <span class="api-member-summary">Hidden worksheets remain in the workbook and retain formulas/references.</span></summary>

<button class="api-copy" type="button" data-copy-code="visibility?: SheetVisibility;" data-pagefind-ignore>Copy</button>

```ts generated
visibility?: SheetVisibility;
```

</details>

<details class="api-member" id="sheet-snapshot-row-count" data-pagefind-weight="1" open>
<summary><code>rowCount</code></summary>

<button class="api-copy" type="button" data-copy-code="rowCount: number;" data-pagefind-ignore>Copy</button>

```ts generated
rowCount: number;
```

</details>

<details class="api-member" id="sheet-snapshot-columns" data-pagefind-weight="1" open>
<summary><code>columns</code> <span class="api-member-summary">Keys are stable, unique document column identities as well as datasource keys.</span></summary>

<button class="api-copy" type="button" data-copy-code="columns: Column[];" data-pagefind-ignore>Copy</button>

```ts generated
columns: Column[];
```

</details>

<details class="api-member" id="sheet-snapshot-frozen-rows" data-pagefind-weight="1" open>
<summary><code>frozenRows</code></summary>

<button class="api-copy" type="button" data-copy-code="frozenRows?: number;" data-pagefind-ignore>Copy</button>

```ts generated
frozenRows?: number;
```

</details>

<details class="api-member" id="sheet-snapshot-frozen-cols" data-pagefind-weight="1" open>
<summary><code>frozenCols</code></summary>

<button class="api-copy" type="button" data-copy-code="frozenCols?: number;" data-pagefind-ignore>Copy</button>

```ts generated
frozenCols?: number;
```

</details>

<details class="api-member" id="sheet-snapshot-row-meta" data-pagefind-weight="1" open>
<summary><code>rowMeta</code></summary>

<button class="api-copy" type="button" data-copy-code="rowMeta?: Array&lt;[row: number, meta: RowMetadata]&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
rowMeta?: Array<[row: number, meta: RowMetadata]>;
```

</details>

<details class="api-member" id="sheet-snapshot-merges" data-pagefind-weight="1" open>
<summary><code>merges</code></summary>

<button class="api-copy" type="button" data-copy-code="merges?: MergeRange[];" data-pagefind-ignore>Copy</button>

```ts generated
merges?: MergeRange[];
```

</details>

<details class="api-member" id="sheet-snapshot-conditional-formats" data-pagefind-weight="1" open>
<summary><code>conditionalFormats</code></summary>

<button class="api-copy" type="button" data-copy-code="conditionalFormats?: ConditionalFormatRule[];" data-pagefind-ignore>Copy</button>

```ts generated
conditionalFormats?: ConditionalFormatRule[];
```

</details>

<details class="api-member" id="sheet-snapshot-hyperlinks" data-pagefind-weight="1" open>
<summary><code>hyperlinks</code></summary>

<button class="api-copy" type="button" data-copy-code="hyperlinks?: CellHyperlink[];" data-pagefind-ignore>Copy</button>

```ts generated
hyperlinks?: CellHyperlink[];
```

</details>

<details class="api-member" id="sheet-snapshot-validation-rules" data-pagefind-weight="1" open>
<summary><code>validationRules</code></summary>

<button class="api-copy" type="button" data-copy-code="validationRules?: DataValidationRule[];" data-pagefind-ignore>Copy</button>

```ts generated
validationRules?: DataValidationRule[];
```

</details>

<details class="api-member" id="sheet-snapshot-protected-ranges" data-pagefind-weight="1" open>
<summary><code>protectedRanges</code></summary>

<button class="api-copy" type="button" data-copy-code="protectedRanges?: ProtectedRange[];" data-pagefind-ignore>Copy</button>

```ts generated
protectedRanges?: ProtectedRange[];
```

</details>

<details class="api-member" id="sheet-snapshot-notes" data-pagefind-weight="1" open>
<summary><code>notes</code></summary>

<button class="api-copy" type="button" data-copy-code="notes?: CellNote[];" data-pagefind-ignore>Copy</button>

```ts generated
notes?: CellNote[];
```

</details>

<details class="api-member" id="sheet-snapshot-sort-keys" data-pagefind-weight="1" open>
<summary><code>sortKeys</code></summary>

<button class="api-copy" type="button" data-copy-code="sortKeys?: SortKey[];" data-pagefind-ignore>Copy</button>

```ts generated
sortKeys?: SortKey[];
```

</details>

<details class="api-member" id="sheet-snapshot-filters" data-pagefind-weight="1" open>
<summary><code>filters</code></summary>

<button class="api-copy" type="button" data-copy-code="filters?: Array&lt;[col: number, filter: ColumnFilter]&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
filters?: Array<[col: number, filter: ColumnFilter]>;
```

</details>

<details class="api-member" id="sheet-snapshot-row-groups" data-pagefind-weight="1" open>
<summary><code>rowGroups</code></summary>

<button class="api-copy" type="button" data-copy-code="rowGroups?: RowGroup[];" data-pagefind-ignore>Copy</button>

```ts generated
rowGroups?: RowGroup[];
```

</details>

<details class="api-member" id="sheet-snapshot-tables" data-pagefind-weight="1" open>
<summary><code>tables</code></summary>

<button class="api-copy" type="button" data-copy-code="tables?: WorkbookTable[];" data-pagefind-ignore>Copy</button>

```ts generated
tables?: WorkbookTable[];
```

</details>

<details class="api-member" id="sheet-snapshot-cells" data-pagefind-weight="1" open>
<summary><code>cells</code></summary>

<button class="api-copy" type="button" data-copy-code="cells: CellBlock[];" data-pagefind-ignore>Copy</button>

```ts generated
cells: CellBlock[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SheetSnapshot {&#10;  id: SheetId;&#10;  name: string;&#10;  order: number;&#10;  visibility?: SheetVisibility;&#10;  rowCount: number;&#10;  columns: Column[];&#10;  frozenRows?: number;&#10;  frozenCols?: number;&#10;  rowMeta?: Array&lt;[row: number, meta: RowMetadata]&gt;;&#10;  merges?: MergeRange[];&#10;  conditionalFormats?: ConditionalFormatRule[];&#10;  hyperlinks?: CellHyperlink[];&#10;  validationRules?: DataValidationRule[];&#10;  protectedRanges?: ProtectedRange[];&#10;  notes?: CellNote[];&#10;  sortKeys?: SortKey[];&#10;  filters?: Array&lt;[col: number, filter: ColumnFilter]&gt;;&#10;  rowGroups?: RowGroup[];&#10;  tables?: WorkbookTable[];&#10;  cells: CellBlock[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SheetSnapshot {
  id: SheetId;
  name: string;
  order: number;
  visibility?: SheetVisibility;
  rowCount: number;
  columns: Column[];
  frozenRows?: number;
  frozenCols?: number;
  rowMeta?: Array<[row: number, meta: RowMetadata]>;
  merges?: MergeRange[];
  conditionalFormats?: ConditionalFormatRule[];
  hyperlinks?: CellHyperlink[];
  validationRules?: DataValidationRule[];
  protectedRanges?: ProtectedRange[];
  notes?: CellNote[];
  sortKeys?: SortKey[];
  filters?: Array<[col: number, filter: ColumnFilter]>;
  rowGroups?: RowGroup[];
  tables?: WorkbookTable[];
  cells: CellBlock[];
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

<p class="api-consumers-label">Public exports naming <code>SheetSnapshot</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/workbook-snapshot/"><code>WorkbookSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
