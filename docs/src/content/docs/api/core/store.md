---
title: "Store | @sheetwrite/core"
description: "Columnar workbook storage, query, transaction, and subscription contract."
---
<!-- api-export:@sheetwrite/core|.|Store -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Columnar workbook storage, query, transaction, and subscription contract.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/store.ts#L136</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#store-get-workbook"><code>getWorkbook</code></a>
<a href="#store-get-cell"><code>getCell</code></a>
<a href="#store-get-formula"><code>getFormula</code></a>
<a href="#store-get-spill-anchor"><code>getSpillAnchor</code></a>
<a href="#store-get-ref-target"><code>getRefTarget</code></a>
<a href="#store-recalculate-volatile"><code>recalculateVolatile</code></a>
<a href="#store-get-visible-window"><code>getVisibleWindow</code></a>
<a href="#store-get-data-window"><code>getDataWindow</code></a>
<a href="#store-get-clipboard-window"><code>getClipboardWindow</code></a>
<a href="#store-ensure-columns"><code>ensureColumns</code></a>
<a href="#store-apply-transaction"><code>applyTransaction</code></a>
<a href="#store-set-protection-resolver"><code>setProtectionResolver</code></a>
<a href="#store-on"><code>on</code></a>
<a href="#store-set-detailed-change-capture"><code>setDetailedChangeCapture</code></a>
<a href="#store-query-capability"><code>queryCapability</code></a>
<a href="#store-get-cell-load-state"><code>getCellLoadState</code></a>
<a href="#store-acknowledge-operations"><code>acknowledgeOperations</code></a>
<a href="#store-export-snapshot"><code>exportSnapshot</code></a>
<a href="#store-view-row-count"><code>viewRowCount</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>19</span>

<div class="api-member-list">

<details class="api-member" id="store-get-workbook" data-pagefind-weight="1" open>
<summary><code>getWorkbook</code></summary>

<button class="api-copy" type="button" data-copy-code="getWorkbook(): Workbook;" data-pagefind-ignore>Copy</button>

```ts generated
getWorkbook(): Workbook;
```

</details>

<details class="api-member" id="store-get-cell" data-pagefind-weight="1" open>
<summary><code>getCell</code> <span class="api-member-summary">Single-cell read for interactions, API reads, and tests.</span></summary>

<button class="api-copy" type="button" data-copy-code="getCell(addr: CellAddress): ResolvedCell;" data-pagefind-ignore>Copy</button>

```ts generated
getCell(addr: CellAddress): ResolvedCell;
```

<p class="api-member-doc">Single-cell read for interactions, API reads, and tests.
NOT for the render hot path — renderers use `getVisibleWindow`.</p>
</details>

<details class="api-member" id="store-get-formula" data-pagefind-weight="1" open>
<summary><code>getFormula</code> <span class="api-member-summary">Formula source at addr, or null when the cell is not a formula.</span></summary>

<button class="api-copy" type="button" data-copy-code="getFormula(addr: CellAddress): string | null;" data-pagefind-ignore>Copy</button>

```ts generated
getFormula(addr: CellAddress): string | null;
```

</details>

<details class="api-member" id="store-get-spill-anchor" data-pagefind-weight="1" open>
<summary><code>getSpillAnchor</code> <span class="api-member-summary">Owning dynamic-array formula cell, or null when addr is not spilled.</span></summary>

<button class="api-copy" type="button" data-copy-code="getSpillAnchor(addr: CellAddress): CellAddress | null;" data-pagefind-ignore>Copy</button>

```ts generated
getSpillAnchor(addr: CellAddress): CellAddress | null;
```

</details>

<details class="api-member" id="store-get-ref-target" data-pagefind-weight="1" open>
<summary><code>getRefTarget</code> <span class="api-member-summary">Plain-reference target at addr, or null when the cell is not a ref.</span></summary>

<button class="api-copy" type="button" data-copy-code="getRefTarget(addr: CellAddress): CellAddress | null;" data-pagefind-ignore>Copy</button>

```ts generated
getRefTarget(addr: CellAddress): CellAddress | null;
```

</details>

