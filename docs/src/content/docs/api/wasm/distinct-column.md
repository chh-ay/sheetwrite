---
title: "DistinctColumn | @sheetwrite/wasm"
description: "Distinct-value scan result for one column: parallel kind/number/text arrays whose buffers are surrendered once through the take accessors."
---
<!-- api-export:@sheetwrite/wasm|.|DistinctColumn -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="class">class</span></div>

Distinct-value scan result for one column: parallel kind/number/text
arrays whose buffers are surrendered once through the `take*` accessors.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L308</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="distinct-column-free" data-pagefind-weight="1" open>
<summary><code>free</code></summary>

<button class="api-copy" type="button" data-copy-code="free: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="distinct-column-take-kinds" data-pagefind-weight="1" open>
<summary><code>takeKinds</code> <span class="api-member-summary">Surrenders the per-value kind tags (number/string/boolean codes); the column keeps an empty buffer afterwards.</span></summary>

<button class="api-copy" type="button" data-copy-code="takeKinds: () =&gt; Uint8Array;" data-pagefind-ignore>Copy</button>

```ts generated
takeKinds: () => Uint8Array;
```

</details>

<details class="api-member" id="distinct-column-take-numbers" data-pagefind-weight="1" open>
<summary><code>takeNumbers</code> <span class="api-member-summary">Surrenders the numeric values aligned with the takeKinds tags.</span></summary>

<button class="api-copy" type="button" data-copy-code="takeNumbers: () =&gt; Float64Array;" data-pagefind-ignore>Copy</button>

```ts generated
takeNumbers: () => Float64Array;
```

</details>

<details class="api-member" id="distinct-column-take-texts" data-pagefind-weight="1" open>
<summary><code>takeTexts</code> <span class="api-member-summary">Surrenders the distinct strings aligned with the takeKinds tags.</span></summary>

<button class="api-copy" type="button" data-copy-code="takeTexts: () =&gt; string[]" data-pagefind-ignore>Copy</button>

```ts generated
takeTexts: () => string[]
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class DistinctColumn {&#10;  free: () =&gt; void;&#10;  takeKinds: () =&gt; Uint8Array;&#10;  takeNumbers: () =&gt; Float64Array;&#10;  takeTexts: () =&gt; string[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
class DistinctColumn {
  free: () => void;
  takeKinds: () => Uint8Array;
  takeNumbers: () => Float64Array;
  takeTexts: () => string[];
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

<p class="api-consumers-label">Public exports naming <code>DistinctColumn</code></p>

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
