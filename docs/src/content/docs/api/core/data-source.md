---
title: "DataSource | @sheetwrite/core"
description: "Host callback that asynchronously loads cancellable rectangular pages."
---
<!-- api-export:@sheetwrite/core|.|DataSource -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host callback that asynchronously loads cancellable rectangular pages.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L66</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="data-source-capabilities" data-pagefind-weight="1" open>
<summary><code>capabilities</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly capabilities: DataSourceCapabilities;" data-pagefind-ignore>Copy</button>

```ts generated
readonly capabilities: DataSourceCapabilities;
```

</details>

<details class="api-member" id="data-source-get-rows" data-pagefind-weight="1" open>
<summary><code>getRows</code> <span class="api-member-summary">Loads the requested rows and columns; implementations should stop work when its signal aborts.</span></summary>

<button class="api-copy" type="button" data-copy-code="getRows(request: DataSourceRequest): Promise&lt;DataSourcePage&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
getRows(request: DataSourceRequest): Promise<DataSourcePage>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface DataSource {&#10;  readonly capabilities: DataSourceCapabilities;&#10;  getRows(request: DataSourceRequest): Promise&lt;DataSourcePage&gt;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface DataSource {
  readonly capabilities: DataSourceCapabilities;
  getRows(request: DataSourceRequest): Promise<DataSourcePage>;
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

<p class="api-consumers-label">Public exports naming <code>DataSource</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid-options/"><code>GridOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/legacy-full-width-data-source/"><code>legacyFullWidthDataSource</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/vue/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
