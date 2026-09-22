---
title: "RangeSnapshot | @sheetwrite/wasm"
description: "Opaque, store-local history payload for one dense rectangular cell block."
---
<!-- api-export:@sheetwrite/wasm|.|RangeSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="class">class</span></div>

Opaque, store-local history payload for one dense rectangular cell block.

The host may retain this object in undo history, but it is deliberately not
part of the serialized document protocol. String payloads remain interned in
the owning `CellStore`, so snapshots must only be restored into that store.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L334</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#range-snapshot-byte-length"><code>byteLength</code></a>
<a href="#range-snapshot-formula-offsets"><code>formulaOffsets</code></a>
<a href="#range-snapshot-formula-sources"><code>formulaSources</code></a>
<a href="#range-snapshot-free"><code>free</code></a>
<a href="#range-snapshot-kinds"><code>kinds</code></a>
<a href="#range-snapshot-reference-offsets"><code>referenceOffsets</code></a>
<a href="#range-snapshot-reference-targets"><code>referenceTargets</code></a>
<a href="#range-snapshot-style-ids"><code>styleIds</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>8</span>

<div class="api-member-list">

<details class="api-member" id="range-snapshot-byte-length" data-pagefind-weight="1" open>
<summary><code>byteLength</code></summary>

<button class="api-copy" type="button" data-copy-code="byteLength: () =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
byteLength: () => number;
```

</details>

<details class="api-member" id="range-snapshot-formula-offsets" data-pagefind-weight="1" open>
<summary><code>formulaOffsets</code></summary>

<button class="api-copy" type="button" data-copy-code="formulaOffsets: () =&gt; Uint32Array;" data-pagefind-ignore>Copy</button>

```ts generated
formulaOffsets: () => Uint32Array;
```

</details>

<details class="api-member" id="range-snapshot-formula-sources" data-pagefind-weight="1" open>
<summary><code>formulaSources</code></summary>

<button class="api-copy" type="button" data-copy-code="formulaSources: () =&gt; string[];" data-pagefind-ignore>Copy</button>

```ts generated
formulaSources: () => string[];
```

</details>

<details class="api-member" id="range-snapshot-free" data-pagefind-weight="1" open>
<summary><code>free</code></summary>

<button class="api-copy" type="button" data-copy-code="free: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="range-snapshot-kinds" data-pagefind-weight="1" open>
<summary><code>kinds</code></summary>

<button class="api-copy" type="button" data-copy-code="kinds: () =&gt; Uint8Array;" data-pagefind-ignore>Copy</button>

```ts generated
kinds: () => Uint8Array;
```

</details>

<details class="api-member" id="range-snapshot-reference-offsets" data-pagefind-weight="1" open>
<summary><code>referenceOffsets</code></summary>

<button class="api-copy" type="button" data-copy-code="referenceOffsets: () =&gt; Uint32Array;" data-pagefind-ignore>Copy</button>

```ts generated
referenceOffsets: () => Uint32Array;
```

</details>

<details class="api-member" id="range-snapshot-reference-targets" data-pagefind-weight="1" open>
<summary><code>referenceTargets</code></summary>

<button class="api-copy" type="button" data-copy-code="referenceTargets: () =&gt; Uint32Array;" data-pagefind-ignore>Copy</button>

```ts generated
referenceTargets: () => Uint32Array;
```

</details>

<details class="api-member" id="range-snapshot-style-ids" data-pagefind-weight="1" open>
<summary><code>styleIds</code></summary>

<button class="api-copy" type="button" data-copy-code="styleIds: () =&gt; Uint32Array" data-pagefind-ignore>Copy</button>

```ts generated
styleIds: () => Uint32Array
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class RangeSnapshot {&#10;  byteLength: () =&gt; number;&#10;  formulaOffsets: () =&gt; Uint32Array;&#10;  formulaSources: () =&gt; string[];&#10;  free: () =&gt; void;&#10;  kinds: () =&gt; Uint8Array;&#10;  referenceOffsets: () =&gt; Uint32Array;&#10;  referenceTargets: () =&gt; Uint32Array;&#10;  styleIds: () =&gt; Uint32Array;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
class RangeSnapshot {
  byteLength: () => number;
  formulaOffsets: () => Uint32Array;
  formulaSources: () => string[];
  free: () => void;
  kinds: () => Uint8Array;
  referenceOffsets: () => Uint32Array;
  referenceTargets: () => Uint32Array;
  styleIds: () => Uint32Array;
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

<p class="api-consumers-label">Public exports naming <code>RangeSnapshot</code></p>

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
