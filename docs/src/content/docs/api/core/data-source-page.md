---
title: "DataSourcePage | @sheetwrite/core"
description: "One resolved rectangular page returned by a DataSource."
---
<!-- api-export:@sheetwrite/core|.|DataSourcePage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One resolved rectangular page returned by a DataSource.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L48</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="data-source-page-protocol" data-pagefind-weight="1" open>
<summary><code>protocol</code> <span class="api-member-summary">Paging contract version.</span></summary>

<button class="api-copy" type="button" data-copy-code="protocol: 2;" data-pagefind-ignore>Copy</button>

```ts generated
protocol: 2;
```

</details>

<details class="api-member" id="data-source-page-start" data-pagefind-weight="1" open>
<summary><code>start</code> <span class="api-member-summary">Inclusive row index of the first returned row.</span></summary>

<button class="api-copy" type="button" data-copy-code="start: number;" data-pagefind-ignore>Copy</button>

```ts generated
start: number;
```

</details>

<details class="api-member" id="data-source-page-columns" data-pagefind-weight="1" open>
<summary><code>columns</code> <span class="api-member-summary">Exact column runs represented by every returned row.</span></summary>

<button class="api-copy" type="button" data-copy-code="columns: readonly DataSourceColumnBand[];" data-pagefind-ignore>Copy</button>

```ts generated
columns: readonly DataSourceColumnBand[];
```

</details>

<details class="api-member" id="data-source-page-rows" data-pagefind-weight="1" open>
<summary><code>rows</code></summary>

<button class="api-copy" type="button" data-copy-code="rows: RowData[];" data-pagefind-ignore>Copy</button>

```ts generated
rows: RowData[];
```

</details>

<details class="api-member" id="data-source-page-revision" data-pagefind-weight="1" open>
<summary><code>revision</code></summary>

<button class="api-copy" type="button" data-copy-code="revision?: string | number;" data-pagefind-ignore>Copy</button>

```ts generated
revision?: string | number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface DataSourcePage {&#10;  protocol: 2;&#10;  start: number;&#10;  columns: readonly DataSourceColumnBand[];&#10;  rows: RowData[];&#10;  revision?: string | number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface DataSourcePage {
  protocol: 2;
  start: number;
  columns: readonly DataSourceColumnBand[];
  rows: RowData[];
  revision?: string | number;
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

<p class="api-consumers-label">Public exports naming <code>DataSourcePage</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/data-source/"><code>DataSource</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
