---
title: "GRID_OPTION_POLICY | @sheetwrite/core/adapter"
description: "Classification of adapter options as live-updatable or reset-sensitive."
---
<!-- api-export:@sheetwrite/core|./adapter|GRID_OPTION_POLICY -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="variable">variable</span></div>

Classification of adapter options as live-updatable or reset-sensitive.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L69</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="const GRID_OPTION_POLICY: {&#10;  readonly workbook: &quot;reset&quot;;&#10;  readonly data: &quot;reset&quot;;&#10;  readonly datasource: &quot;reset&quot;;&#10;  readonly datasourceStorage: &quot;reset&quot;;&#10;  readonly renderer: &quot;reset&quot;;&#10;  readonly workerUrl: &quot;reset&quot;;&#10;  readonly presentation: &quot;reset&quot;;&#10;  readonly renderers: &quot;reset&quot;;&#10;  readonly editors: &quot;reset&quot;;&#10;  readonly protectionResolver: &quot;reset&quot;;&#10;  readonly mutationPolicy: &quot;reset&quot;;&#10;  readonly transactionResourceLimits: &quot;reset&quot;;&#10;  readonly hyperlinkActivation: &quot;reset&quot;;&#10;  readonly theme: &quot;live&quot;;&#10;  readonly readOnly: &quot;live&quot;;&#10;  readonly config: &quot;live&quot;;&#10;  readonly overscan: &quot;live&quot;;&#10;  readonly minColumns: &quot;live&quot;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
const GRID_OPTION_POLICY: {
  readonly workbook: "reset";
  readonly data: "reset";
  readonly datasource: "reset";
  readonly datasourceStorage: "reset";
  readonly renderer: "reset";
  readonly workerUrl: "reset";
  readonly presentation: "reset";
  readonly renderers: "reset";
  readonly editors: "reset";
  readonly protectionResolver: "reset";
  readonly mutationPolicy: "reset";
  readonly transactionResourceLimits: "reset";
  readonly hyperlinkActivation: "reset";
  readonly theme: "live";
  readonly readOnly: "live";
  readonly config: "live";
  readonly overscan: "live";
  readonly minColumns: "live";
}
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

<p class="api-consumers-label">Public exports naming <code>GRID_OPTION_POLICY</code></p>

<ul class="api-consumer-list">
<li>None.</li>
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