<details class="api-member" id="store-recalculate-volatile" data-pagefind-weight="1" open>
<summary><code>recalculateVolatile</code> <span class="api-member-summary">Recompute volatile formulas (TODAY/NOW) from one captured instant.</span></summary>

<button class="api-copy" type="button" data-copy-code="recalculateVolatile(now?: Date): void;" data-pagefind-ignore>Copy</button>

```ts generated
recalculateVolatile(now?: Date): void;
```

<p class="api-member-doc">Recompute volatile formulas (`TODAY`/`NOW`) from one captured instant.
The supplied Date is interpreted as an absolute UTC instant.</p>
</details>

<details class="api-member" id="store-get-visible-window" data-pagefind-weight="1">
<summary><code>getVisibleWindow</code> <span class="api-member-summary">Bulk read of a visible window; the only read a renderer should use per frame.</span></summary>

<button class="api-copy" type="button" data-copy-code="getVisibleWindow( sheet: SheetId, rows: { start: number; end: number }, cols: readonly number[], ): VisibleWindowView;" data-pagefind-ignore>Copy</button>

```ts generated
getVisibleWindow( sheet: SheetId, rows: { start: number; end: number }, cols: readonly number[], ): VisibleWindowView;
```

</details>

<details class="api-member" id="store-get-data-window" data-pagefind-weight="1">
<summary><code>getDataWindow</code> <span class="api-member-summary">Optional packed canonical data-row window used by file export.</span></summary>

<button class="api-copy" type="button" data-copy-code="getDataWindow?( sheet: SheetId, rows: { start: number; end: number }, cols: readonly number[], ): VisibleWindowView;" data-pagefind-ignore>Copy</button>

```ts generated
getDataWindow?( sheet: SheetId, rows: { start: number; end: number }, cols: readonly number[], ): VisibleWindowView;
```

<p class="api-member-doc">Optional packed canonical data-row window used by file export. Unlike
`getVisibleWindow`, sort/filter state never remaps `rows`.</p>
</details>

<details class="api-member" id="store-get-clipboard-window" data-pagefind-weight="1">
<summary><code>getClipboardWindow</code> <span class="api-member-summary">Optional packed clipboard read.</span></summary>

<button class="api-copy" type="button" data-copy-code="getClipboardWindow?( sheet: SheetId, viewRows: { start: number; end: number }, cols: readonly number[], ): ClipboardWindowView;" data-pagefind-ignore>Copy</button>

```ts generated
getClipboardWindow?( sheet: SheetId, viewRows: { start: number; end: number }, cols: readonly number[], ): ClipboardWindowView;
```

<p class="api-member-doc">Optional packed clipboard read. Custom stores may omit it; the controller
preserves the per-cell Store fallback contract.</p>
</details>

<details class="api-member" id="store-ensure-columns" data-pagefind-weight="1" open>
<summary><code>ensureColumns</code> <span class="api-member-summary">Ensure a sheet can address at least columns.length columns without producing user changes or dirty patches.</span></summary>

<button class="api-copy" type="button" data-copy-code="ensureColumns(sheet: SheetId, columns: readonly Column[]): void;" data-pagefind-ignore>Copy</button>

```ts generated
ensureColumns(sheet: SheetId, columns: readonly Column[]): void;
```

<p class="api-member-doc">Ensure a sheet can address at least `columns.length` columns without
producing user changes or dirty patches. Used for presentation padding.</p>
</details>

<details class="api-member" id="store-apply-transaction" data-pagefind-weight="1">
<summary><code>applyTransaction</code> <span class="api-member-summary">Apply a low-level storage transaction.</span></summary>

<button class="api-copy" type="button" data-copy-code="applyTransaction( tx: Transaction, options?: TransactionApplicationOptions, ): ApplyTransactionResult;" data-pagefind-ignore>Copy</button>

```ts generated
applyTransaction( tx: Transaction, options?: TransactionApplicationOptions, ): ApplyTransactionResult;
```

<p class="api-member-doc">Apply a low-level storage transaction.

