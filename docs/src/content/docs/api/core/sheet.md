---
title: "Sheet | @sheetwrite/core"
description: "Workbook sheet schema used when creating a live grid."
---
<!-- api-export:@sheetwrite/core|.|Sheet -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Workbook sheet schema used when creating a live grid.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L41</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#sheet-id"><code>id</code></a>
<a href="#sheet-name"><code>name</code></a>
<a href="#sheet-visibility"><code>visibility</code></a>
<a href="#sheet-columns"><code>columns</code></a>
<a href="#sheet-row-count"><code>rowCount</code></a>
<a href="#sheet-row-heights"><code>rowHeights</code></a>
<a href="#sheet-hidden-rows"><code>hiddenRows</code></a>
<a href="#sheet-row-groups"><code>rowGroups</code></a>
<a href="#sheet-conditional-formats"><code>conditionalFormats</code></a>
<a href="#sheet-hyperlinks"><code>hyperlinks</code></a>
<a href="#sheet-validation-rules"><code>validationRules</code></a>
<a href="#sheet-protected-ranges"><code>protectedRanges</code></a>
<a href="#sheet-notes"><code>notes</code></a>
<a href="#sheet-sort-keys"><code>sortKeys</code></a>
<a href="#sheet-filters"><code>filters</code></a>
<a href="#sheet-merges"><code>merges</code></a>
<a href="#sheet-frozen-rows"><code>frozenRows</code></a>
<a href="#sheet-frozen-cols"><code>frozenCols</code></a>
<a href="#sheet-tables"><code>tables</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>19</span>

<div class="api-member-list">

<details class="api-member" id="sheet-id" data-pagefind-weight="1" open>
<summary><code>id</code> <span class="api-member-summary">Stable identifier, unique within the workbook and used by every cell address.</span></summary>

<button class="api-copy" type="button" data-copy-code="id: SheetId;" data-pagefind-ignore>Copy</button>

```ts generated
id: SheetId;
```

</details>

<details class="api-member" id="sheet-name" data-pagefind-weight="1" open>
<summary><code>name</code> <span class="api-member-summary">User-facing sheet name shown in tabs and workbook exports.</span></summary>

<button class="api-copy" type="button" data-copy-code="name: string;" data-pagefind-ignore>Copy</button>

```ts generated
name: string;
```

</details>

<details class="api-member" id="sheet-visibility" data-pagefind-weight="1" open>
<summary><code>visibility</code> <span class="api-member-summary">Hidden worksheets remain addressable but are omitted from the tab strip.</span></summary>

<button class="api-copy" type="button" data-copy-code="visibility?: SheetVisibility;" data-pagefind-ignore>Copy</button>

```ts generated
visibility?: SheetVisibility;
```

</details>

<details class="api-member" id="sheet-columns" data-pagefind-weight="1" open>
<summary><code>columns</code> <span class="api-member-summary">Ordered schema; array positions are the zero-based column coordinates.</span></summary>

<button class="api-copy" type="button" data-copy-code="columns: Column[];" data-pagefind-ignore>Copy</button>

```ts generated
columns: Column[];
```

</details>

<details class="api-member" id="sheet-row-count" data-pagefind-weight="1" open>
<summary><code>rowCount</code> <span class="api-member-summary">Row count for both in-memory and datasource-backed sheets.</span></summary>

<button class="api-copy" type="button" data-copy-code="rowCount: number;" data-pagefind-ignore>Copy</button>

```ts generated
rowCount: number;
```

</details>

<details class="api-member" id="sheet-row-heights" data-pagefind-weight="1" open>
<summary><code>rowHeights</code> <span class="api-member-summary">Sparse per-row height overrides; default comes from the theme.</span></summary>

<button class="api-copy" type="button" data-copy-code="rowHeights?: Map&lt;number, number&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
rowHeights?: Map<number, number>;
```

</details>

<details class="api-member" id="sheet-hidden-rows" data-pagefind-weight="1" open>
<summary><code>hiddenRows</code> <span class="api-member-summary">Persisted hidden data rows; runtime form is sparse and non-JSON.</span></summary>

<button class="api-copy" type="button" data-copy-code="hiddenRows?: Set&lt;number&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
hiddenRows?: Set<number>;
```

</details>

<details class="api-member" id="sheet-row-groups" data-pagefind-weight="1" open>
<summary><code>rowGroups</code> <span class="api-member-summary">Persisted collapsible row groups.</span></summary>

<button class="api-copy" type="button" data-copy-code="rowGroups?: RowGroup[];" data-pagefind-ignore>Copy</button>

```ts generated
rowGroups?: RowGroup[];
```

</details>

<details class="api-member" id="sheet-conditional-formats" data-pagefind-weight="1" open>
<summary><code>conditionalFormats</code> <span class="api-member-summary">Conditional styles folded into the bulk render-window style dictionary.</span></summary>

<button class="api-copy" type="button" data-copy-code="conditionalFormats?: ConditionalFormatRule[];" data-pagefind-ignore>Copy</button>

```ts generated
conditionalFormats?: ConditionalFormatRule[];
```

</details>

<details class="api-member" id="sheet-hyperlinks" data-pagefind-weight="1" open>
<summary><code>hyperlinks</code> <span class="api-member-summary">Stable, serializable range hyperlinks; external URLs pass the shared safety policy.</span></summary>

<button class="api-copy" type="button" data-copy-code="hyperlinks?: CellHyperlink[];" data-pagefind-ignore>Copy</button>

```ts generated
hyperlinks?: CellHyperlink[];
```

</details>

