---
title: "DocumentOp | @sheetwrite/core"
description: "Exhaustive serializable operation union for workbook mutations."
---
<!-- api-export:@sheetwrite/core|.|DocumentOp -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Exhaustive serializable operation union for workbook mutations.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L374</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>33</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  op: &quot;set&quot;;&#10;  addr: CellAddress;&#10;  value: CellValue;&#10;  style?: CellStyle;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  op: "set";
  addr: CellAddress;
  value: CellValue;
  style?: CellStyle;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ op: &quot;setRange&quot;; range: Range; cells: SnapshotCell[] }" data-pagefind-ignore>Copy</button>

```ts generated
{ op: "setRange"; range: Range; cells: SnapshotCell[] }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ op: &quot;setBlock&quot;; range: Range; block: PackedCellBlock }" data-pagefind-ignore>Copy</button>

```ts generated
{ op: "setBlock"; range: Range; block: PackedCellBlock }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  op: &quot;setRangeStyle&quot;;&#10;  range: Range;&#10;  style: Partial&lt;CellStyle&gt; | null;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  op: "setRangeStyle";
  range: Range;
  style: Partial<CellStyle> | null;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  op: &quot;clearRange&quot;;&#10;  range: Range;&#10;  contents?: boolean;&#10;  style?: boolean;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  op: "clearRange";
  range: Range;
  contents?: boolean;
  style?: boolean;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ op: &quot;addRows&quot;; sheet: SheetId; at: number; count: number }" data-pagefind-ignore>Copy</button>

```ts generated
{ op: "addRows"; sheet: SheetId; at: number; count: number }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  op: &quot;removeRows&quot;;&#10;  sheet: SheetId;&#10;  at: number;&#10;  count: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  op: "removeRows";
  sheet: SheetId;
  at: number;
  count: number;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  op: &quot;moveRows&quot;;&#10;  sheet: SheetId;&#10;  from: number;&#10;  count: number;&#10;  to: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  op: "moveRows";
  sheet: SheetId;
  from: number;
  count: number;
  to: number;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  op: &quot;addColumns&quot;;&#10;  sheet: SheetId;&#10;  at: number;&#10;  columns: Column[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  op: "addColumns";
  sheet: SheetId;
  at: number;
  columns: Column[];
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  op: &quot;removeColumns&quot;;&#10;  sheet: SheetId;&#10;  at: number;&#10;  count: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  op: "removeColumns";
  sheet: SheetId;
  at: number;
  count: number;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  op: &quot;moveColumns&quot;;&#10;  sheet: SheetId;&#10;  from: number;&#10;  count: number;&#10;  to: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  op: "moveColumns";
  sheet: SheetId;
  from: number;
  count: number;
  to: number;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  op: &quot;setColumn&quot;;&#10;  sheet: SheetId;&#10;  col: number;&#10;  patch: Partial&lt;Column&gt;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  op: "setColumn";
  sheet: SheetId;
  col: number;
  patch: Partial<Column>;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  op: &quot;setRowMeta&quot;;&#10;  sheet: SheetId;&#10;  row: number;&#10;  meta: RowMetadata | null;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  op: "setRowMeta";
  sheet: SheetId;
  row: number;
  meta: RowMetadata | null;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ op: &quot;addMerge&quot;; sheet: SheetId; merge: MergeRange }" data-pagefind-ignore>Copy</button>

```ts generated
{ op: "addMerge"; sheet: SheetId; merge: MergeRange }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ op: &quot;removeMerge&quot;; sheet: SheetId; merge: MergeRange }" data-pagefind-ignore>Copy</button>

```ts generated
{ op: "removeMerge"; sheet: SheetId; merge: MergeRange }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ op: &quot;addSheet&quot;; sheet: SheetSnapshot }" data-pagefind-ignore>Copy</button>

```ts generated
{ op: "addSheet"; sheet: SheetSnapshot }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ op: &quot;removeSheet&quot;; sheet: SheetId }" data-pagefind-ignore>Copy</button>

```ts generated
{ op: "removeSheet"; sheet: SheetId }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ op: &quot;renameSheet&quot;; sheet: SheetId; name: string }" data-pagefind-ignore>Copy</button>

```ts generated
{ op: "renameSheet"; sheet: SheetId; name: string }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ op: &quot;moveSheet&quot;; sheet: SheetId; to: number }" data-pagefind-ignore>Copy</button>