This bypasses Grid read-only checks and Grid undo/redo history. Use
`Grid.applyTransaction` for normal host-driven edits.
Queued and flushed at a barrier — never reentrant.</p>
</details>

<details class="api-member" id="store-set-protection-resolver" data-pagefind-weight="1" open>
<summary><code>setProtectionResolver</code> <span class="api-member-summary">Configure host-owned protected-range permissions.</span></summary>

<button class="api-copy" type="button" data-copy-code="setProtectionResolver?(resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode): void;" data-pagefind-ignore>Copy</button>

```ts generated
setProtectionResolver?(resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode): void;
```

<p class="api-member-doc">Configure host-owned protected-range permissions. The resolver is synchronous
so every local mutation ingress shares one atomic commit barrier.</p>
</details>

<details class="api-member" id="store-on" data-pagefind-weight="1" open>
<summary><code>on</code></summary>

<button class="api-copy" type="button" data-copy-code="on(evt: &quot;change&quot;, fn: (event: ChangeEvent) =&gt; void): () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
on(evt: "change", fn: (event: ChangeEvent) => void): () => void;
```

</details>

<details class="api-member" id="store-set-detailed-change-capture" data-pagefind-weight="1" open>
<summary><code>setDetailedChangeCapture</code> <span class="api-member-summary">Opt in to per-cell before/after capture for packed and clear operations.</span></summary>

<button class="api-copy" type="button" data-copy-code="setDetailedChangeCapture?(enabled: boolean): void;" data-pagefind-ignore>Copy</button>

```ts generated
setDetailedChangeCapture?(enabled: boolean): void;
```

</details>

<details class="api-member" id="store-query-capability" data-pagefind-weight="1" open>
<summary><code>queryCapability</code> <span class="api-member-summary">Explicit partial-data state for paged datasource stores.</span></summary>

<button class="api-copy" type="button" data-copy-code="queryCapability?(sheet: SheetId): QueryCapability;" data-pagefind-ignore>Copy</button>

```ts generated
queryCapability?(sheet: SheetId): QueryCapability;
```

</details>

<details class="api-member" id="store-get-cell-load-state" data-pagefind-weight="1" open>
<summary><code>getCellLoadState</code> <span class="api-member-summary">Loaded/empty/local state; dense stores always return a loaded state.</span></summary>

<button class="api-copy" type="button" data-copy-code="getCellLoadState?(addr: CellAddress): CellLoadState;" data-pagefind-ignore>Copy</button>

```ts generated
getCellLoadState?(addr: CellAddress): CellLoadState;
```

</details>

<details class="api-member" id="store-acknowledge-operations" data-pagefind-weight="1" open>
<summary><code>acknowledgeOperations</code> <span class="api-member-summary">Release sparse paged edits after server acknowledgement.</span></summary>

<button class="api-copy" type="button" data-copy-code="acknowledgeOperations?(operations: readonly DocumentOp[], storageRevision?: bigint): void;" data-pagefind-ignore>Copy</button>

```ts generated
acknowledgeOperations?(operations: readonly DocumentOp[], storageRevision?: bigint): void;
```

</details>

<details class="api-member" id="store-export-snapshot" data-pagefind-weight="1" open>
<summary><code>exportSnapshot</code> <span class="api-member-summary">Deterministic, JSON-safe authoritative runtime document.</span></summary>

<button class="api-copy" type="button" data-copy-code="exportSnapshot?(): WorkbookSnapshot;" data-pagefind-ignore>Copy</button>

```ts generated
exportSnapshot?(): WorkbookSnapshot;
```

</details>

<details class="api-member" id="store-view-row-count" data-pagefind-weight="1" open>
<summary><code>viewRowCount</code> <span class="api-member-summary">Displayed row count after any active sort/filter view.</span></summary>

<button class="api-copy" type="button" data-copy-code="viewRowCount(sheet: SheetId): number;" data-pagefind-ignore>Copy</button>

```ts generated
viewRowCount(sheet: SheetId): number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface Store {&#10;  getWorkbook(): Workbook;&#10;  getCell(addr: CellAddress): ResolvedCell;&#10;  getFormula(addr: CellAddress): string | null;&#10;  getSpillAnchor(addr: CellAddress): CellAddress | null;&#10;  getRefTarget(addr: CellAddress): CellAddress | null;&#10;  recalculateVolatile(now?: Date): void;&#10;  getVisibleWindow(&#10;    sheet: SheetId,&#10;    rows: {&#10;      start: number;&#10;      end: number;&#10;    },&#10;    cols: readonly number[],&#10;  ): VisibleWindowView;&#10;  getDataWindow?(&#10;    sheet: SheetId,&#10;    rows: {&#10;      start: number;&#10;      end: number;&#10;    },&#10;    cols: readonly number[],&#10;  ): VisibleWindowView;&#10;  getClipboardWindow?(&#10;    sheet: SheetId,&#10;    viewRows: {&#10;      start: number;&#10;      end: number;&#10;    },&#10;    cols: readonly number[],&#10;  ): ClipboardWindowView;&#10;  ensureColumns(sheet: SheetId, columns: readonly Column[]): void;&#10;  applyTransaction(&#10;    tx: Transaction,&#10;    options?: TransactionApplicationOptions,&#10;  ): ApplyTransactionResult;&#10;  setProtectionResolver?(&#10;    resolver: ProtectionResolver | undefined,&#10;    mode?: MutationPolicyMode,&#10;  ): void;&#10;  on(evt: &quot;change&quot;, fn: (event: ChangeEvent) =&gt; void): () =&gt; void;&#10;  setDetailedChangeCapture?(enabled: boolean): void;&#10;  queryCapability?(sheet: SheetId): QueryCapability;&#10;  getCellLoadState?(addr: CellAddress): CellLoadState;&#10;  acknowledgeOperations?(&#10;    operations: readonly DocumentOp[],&#10;    storageRevision?: bigint,&#10;  ): void;&#10;  exportSnapshot?(): WorkbookSnapshot;&#10;  viewRowCount(sheet: SheetId): number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface Store {
  getWorkbook(): Workbook;
  getCell(addr: CellAddress): ResolvedCell;
  getFormula(addr: CellAddress): string | null;
  getSpillAnchor(addr: CellAddress): CellAddress | null;
  getRefTarget(addr: CellAddress): CellAddress | null;
  recalculateVolatile(now?: Date): void;
  getVisibleWindow(
    sheet: SheetId,
    rows: {
      start: number;
      end: number;
    },
    cols: readonly number[],
  ): VisibleWindowView;
  getDataWindow?(
    sheet: SheetId,
    rows: {
      start: number;
      end: number;
    },
    cols: readonly number[],
  ): VisibleWindowView;
  getClipboardWindow?(
    sheet: SheetId,
    viewRows: {
      start: number;
      end: number;
    },
    cols: readonly number[],
  ): ClipboardWindowView;
  ensureColumns(sheet: SheetId, columns: readonly Column[]): void;
  applyTransaction(
    tx: Transaction,
    options?: TransactionApplicationOptions,
  ): ApplyTransactionResult;
  setProtectionResolver?(
    resolver: ProtectionResolver | undefined,
    mode?: MutationPolicyMode,
  ): void;
  on(evt: "change", fn: (event: ChangeEvent) => void): () => void;
  setDetailedChangeCapture?(enabled: boolean): void;
  queryCapability?(sheet: SheetId): QueryCapability;
  getCellLoadState?(addr: CellAddress): CellLoadState;
  acknowledgeOperations?(
    operations: readonly DocumentOp[],
    storageRevision?: bigint,
  ): void;
  exportSnapshot?(): WorkbookSnapshot;
  viewRowCount(sheet: SheetId): number;
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

<p class="api-consumers-label">Public exports naming <code>Store</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/to-csv/"><code>toCsv</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/to-tsv/"><code>toTsv</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/to-xlsx-table/"><code>toXlsxTable</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/xlsx-table-export-backend/"><code>XlsxTableExportBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
<li><a href="/docs/api/xlsx/build-xlsx-model/"><code>buildXlsxModel</code></a><span class="api-consumer-kind">@sheetwrite/xlsx</span></li>
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
