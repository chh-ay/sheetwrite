---
title: "XlsxTableExportBackend | @sheetwrite/core"
description: "Pluggable first-row-header, first-sheet table export backend."
---
<!-- api-export:@sheetwrite/core|.|XlsxTableExportBackend -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Pluggable first-row-header, first-sheet table export backend.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L299</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-table-export-backend-name" data-pagefind-weight="1" open>
<summary><code>name</code></summary>

<button class="api-copy" type="button" data-copy-code="name: string;" data-pagefind-ignore>Copy</button>

```ts generated
name: string;
```

</details>

<details class="api-member" id="xlsx-table-export-backend-to-xlsx-table" data-pagefind-weight="1" open>
<summary><code>toXlsxTable</code></summary>

<button class="api-copy" type="button" data-copy-code="toXlsxTable(workbook: Workbook, store: Store, options?: XlsxWorkbookOptions): Promise&lt;Uint8Array&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
toXlsxTable(workbook: Workbook, store: Store, options?: XlsxWorkbookOptions): Promise<Uint8Array>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface XlsxTableExportBackend {&#10;  name: string;&#10;  toXlsxTable(&#10;    workbook: Workbook,&#10;    store: Store,&#10;    options?: XlsxWorkbookOptions,&#10;  ): Promise&lt;Uint8Array&gt;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface XlsxTableExportBackend {
  name: string;
  toXlsxTable(
    workbook: Workbook,
    store: Store,
    options?: XlsxWorkbookOptions,
  ): Promise<Uint8Array>;
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

<p class="api-consumers-label">Public exports naming <code>XlsxTableExportBackend</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/set-xlsx-table-export-backend/"><code>setXlsxTableExportBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/xlsx/sheetwrite-table-export-backend/"><code>sheetwriteTableExportBackend</code></a><span class="api-consumer-kind">@sheetwrite/xlsx</span></li>
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
