---
title: "Sheetwrite | @sheetwrite/svelte"
description: "Convenience component for local object rows."
---
<!-- api-export:@sheetwrite/svelte|.|Sheetwrite -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/svelte/">@sheetwrite/svelte</a><span class="api-status" data-kind="variable">variable</span></div>

Convenience component for local object rows. Bind `grid` to access the live `Grid`.

Owns a sheet derived from `columns` and `defaultRows`. Bind `grid` for imperative access; it clears on reset or unmount.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/svelte</code></dd></div>
<div><dt>Source</dt><dd><code>packages/svelte/src/Sheetwrite.svelte.d.ts#L7</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="function Sheetwrite(&#10;  this: void,&#10;  internals: ComponentInternals,&#10;  props: SheetwriteProps&lt;Record&lt;string, CellScalar&gt;&gt;,&#10;): {&#10;  $on?(type: string, callback: (e: any) =&gt; void): () =&gt; void;&#10;  $set?(props: Partial&lt;SheetwriteProps&lt;Record&lt;string, CellScalar&gt;&gt;&gt;): void;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
function Sheetwrite(
  this: void,
  internals: ComponentInternals,
  props: SheetwriteProps<Record<string, CellScalar>>,
): {
  $on?(type: string, callback: (e: any) => void): () => void;
  $set?(props: Partial<SheetwriteProps<Record<string, CellScalar>>>): void;
}
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/svelte</code></p>

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
