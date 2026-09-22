---
title: "SnapshotResourceLimits | @sheetwrite/core"
description: "Resource ceilings applied before snapshot normalization or store allocation."
---
<!-- api-export:@sheetwrite/core|.|SnapshotResourceLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Resource ceilings applied before snapshot normalization or store allocation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/document-protocol.ts#L150</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#snapshot-resource-limits-max-sheets"><code>maxSheets</code></a>
<a href="#snapshot-resource-limits-max-rows-per-sheet"><code>maxRowsPerSheet</code></a>
<a href="#snapshot-resource-limits-max-columns-per-sheet"><code>maxColumnsPerSheet</code></a>
<a href="#snapshot-resource-limits-max-metadata-entries"><code>maxMetadataEntries</code></a>
<a href="#snapshot-resource-limits-max-serialized-bytes"><code>maxSerializedBytes</code></a>
<a href="#snapshot-resource-limits-max-logical-cells-per-sheet"><code>maxLogicalCellsPerSheet</code></a>
<a href="#snapshot-resource-limits-max-dense-cells"><code>maxDenseCells</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="snapshot-resource-limits-max-sheets" data-pagefind-weight="1" open>
<summary><code>maxSheets</code> <span class="api-member-summary">Workbook sheets; defaults to 256.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxSheets: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxSheets: number;
```

</details>

<details class="api-member" id="snapshot-resource-limits-max-rows-per-sheet" data-pagefind-weight="1" open>
<summary><code>maxRowsPerSheet</code> <span class="api-member-summary">Rows in any sheet; defaults to 1,000,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxRowsPerSheet: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxRowsPerSheet: number;
```

</details>

<details class="api-member" id="snapshot-resource-limits-max-columns-per-sheet" data-pagefind-weight="1" open>
<summary><code>maxColumnsPerSheet</code> <span class="api-member-summary">Columns in any sheet; defaults to 16,384.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxColumnsPerSheet: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxColumnsPerSheet: number;
```

</details>

<details class="api-member" id="snapshot-resource-limits-max-metadata-entries" data-pagefind-weight="1" open>
<summary><code>maxMetadataEntries</code> <span class="api-member-summary">Aggregate workbook/sheet metadata array entries; defaults to 1,000,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxMetadataEntries: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxMetadataEntries: number;
```

</details>

<details class="api-member" id="snapshot-resource-limits-max-serialized-bytes" data-pagefind-weight="1" open>
<summary><code>maxSerializedBytes</code> <span class="api-member-summary">UTF-8 JSON bytes inspected while validating a snapshot; defaults to 64 MiB.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxSerializedBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxSerializedBytes: number;
```

</details>

<details class="api-member" id="snapshot-resource-limits-max-logical-cells-per-sheet" data-pagefind-weight="1" open>
<summary><code>maxLogicalCellsPerSheet</code> <span class="api-member-summary">Logical row-by-column cells in any sheet; defaults to 4,294,967,295.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxLogicalCellsPerSheet: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxLogicalCellsPerSheet: number;
```

</details>

<details class="api-member" id="snapshot-resource-limits-max-dense-cells" data-pagefind-weight="1" open>
<summary><code>maxDenseCells</code> <span class="api-member-summary">Aggregate cells allocated by dense storage; defaults to 5,000,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxDenseCells: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxDenseCells: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SnapshotResourceLimits {&#10;  maxSheets: number;&#10;  maxRowsPerSheet: number;&#10;  maxColumnsPerSheet: number;&#10;  maxMetadataEntries: number;&#10;  maxSerializedBytes: number;&#10;  maxLogicalCellsPerSheet: number;&#10;  maxDenseCells: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SnapshotResourceLimits {
  maxSheets: number;
  maxRowsPerSheet: number;
  maxColumnsPerSheet: number;
  maxMetadataEntries: number;
  maxSerializedBytes: number;
  maxLogicalCellsPerSheet: number;
  maxDenseCells: number;
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

<p class="api-consumers-label">Public exports naming <code>SnapshotResourceLimits</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/default-snapshot-resource-limits/"><code>DEFAULT_SNAPSHOT_RESOURCE_LIMITS</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-store-options/"><code>SheetwriteStoreOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/snapshot-grid-options/"><code>SnapshotGridOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/snapshot-resource-error/"><code>SnapshotResourceError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/snapshot-validation-options/"><code>SnapshotValidationOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