<details class="api-member" id="sheet-validation-rules" data-pagefind-weight="1" open>
<summary><code>validationRules</code> <span class="api-member-summary">Serializable data-entry rules evaluated at the local mutation barrier.</span></summary>

<button class="api-copy" type="button" data-copy-code="validationRules?: DataValidationRule[];" data-pagefind-ignore>Copy</button>

```ts generated
validationRules?: DataValidationRule[];
```

</details>

<details class="api-member" id="sheet-protected-ranges" data-pagefind-weight="1" open>
<summary><code>protectedRanges</code> <span class="api-member-summary">Client-side protected-range policy metadata; never server authorization.</span></summary>

<button class="api-copy" type="button" data-copy-code="protectedRanges?: ProtectedRange[];" data-pagefind-ignore>Copy</button>

```ts generated
protectedRanges?: ProtectedRange[];
```

</details>

<details class="api-member" id="sheet-notes" data-pagefind-weight="1" open>
<summary><code>notes</code> <span class="api-member-summary">Simple cell notes. Discussion threads live outside the document model.</span></summary>

<button class="api-copy" type="button" data-copy-code="notes?: CellNote[];" data-pagefind-ignore>Copy</button>

```ts generated
notes?: CellNote[];
```

</details>

<details class="api-member" id="sheet-sort-keys" data-pagefind-weight="1" open>
<summary><code>sortKeys</code> <span class="api-member-summary">Persisted sort keys for the sheet's view.</span></summary>

<button class="api-copy" type="button" data-copy-code="sortKeys?: SortKey[];" data-pagefind-ignore>Copy</button>

```ts generated
sortKeys?: SortKey[];
```

</details>

<details class="api-member" id="sheet-filters" data-pagefind-weight="1" open>
<summary><code>filters</code> <span class="api-member-summary">Persisted column filters as JSON-safe index/value tuples.</span></summary>

<button class="api-copy" type="button" data-copy-code="filters?: Array&lt;[col: number, filter: ColumnFilter]&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
filters?: Array<[col: number, filter: ColumnFilter]>;
```

</details>

<details class="api-member" id="sheet-merges" data-pagefind-weight="1" open>
<summary><code>merges</code> <span class="api-member-summary">Persisted merged-cell regions; covered cells render/export from the anchor.</span></summary>

<button class="api-copy" type="button" data-copy-code="merges?: MergeRange[];" data-pagefind-ignore>Copy</button>

```ts generated
merges?: MergeRange[];
```

</details>

<details class="api-member" id="sheet-frozen-rows" data-pagefind-weight="1" open>
<summary><code>frozenRows</code> <span class="api-member-summary">Leading view rows pinned above the scrolling body (0/undefined = none).</span></summary>

<button class="api-copy" type="button" data-copy-code="frozenRows?: number;" data-pagefind-ignore>Copy</button>

```ts generated
frozenRows?: number;
```

</details>

<details class="api-member" id="sheet-frozen-cols" data-pagefind-weight="1" open>
<summary><code>frozenCols</code> <span class="api-member-summary">Leading columns pinned left of the scrolling body (0/undefined = none).</span></summary>

<button class="api-copy" type="button" data-copy-code="frozenCols?: number;" data-pagefind-ignore>Copy</button>

```ts generated
frozenCols?: number;
```

</details>

<details class="api-member" id="sheet-tables" data-pagefind-weight="1" open>
<summary><code>tables</code> <span class="api-member-summary">Native workbook tables anchored to this stable worksheet identity.</span></summary>

<button class="api-copy" type="button" data-copy-code="tables?: WorkbookTable[];" data-pagefind-ignore>Copy</button>

```ts generated
tables?: WorkbookTable[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface Sheet {&#10;  id: SheetId;&#10;  name: string;&#10;  visibility?: SheetVisibility;&#10;  columns: Column[];&#10;  rowCount: number;&#10;  rowHeights?: Map&lt;number, number&gt;;&#10;  hiddenRows?: Set&lt;number&gt;;&#10;  rowGroups?: RowGroup[];&#10;  conditionalFormats?: ConditionalFormatRule[];&#10;  hyperlinks?: CellHyperlink[];&#10;  validationRules?: DataValidationRule[];&#10;  protectedRanges?: ProtectedRange[];&#10;  notes?: CellNote[];&#10;  sortKeys?: SortKey[];&#10;  filters?: Array&lt;[col: number, filter: ColumnFilter]&gt;;&#10;  merges?: MergeRange[];&#10;  frozenRows?: number;&#10;  frozenCols?: number;&#10;  tables?: WorkbookTable[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface Sheet {
  id: SheetId;
  name: string;
  visibility?: SheetVisibility;
  columns: Column[];
  rowCount: number;
  rowHeights?: Map<number, number>;
  hiddenRows?: Set<number>;
  rowGroups?: RowGroup[];
  conditionalFormats?: ConditionalFormatRule[];
  hyperlinks?: CellHyperlink[];
  validationRules?: DataValidationRule[];
  protectedRanges?: ProtectedRange[];
  notes?: CellNote[];
  sortKeys?: SortKey[];
  filters?: Array<[col: number, filter: ColumnFilter]>;
  merges?: MergeRange[];
  frozenRows?: number;
  frozenCols?: number;
  tables?: WorkbookTable[];
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

<p class="api-consumers-label">Public exports naming <code>Sheet</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/assert-workbook-tables/"><code>assertWorkbookTables</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/to-csv/"><code>toCsv</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/valid-workbook-table/"><code>validWorkbookTable</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/workbook/"><code>Workbook</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
