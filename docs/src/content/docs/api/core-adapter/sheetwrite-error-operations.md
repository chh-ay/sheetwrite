---
title: "SHEETWRITE_ERROR_OPERATIONS | @sheetwrite/core/adapter"
description: "Stable operations at which a consumer-visible failure can surface."
---
<!-- api-export:@sheetwrite/core|./adapter|SHEETWRITE_ERROR_OPERATIONS -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="variable">variable</span></div>

Stable operations at which a consumer-visible failure can surface.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/errors.ts#L56</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="const SHEETWRITE_ERROR_OPERATIONS: readonly [&#10;  &quot;initialize&quot;,&#10;  &quot;create-grid&quot;,&#10;  &quot;datasource-request&quot;,&#10;  &quot;renderer-worker&quot;,&#10;  &quot;export-xlsx&quot;,&#10;  &quot;xlsx-import&quot;,&#10;  &quot;xlsx-export&quot;,&#10;  &quot;delimited-parse&quot;,&#10;  &quot;delimited-import&quot;,&#10;  &quot;delimited-encode&quot;,&#10;  &quot;delimited-export&quot;,&#10;  &quot;delimited-options&quot;,&#10;  &quot;snapshot-validate&quot;,&#10;  &quot;snapshot-allocate&quot;,&#10;  &quot;persistence&quot;,&#10;  &quot;pending-storage&quot;,&#10;  &quot;synchronize&quot;,&#10;  &quot;presence&quot;,&#10;  &quot;revision&quot;,&#10;  &quot;comments&quot;,&#10;  &quot;query&quot;,&#10;  &quot;hyperlink-activate&quot;,&#10;]" data-pagefind-ignore>Copy</button>

```ts generated
const SHEETWRITE_ERROR_OPERATIONS: readonly [
  "initialize",
  "create-grid",
  "datasource-request",
  "renderer-worker",
  "export-xlsx",
  "xlsx-import",
  "xlsx-export",
  "delimited-parse",
  "delimited-import",
  "delimited-encode",
  "delimited-export",
  "delimited-options",
  "snapshot-validate",
  "snapshot-allocate",
  "persistence",
  "pending-storage",
  "synchronize",
  "presence",
  "revision",
  "comments",
  "query",
  "hyperlink-activate",
]
```

</div>

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

<p class="api-consumers-label">Public exports naming <code>SHEETWRITE_ERROR_OPERATIONS</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sheetwrite-error-operation/"><code>SheetwriteErrorOperation</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/sheetwrite-error-operation/"><code>SheetwriteErrorOperation</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
