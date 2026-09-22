---
title: "XlsxWorkbookBackend | @sheetwrite/core"
description: "Optional backend contract for complete workbook XLSX interchange."
---
<!-- api-export:@sheetwrite/core|.|XlsxWorkbookBackend -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Optional backend contract for complete workbook XLSX interchange.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L418</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-workbook-backend-name" data-pagefind-weight="1" open>
<summary><code>name</code></summary>

<button class="api-copy" type="button" data-copy-code="name: string;" data-pagefind-ignore>Copy</button>

```ts generated
name: string;
```

</details>

<details class="api-member" id="xlsx-workbook-backend-to-xlsx-workbook" data-pagefind-weight="1" open>
<summary><code>toXlsxWorkbook</code></summary>

<button class="api-copy" type="button" data-copy-code="toXlsxWorkbook(snapshot: WorkbookSnapshot, options?: XlsxWorkbookOptions): Promise&lt;Uint8Array&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
toXlsxWorkbook(snapshot: WorkbookSnapshot, options?: XlsxWorkbookOptions): Promise<Uint8Array>;
```

</details>

<details class="api-member" id="xlsx-workbook-backend-from-xlsx-workbook" data-pagefind-weight="1">
<summary><code>fromXlsxWorkbook</code></summary>

<button class="api-copy" type="button" data-copy-code="fromXlsxWorkbook( data: ArrayBuffer | Uint8Array, options?: XlsxWorkbookOptions, ): Promise&lt;WorkbookSnapshot&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
fromXlsxWorkbook( data: ArrayBuffer | Uint8Array, options?: XlsxWorkbookOptions, ): Promise<WorkbookSnapshot>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface XlsxWorkbookBackend {&#10;  name: string;&#10;  toXlsxWorkbook(&#10;    snapshot: WorkbookSnapshot,&#10;    options?: XlsxWorkbookOptions,&#10;  ): Promise&lt;Uint8Array&gt;;&#10;  fromXlsxWorkbook(&#10;    data: ArrayBuffer | Uint8Array,&#10;    options?: XlsxWorkbookOptions,&#10;  ): Promise&lt;WorkbookSnapshot&gt;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface XlsxWorkbookBackend {
  name: string;
  toXlsxWorkbook(
    snapshot: WorkbookSnapshot,
    options?: XlsxWorkbookOptions,
  ): Promise<Uint8Array>;
  fromXlsxWorkbook(
    data: ArrayBuffer | Uint8Array,
    options?: XlsxWorkbookOptions,
  ): Promise<WorkbookSnapshot>;
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

<p class="api-consumers-label">Public exports naming <code>XlsxWorkbookBackend</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/set-xlsx-workbook-backend/"><code>setXlsxWorkbookBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/xlsx/sheetwrite-workbook-backend/"><code>sheetwriteWorkbookBackend</code></a><span class="api-consumer-kind">@sheetwrite/xlsx</span></li>
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
