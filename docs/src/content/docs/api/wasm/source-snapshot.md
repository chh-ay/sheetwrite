---
title: "SourceSnapshot | @sheetwrite/wasm"
description: "Compact serializable projection of persisted derived-cell sources and spill identity in one range."
---
<!-- api-export:@sheetwrite/wasm|.|SourceSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="class">class</span></div>

Compact serializable projection of persisted derived-cell sources and spill
identity in one range. Offsets are row-major and sorted; reference targets
are packed `[sheet_handle, row, col]` triples.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L352</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#source-snapshot-byte-length"><code>byteLength</code></a>
<a href="#source-snapshot-formula-offsets"><code>formulaOffsets</code></a>
<a href="#source-snapshot-formula-sources"><code>formulaSources</code></a>
<a href="#source-snapshot-free"><code>free</code></a>
<a href="#source-snapshot-reference-offsets"><code>referenceOffsets</code></a>
<a href="#source-snapshot-reference-targets"><code>referenceTargets</code></a>
<a href="#source-snapshot-spill-derived"><code>spillDerived</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="source-snapshot-byte-length" data-pagefind-weight="1" open>
<summary><code>byteLength</code></summary>

<button class="api-copy" type="button" data-copy-code="byteLength: () =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
byteLength: () => number;
```

</details>

<details class="api-member" id="source-snapshot-formula-offsets" data-pagefind-weight="1" open>
<summary><code>formulaOffsets</code></summary>

<button class="api-copy" type="button" data-copy-code="formulaOffsets: () =&gt; Uint32Array;" data-pagefind-ignore>Copy</button>

```ts generated
formulaOffsets: () => Uint32Array;
```

</details>

<details class="api-member" id="source-snapshot-formula-sources" data-pagefind-weight="1" open>
<summary><code>formulaSources</code></summary>

<button class="api-copy" type="button" data-copy-code="formulaSources: () =&gt; string[];" data-pagefind-ignore>Copy</button>

```ts generated
formulaSources: () => string[];
```

</details>

<details class="api-member" id="source-snapshot-free" data-pagefind-weight="1" open>
<summary><code>free</code></summary>

<button class="api-copy" type="button" data-copy-code="free: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="source-snapshot-reference-offsets" data-pagefind-weight="1" open>
<summary><code>referenceOffsets</code></summary>

<button class="api-copy" type="button" data-copy-code="referenceOffsets: () =&gt; Uint32Array;" data-pagefind-ignore>Copy</button>

```ts generated
referenceOffsets: () => Uint32Array;
```

</details>

<details class="api-member" id="source-snapshot-reference-targets" data-pagefind-weight="1" open>
<summary><code>referenceTargets</code></summary>

<button class="api-copy" type="button" data-copy-code="referenceTargets: () =&gt; Uint32Array;" data-pagefind-ignore>Copy</button>

```ts generated
referenceTargets: () => Uint32Array;
```

</details>

<details class="api-member" id="source-snapshot-spill-derived" data-pagefind-weight="1" open>
<summary><code>spillDerived</code></summary>

<button class="api-copy" type="button" data-copy-code="spillDerived: () =&gt; Uint8Array" data-pagefind-ignore>Copy</button>

```ts generated
spillDerived: () => Uint8Array
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class SourceSnapshot {&#10;  byteLength: () =&gt; number;&#10;  formulaOffsets: () =&gt; Uint32Array;&#10;  formulaSources: () =&gt; string[];&#10;  free: () =&gt; void;&#10;  referenceOffsets: () =&gt; Uint32Array;&#10;  referenceTargets: () =&gt; Uint32Array;&#10;  spillDerived: () =&gt; Uint8Array;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
class SourceSnapshot {
  byteLength: () => number;
  formulaOffsets: () => Uint32Array;
  formulaSources: () => string[];
  free: () => void;
  referenceOffsets: () => Uint32Array;
  referenceTargets: () => Uint32Array;
  spillDerived: () => Uint8Array;
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

<p class="api-consumers-label">Public exports naming <code>SourceSnapshot</code></p>

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
