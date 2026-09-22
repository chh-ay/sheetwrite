---
title: "WindowView | @sheetwrite/wasm"
description: "A bulk window of resolved cells, row-major over nrows x ncols."
---
<!-- api-export:@sheetwrite/wasm|.|WindowView -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="class">class</span></div>

A bulk window of resolved cells, row-major over `n_rows x n_cols`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L367</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="window-view-free" data-pagefind-weight="1" open>
<summary><code>free</code></summary>

<button class="api-copy" type="button" data-copy-code="free: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="window-view-n-cols" data-pagefind-weight="1" open>
<summary><code>nCols</code></summary>

<button class="api-copy" type="button" data-copy-code="nCols: number;" data-pagefind-ignore>Copy</button>

```ts generated
nCols: number;
```

</details>

<details class="api-member" id="window-view-n-rows" data-pagefind-weight="1" open>
<summary><code>nRows</code></summary>

<button class="api-copy" type="button" data-copy-code="nRows: number;" data-pagefind-ignore>Copy</button>

```ts generated
nRows: number;
```

</details>

<details class="api-member" id="window-view-take-packed" data-pagefind-weight="1" open>
<summary><code>takePacked</code> <span class="api-member-summary">Consume the complete fixed-width window payload.</span></summary>

<button class="api-copy" type="button" data-copy-code="takePacked: () =&gt; Uint8Array;" data-pagefind-ignore>Copy</button>

```ts generated
takePacked: () => Uint8Array;
```

<p class="api-member-doc">Consume the complete fixed-width window payload. The returned
`Uint8Array` is copied by wasm-bindgen into JS-owned memory.</p>
</details>

<details class="api-member" id="window-view-take-strings" data-pagefind-weight="1" open>
<summary><code>takeStrings</code> <span class="api-member-summary">Consume formula-error sentinel strings referenced by the packed data.</span></summary>

<button class="api-copy" type="button" data-copy-code="takeStrings: () =&gt; string[]" data-pagefind-ignore>Copy</button>

```ts generated
takeStrings: () => string[]
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class WindowView {&#10;  free: () =&gt; void;&#10;  nCols: number;&#10;  nRows: number;&#10;  takePacked: () =&gt; Uint8Array;&#10;  takeStrings: () =&gt; string[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
class WindowView {
  free: () => void;
  nCols: number;
  nRows: number;
  takePacked: () => Uint8Array;
  takeStrings: () => string[];
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/wasm</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/core</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>WindowView</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/wasm/cell-store/"><code>CellStore</code></a><span class="api-consumer-kind">@sheetwrite/wasm</span></li>
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
