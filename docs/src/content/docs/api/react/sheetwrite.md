---
title: "Sheetwrite | @sheetwrite/react"
description: "Convenience component for local object rows."
---
<!-- api-export:@sheetwrite/react|.|Sheetwrite -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/react/">@sheetwrite/react</a><span class="api-status" data-kind="variable">variable</span></div>

Convenience component for local object rows. It derives a single-sheet workbook from
`columns`, `defaultRows`, and `sheetName`, initializes Sheetwrite, and owns the `Grid`
through prop-driven resets and unmount cleanup. Pass a `ref` to access the live `Grid`;
use `SheetwriteGrid` when the host already owns a workbook or datasource.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/react</code></dd></div>
<div><dt>Source</dt><dd><code>packages/react/src/index.tsx#L446</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="function Sheetwrite&lt;&#10;  Row extends Record&lt;string, CellScalar&gt;,&#10;  Id extends RowBridgeId = RowBridgeId,&#10;&gt;(&#10;  props: SheetwriteProps&lt;Row, Id&gt; &amp; {&#10;    ref?: ForwardedRef&lt;Grid&gt;;&#10;  },&#10;): ReactElement" data-pagefind-ignore>Copy</button>

```ts generated
function Sheetwrite<
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
>(
  props: SheetwriteProps<Row, Id> & {
    ref?: ForwardedRef<Grid>;
  },
): ReactElement
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/react</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>Sheetwrite</code></p>

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