```ts generated
{ op: "moveSheet"; sheet: SheetId; to: number }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  op: &quot;setSheetVisibility&quot;;&#10;  sheet: SheetId;&#10;  visibility: SheetVisibility;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  op: "setSheetVisibility";
  sheet: SheetId;
  visibility: SheetVisibility;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ op: &quot;addTable&quot;; table: WorkbookTable }" data-pagefind-ignore>Copy</button>

```ts generated
{ op: "addTable"; table: WorkbookTable }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  op: &quot;updateTable&quot;;&#10;  sheet: SheetId;&#10;  tableId: string;&#10;  patch: WorkbookTablePatch;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  op: "updateTable";
  sheet: SheetId;
  tableId: string;
  patch: WorkbookTablePatch;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ op: &quot;removeTable&quot;; sheet: SheetId; tableId: string }" data-pagefind-ignore>Copy</button>

```ts generated
{ op: "removeTable"; sheet: SheetId; tableId: string }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  op: &quot;setSheetMeta&quot;;&#10;  sheet: SheetId;&#10;  patch: {&#10;    frozenRows?: number;&#10;    frozenCols?: number;&#10;    conditionalFormats?: ConditionalFormatRule[];&#10;    rowGroups?: RowGroup[];&#10;    sortKeys?: SortKey[];&#10;    filters?: Array&lt;[col: number, filter: ColumnFilter]&gt;;&#10;  };&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  op: "setSheetMeta";
  sheet: SheetId;
  patch: {
    frozenRows?: number;
    frozenCols?: number;
    conditionalFormats?: ConditionalFormatRule[];
    rowGroups?: RowGroup[];
    sortKeys?: SortKey[];
    filters?: Array<[col: number, filter: ColumnFilter]>;
  };
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  op: &quot;setValidationRule&quot;;&#10;  sheet: SheetId;&#10;  rule: DataValidationRule;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  op: "setValidationRule";
  sheet: SheetId;
  rule: DataValidationRule;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ op: &quot;removeValidationRule&quot;; sheet: SheetId; id: string }" data-pagefind-ignore>Copy</button>

```ts generated
{ op: "removeValidationRule"; sheet: SheetId; id: string }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  op: &quot;setHyperlink&quot;;&#10;  sheet: SheetId;&#10;  hyperlink: CellHyperlink;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  op: "setHyperlink";
  sheet: SheetId;
  hyperlink: CellHyperlink;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ op: &quot;removeHyperlink&quot;; sheet: SheetId; id: string }" data-pagefind-ignore>Copy</button>

```ts generated
{ op: "removeHyperlink"; sheet: SheetId; id: string }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  op: &quot;setProtectedRange&quot;;&#10;  sheet: SheetId;&#10;  protectedRange: ProtectedRange;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  op: "setProtectedRange";
  sheet: SheetId;
  protectedRange: ProtectedRange;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ op: &quot;removeProtectedRange&quot;; sheet: SheetId; id: string }" data-pagefind-ignore>Copy</button>

```ts generated
{ op: "removeProtectedRange"; sheet: SheetId; id: string }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ op: &quot;setNote&quot;; addr: CellAddress; text: string | null }" data-pagefind-ignore>Copy</button>

```ts generated
{ op: "setNote"; addr: CellAddress; text: string | null }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ op: &quot;setNamedRange&quot;; namedRange: NamedRangeSnapshot }" data-pagefind-ignore>Copy</button>

```ts generated
{ op: "setNamedRange"; namedRange: NamedRangeSnapshot }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ op: &quot;removeNamedRange&quot;; name: string; scope?: SheetId }" data-pagefind-ignore>Copy</button>

