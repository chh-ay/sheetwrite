---
title: "RowBridgeDelta | @sheetwrite/svelte"
description: "Every possible projection produced by a row bridge."
---
<!-- api-export:@sheetwrite/svelte|.|RowBridgeDelta -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/svelte/">@sheetwrite/svelte</a><span class="api-status" data-kind="type">type</span></div>

Every possible projection produced by a row bridge.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/svelte</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/row-bridge.d.ts#L112</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="export type RowBridgeDelta&lt;Id extends RowBridgeId = RowBridgeId&gt; =&#10;  | RowBridgeCellDelta&lt;Id&gt;&#10;  | RowBridgeRangeDelta&lt;Id&gt;&#10;  | RowBridgeClearDelta&lt;Id&gt;&#10;  | RowBridgePasteDelta&lt;Id&gt;&#10;  | RowBridgeFillDelta&lt;Id&gt;&#10;  | RowBridgeRowStructureDelta&lt;Id&gt;&#10;  | RowBridgeMetadataDelta&lt;Id&gt;&#10;  | RowBridgeHostActionDelta&lt;Id&gt;&#10;  | RowBridgeUnprojectableDelta&lt;Id&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
export type RowBridgeDelta<Id extends RowBridgeId = RowBridgeId> =
  | RowBridgeCellDelta<Id>
  | RowBridgeRangeDelta<Id>
  | RowBridgeClearDelta<Id>
  | RowBridgePasteDelta<Id>
  | RowBridgeFillDelta<Id>
  | RowBridgeRowStructureDelta<Id>
  | RowBridgeMetadataDelta<Id>
  | RowBridgeHostActionDelta<Id>
  | RowBridgeUnprojectableDelta<Id>;
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/svelte</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>RowBridgeDelta</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/row-bridge-projection/"><code>RowBridgeProjection</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-projection/"><code>RowBridgeProjection</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/row-bridge-projection/"><code>RowBridgeProjection</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/row-bridge-projection/"><code>RowBridgeProjection</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/row-bridge-projection/"><code>RowBridgeProjection</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
