---
title: "Column | @sheetwrite/core"
description: "Schema and default presentation for one workbook column."
---
<!-- api-export:@sheetwrite/core|.|Column -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Schema and default presentation for one workbook column.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L107</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#column-key"><code>key</code></a>
<a href="#column-header"><code>header</code></a>
<a href="#column-width"><code>width</code></a>
<a href="#column-type"><code>type</code></a>
<a href="#column-number-format"><code>numberFormat</code></a>
<a href="#column-number-locale"><code>numberLocale</code></a>
<a href="#column-header-style"><code>headerStyle</code></a>
<a href="#column-cell-style"><code>cellStyle</code></a>
<a href="#column-visible"><code>visible</code></a>
<a href="#column-renderer"><code>renderer</code></a>
<a href="#column-editor"><code>editor</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>11</span>

<div class="api-member-list">

<details class="api-member" id="column-key" data-pagefind-weight="1" open>
<summary><code>key</code> <span class="api-member-summary">Non-empty key, unique within the sheet, used to map input and datasource values.</span></summary>

<button class="api-copy" type="button" data-copy-code="key: string;" data-pagefind-ignore>Copy</button>

```ts generated
key: string;
```

</details>

<details class="api-member" id="column-header" data-pagefind-weight="1" open>
<summary><code>header</code> <span class="api-member-summary">Schema label used by table exports and data-grid presentation headers.</span></summary>

<button class="api-copy" type="button" data-copy-code="header: string;" data-pagefind-ignore>Copy</button>

```ts generated
header: string;
```

</details>

<details class="api-member" id="column-width" data-pagefind-weight="1" open>
<summary><code>width</code> <span class="api-member-summary">Unzoomed column width in CSS pixels.</span></summary>

<button class="api-copy" type="button" data-copy-code="width: number;" data-pagefind-ignore>Copy</button>

```ts generated
width: number;
```

</details>

<details class="api-member" id="column-type" data-pagefind-weight="1" open>
<summary><code>type</code> <span class="api-member-summary">Controls cell input parsing and default value formatting for this column.</span></summary>

<button class="api-copy" type="button" data-copy-code="type: CellFormat;" data-pagefind-ignore>Copy</button>

```ts generated
type: CellFormat;
```

</details>

<details class="api-member" id="column-number-format" data-pagefind-weight="1" open>
<summary><code>numberFormat</code> <span class="api-member-summary">Excel number-format code, e.g.</span></summary>

<button class="api-copy" type="button" data-copy-code="numberFormat?: string;" data-pagefind-ignore>Copy</button>

```ts generated
numberFormat?: string;
```

<p class="api-member-doc">Excel number-format code, e.g. &quot;#,##0.00&quot;</p>
</details>

<details class="api-member" id="column-number-locale" data-pagefind-weight="1" open>
<summary><code>numberLocale</code> <span class="api-member-summary">Explicit BCP 47 locale for separators; omitted keeps the deterministic default.</span></summary>

<button class="api-copy" type="button" data-copy-code="numberLocale?: string;" data-pagefind-ignore>Copy</button>

```ts generated
numberLocale?: string;
```

</details>

<details class="api-member" id="column-header-style" data-pagefind-weight="1" open>
<summary><code>headerStyle</code> <span class="api-member-summary">Overrides theme styling for the painted column header.</span></summary>

<button class="api-copy" type="button" data-copy-code="headerStyle?: CellStyle;" data-pagefind-ignore>Copy</button>

```ts generated
headerStyle?: CellStyle;
```

</details>

<details class="api-member" id="column-cell-style" data-pagefind-weight="1" open>
<summary><code>cellStyle</code> <span class="api-member-summary">Base style merged beneath each cell's own style.</span></summary>

<button class="api-copy" type="button" data-copy-code="cellStyle?: CellStyle;" data-pagefind-ignore>Copy</button>

```ts generated
cellStyle?: CellStyle;
```

</details>

<details class="api-member" id="column-visible" data-pagefind-weight="1" open>
<summary><code>visible</code> <span class="api-member-summary">Set to false to exclude the column from the live view and table exports.</span></summary>

<button class="api-copy" type="button" data-copy-code="visible?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
visible?: boolean;
```

</details>

<details class="api-member" id="column-renderer" data-pagefind-weight="1" open>
<summary><code>renderer</code> <span class="api-member-summary">Name of a registered custom cell renderer (see Grid.defineCellRenderer).</span></summary>

<button class="api-copy" type="button" data-copy-code="renderer?: string;" data-pagefind-ignore>Copy</button>

```ts generated
renderer?: string;
```

</details>

<details class="api-member" id="column-editor" data-pagefind-weight="1" open>
<summary><code>editor</code> <span class="api-member-summary">Name of a registered custom editor (see GridOptions.editors).</span></summary>

<button class="api-copy" type="button" data-copy-code="editor?: string;" data-pagefind-ignore>Copy</button>

```ts generated
editor?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface Column {&#10;  key: string;&#10;  header: string;&#10;  width: number;&#10;  type: CellFormat;&#10;  numberFormat?: string;&#10;  numberLocale?: string;&#10;  headerStyle?: CellStyle;&#10;  cellStyle?: CellStyle;&#10;  visible?: boolean;&#10;  renderer?: string;&#10;  editor?: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface Column {
  key: string;
  header: string;
  width: number;
  type: CellFormat;
  numberFormat?: string;
  numberLocale?: string;
  headerStyle?: CellStyle;
  cellStyle?: CellStyle;
  visible?: boolean;
  renderer?: string;
  editor?: string;
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

<p class="api-consumers-label">Public exports naming <code>Column</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/cell-editor-context/"><code>CellEditorContext</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/from-csv/"><code>fromCsv</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet/"><code>Sheet</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet-snapshot/"><code>SheetSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/store/"><code>Store</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/cell-editor-context/"><code>CellEditorContext</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/cell-editor-context/"><code>CellEditorContext</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/cell-editor-context/"><code>CellEditorContext</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