```ts generated
{ op: "removeNamedRange"; name: string; scope?: SheetId }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export type DocumentOp =&#10;  | {&#10;      op: &quot;set&quot;;&#10;      addr: CellAddress;&#10;      value: CellValue;&#10;      style?: CellStyle;&#10;    }&#10;  | {&#10;      op: &quot;setRange&quot;;&#10;      range: Range;&#10;      cells: SnapshotCell[];&#10;    }&#10;  | {&#10;      op: &quot;setBlock&quot;;&#10;      range: Range;&#10;      block: PackedCellBlock;&#10;    }&#10;  | {&#10;      op: &quot;setRangeStyle&quot;;&#10;      range: Range;&#10;      style: Partial&lt;CellStyle&gt; | null;&#10;    }&#10;  | {&#10;      op: &quot;clearRange&quot;;&#10;      range: Range;&#10;      contents?: boolean;&#10;      style?: boolean;&#10;    }&#10;  | {&#10;      op: &quot;addRows&quot;;&#10;      sheet: SheetId;&#10;      at: number;&#10;      count: number;&#10;    }&#10;  | {&#10;      op: &quot;removeRows&quot;;&#10;      sheet: SheetId;&#10;      at: number;&#10;      count: number;&#10;    }&#10;  | {&#10;      op: &quot;moveRows&quot;;&#10;      sheet: SheetId;&#10;      from: number;&#10;      count: number;&#10;      to: number;&#10;    }&#10;  | {&#10;      op: &quot;addColumns&quot;;&#10;      sheet: SheetId;&#10;      at: number;&#10;      columns: Column[];&#10;    }&#10;  | {&#10;      op: &quot;removeColumns&quot;;&#10;      sheet: SheetId;&#10;      at: number;&#10;      count: number;&#10;    }&#10;  | {&#10;      op: &quot;moveColumns&quot;;&#10;      sheet: SheetId;&#10;      from: number;&#10;      count: number;&#10;      to: number;&#10;    }&#10;  | {&#10;      op: &quot;setColumn&quot;;&#10;      sheet: SheetId;&#10;      col: number;&#10;      patch: Partial&lt;Column&gt;;&#10;    }&#10;  | {&#10;      op: &quot;setRowMeta&quot;;&#10;      sheet: SheetId;&#10;      row: number;&#10;      meta: RowMetadata | null;&#10;    }&#10;  | {&#10;      op: &quot;addMerge&quot;;&#10;      sheet: SheetId;&#10;      merge: MergeRange;&#10;    }&#10;  | {&#10;      op: &quot;removeMerge&quot;;&#10;      sheet: SheetId;&#10;      merge: MergeRange;&#10;    }&#10;  | {&#10;      op: &quot;addSheet&quot;;&#10;      sheet: SheetSnapshot;&#10;    }&#10;  | {&#10;      op: &quot;removeSheet&quot;;&#10;      sheet: SheetId;&#10;    }&#10;  | {&#10;      op: &quot;renameSheet&quot;;&#10;      sheet: SheetId;&#10;      name: string;&#10;    }&#10;  | {&#10;      op: &quot;moveSheet&quot;;&#10;      sheet: SheetId;&#10;      to: number;&#10;    }&#10;  | {&#10;      op: &quot;setSheetVisibility&quot;;&#10;      sheet: SheetId;&#10;      visibility: SheetVisibility;&#10;    }&#10;  | {&#10;      op: &quot;addTable&quot;;&#10;      table: WorkbookTable;&#10;    }&#10;  | {&#10;      op: &quot;updateTable&quot;;&#10;      sheet: SheetId;&#10;      tableId: string;&#10;      patch: WorkbookTablePatch;&#10;    }&#10;  | {&#10;      op: &quot;removeTable&quot;;&#10;      sheet: SheetId;&#10;      tableId: string;&#10;    }&#10;  | {&#10;      op: &quot;setSheetMeta&quot;;&#10;      sheet: SheetId;&#10;      patch: {&#10;        frozenRows?: number;&#10;        frozenCols?: number;&#10;        conditionalFormats?: ConditionalFormatRule[];&#10;        rowGroups?: RowGroup[];&#10;        sortKeys?: SortKey[];&#10;        filters?: Array&lt;[col: number, filter: ColumnFilter]&gt;;&#10;      };&#10;    }&#10;  | {&#10;      op: &quot;setValidationRule&quot;;&#10;      sheet: SheetId;&#10;      rule: DataValidationRule;&#10;    }&#10;  | {&#10;      op: &quot;removeValidationRule&quot;;&#10;      sheet: SheetId;&#10;      id: string;&#10;    }&#10;  | {&#10;      op: &quot;setHyperlink&quot;;&#10;      sheet: SheetId;&#10;      hyperlink: CellHyperlink;&#10;    }&#10;  | {&#10;      op: &quot;removeHyperlink&quot;;&#10;      sheet: SheetId;&#10;      id: string;&#10;    }&#10;  | {&#10;      op: &quot;setProtectedRange&quot;;&#10;      sheet: SheetId;&#10;      protectedRange: ProtectedRange;&#10;    }&#10;  | {&#10;      op: &quot;removeProtectedRange&quot;;&#10;      sheet: SheetId;&#10;      id: string;&#10;    }&#10;  | {&#10;      op: &quot;setNote&quot;;&#10;      addr: CellAddress;&#10;      text: string | null;&#10;    }&#10;  | {&#10;      op: &quot;setNamedRange&quot;;&#10;      namedRange: NamedRangeSnapshot;&#10;    }&#10;  | {&#10;      op: &quot;removeNamedRange&quot;;&#10;      name: string;&#10;      scope?: SheetId;&#10;    };" data-pagefind-ignore>Copy</button>

```ts generated
export type DocumentOp =
  | {
      op: "set";
      addr: CellAddress;
      value: CellValue;
      style?: CellStyle;
    }
  | {
      op: "setRange";
      range: Range;
      cells: SnapshotCell[];
    }
  | {
      op: "setBlock";
      range: Range;
      block: PackedCellBlock;
    }
  | {
      op: "setRangeStyle";
      range: Range;
      style: Partial<CellStyle> | null;
    }
  | {
      op: "clearRange";
      range: Range;
      contents?: boolean;
      style?: boolean;
    }
  | {
      op: "addRows";
      sheet: SheetId;
      at: number;
      count: number;
    }
  | {
      op: "removeRows";
      sheet: SheetId;
      at: number;
      count: number;
    }
  | {
      op: "moveRows";
      sheet: SheetId;
      from: number;
      count: number;
      to: number;
    }
  | {
      op: "addColumns";
      sheet: SheetId;
      at: number;
      columns: Column[];
    }
  | {
      op: "removeColumns";
      sheet: SheetId;
      at: number;
      count: number;
    }
  | {
      op: "moveColumns";
      sheet: SheetId;
      from: number;
      count: number;
      to: number;
    }
  | {
      op: "setColumn";
      sheet: SheetId;
      col: number;
      patch: Partial<Column>;
    }
  | {
      op: "setRowMeta";
      sheet: SheetId;
      row: number;
      meta: RowMetadata | null;
    }
  | {
      op: "addMerge";
      sheet: SheetId;
      merge: MergeRange;
    }
  | {
      op: "removeMerge";
      sheet: SheetId;
      merge: MergeRange;
    }
  | {
      op: "addSheet";
      sheet: SheetSnapshot;
    }
  | {
      op: "removeSheet";
      sheet: SheetId;
    }
  | {
      op: "renameSheet";
      sheet: SheetId;
      name: string;
    }
  | {
      op: "moveSheet";
      sheet: SheetId;
      to: number;
    }
  | {
      op: "setSheetVisibility";
      sheet: SheetId;
      visibility: SheetVisibility;
    }
  | {
      op: "addTable";
      table: WorkbookTable;
    }
  | {
      op: "updateTable";
      sheet: SheetId;
      tableId: string;
      patch: WorkbookTablePatch;
    }
  | {
      op: "removeTable";
      sheet: SheetId;
      tableId: string;
    }
  | {
      op: "setSheetMeta";
      sheet: SheetId;
      patch: {
        frozenRows?: number;
        frozenCols?: number;
        conditionalFormats?: ConditionalFormatRule[];
        rowGroups?: RowGroup[];
        sortKeys?: SortKey[];
        filters?: Array<[col: number, filter: ColumnFilter]>;
      };
    }
  | {
      op: "setValidationRule";
      sheet: SheetId;
      rule: DataValidationRule;
    }
  | {
      op: "removeValidationRule";
      sheet: SheetId;
      id: string;
    }
  | {
      op: "setHyperlink";
      sheet: SheetId;
      hyperlink: CellHyperlink;
    }
  | {
      op: "removeHyperlink";
      sheet: SheetId;
      id: string;
    }
  | {
      op: "setProtectedRange";
      sheet: SheetId;
      protectedRange: ProtectedRange;
    }
  | {
      op: "removeProtectedRange";
      sheet: SheetId;
      id: string;
    }
  | {
      op: "setNote";
      addr: CellAddress;
      text: string | null;
    }
  | {
      op: "setNamedRange";
      namedRange: NamedRangeSnapshot;
    }
  | {
      op: "removeNamedRange";
      name: string;
      scope?: SheetId;
    };
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

<p class="api-consumers-label">Public exports naming <code>DocumentOp</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-op-target/"><code>documentOpTarget</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/document-rebase-result/"><code>DocumentRebaseResult</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid-transaction/"><code>GridTransaction</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/pending-commit/"><code>PendingCommit</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/persistence-commit-request/"><code>PersistenceCommitRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/protection-request/"><code>ProtectionRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/rebase-document-operations/"><code>rebaseDocumentOperations</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-clear-delta/"><code>RowBridgeClearDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-fill-delta/"><code>RowBridgeFillDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-host-action-delta/"><code>RowBridgeHostActionDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li class="api-consumer-more">and 30 more</li>
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
