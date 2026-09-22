---
title: "createGridController | @sheetwrite/core/adapter"
description: "Create a grid and wire its lifecycle once, so the React/Vue/Svelte adapters (and any plain host) share a single, drift-free implementation instead of each re-deriving the same create → subscribe → teardown behavior."
---
<!-- api-export:@sheetwrite/core|./adapter|createGridController -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="function">function</span></div>

Create a grid and wire its lifecycle once, so the React/Vue/Svelte adapters
(and any plain host) share a single, drift-free implementation instead of
each re-deriving the same create → subscribe → teardown behavior.

`initSheetwrite()` MUST already have been awaited; [`createGrid`](/docs/api/core/create-grid/) throws
otherwise.

### Live handlers
`handlers` is held **by reference**, not copied. Every event reads the
object's *current* fields (`handlers.onGridChange?.(…)`), so a host may swap
callbacks without rebuilding the grid. Framework adapters must mutate the
shared object only from their commit lifecycle; mutating it during render can
expose callbacks from work that never commits.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/grid-controller.ts#L108</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="function createGridController&lt;Id extends RowBridgeId = RowBridgeId&gt;(&#10;  host: HTMLElement,&#10;  options: GridOptions,&#10;  handlers: GridControllerHandlers&lt;Id&gt;,&#10;  rowBridge?: RowBridge&lt;Id&gt;,&#10;): GridController" data-pagefind-ignore>Copy</button>

```ts generated
function createGridController<Id extends RowBridgeId = RowBridgeId>(
  host: HTMLElement,
  options: GridOptions,
  handlers: GridControllerHandlers<Id>,
  rowBridge?: RowBridge<Id>,
): GridController
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

<p class="api-consumers-label">Public exports naming <code>createGridController</code></p>

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
