---
title: "CellOut | @sheetwrite/wasm"
description: "Result of a single-cell read."
---
<!-- api-export:@sheetwrite/wasm|.|CellOut -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="class">class</span></div>

Result of a single-cell read.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L7</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="cell-out-free" data-pagefind-weight="1" open>
<summary><code>free</code></summary>

<button class="api-copy" type="button" data-copy-code="free: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="cell-out-kind" data-pagefind-weight="1" open>
<summary><code>kind</code></summary>

<button class="api-copy" type="button" data-copy-code="kind: number;" data-pagefind-ignore>Copy</button>

```ts generated
kind: number;
```

</details>

<details class="api-member" id="cell-out-num" data-pagefind-weight="1" open>
<summary><code>num</code></summary>

<button class="api-copy" type="button" data-copy-code="num: number;" data-pagefind-ignore>Copy</button>

```ts generated
num: number;
```

</details>

<details class="api-member" id="cell-out-string" data-pagefind-weight="1" open>
<summary><code>string</code></summary>

<button class="api-copy" type="button" data-copy-code="string: string | undefined;" data-pagefind-ignore>Copy</button>

```ts generated
string: string | undefined;
```

</details>

<details class="api-member" id="cell-out-style" data-pagefind-weight="1" open>
<summary><code>style</code></summary>

<button class="api-copy" type="button" data-copy-code="style: number" data-pagefind-ignore>Copy</button>

```ts generated
style: number
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class CellOut {&#10;  free: () =&gt; void;&#10;  kind: number;&#10;  num: number;&#10;  string: string | undefined;&#10;  style: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
class CellOut {
  free: () => void;
  kind: number;
  num: number;
  string: string | undefined;
  style: number;
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

<p class="api-consumers-label">Public exports naming <code>CellOut</code></p>

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
