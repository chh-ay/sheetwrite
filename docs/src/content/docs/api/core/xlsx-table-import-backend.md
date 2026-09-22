---
title: "XlsxTableImportBackend | @sheetwrite/core"
description: "Pluggable table import backend."
---
<!-- api-export:@sheetwrite/core|.|XlsxTableImportBackend -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Pluggable table import backend. Parses raw `.xlsx` bytes into the same
`ColumnarData` shape `fromCsv` returns, so host ingestion code can stay
format-agnostic.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L348</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-table-import-backend-name" data-pagefind-weight="1" open>
<summary><code>name</code></summary>

<button class="api-copy" type="button" data-copy-code="name: string;" data-pagefind-ignore>Copy</button>

```ts generated
name: string;
```

</details>

<details class="api-member" id="xlsx-table-import-backend-from-xlsx-table" data-pagefind-weight="1">
<summary><code>fromXlsxTable</code></summary>

<button class="api-copy" type="button" data-copy-code="fromXlsxTable( data: ArrayBuffer | Uint8Array, options?: XlsxWorkbookOptions, ): Promise&lt;ColumnarData&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
fromXlsxTable( data: ArrayBuffer | Uint8Array, options?: XlsxWorkbookOptions, ): Promise<ColumnarData>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface XlsxTableImportBackend {&#10;  name: string;&#10;  fromXlsxTable(&#10;    data: ArrayBuffer | Uint8Array,&#10;    options?: XlsxWorkbookOptions,&#10;  ): Promise&lt;ColumnarData&gt;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface XlsxTableImportBackend {
  name: string;
  fromXlsxTable(
    data: ArrayBuffer | Uint8Array,
    options?: XlsxWorkbookOptions,
  ): Promise<ColumnarData>;
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

<p class="api-consumers-label">Public exports naming <code>XlsxTableImportBackend</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/set-xlsx-table-import-backend/"><code>setXlsxTableImportBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/xlsx/sheetwrite-table-import-backend/"><code>sheetwriteTableImportBackend</code></a><span class="api-consumer-kind">@sheetwrite/xlsx</span></li>
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
