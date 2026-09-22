---
title: "VisibleWindowView | @sheetwrite/core"
description: "One rectangular window of resolved cells, returned by Store.getVisibleWindow in a single call."
---
<!-- api-export:@sheetwrite/core|.|VisibleWindowView -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One rectangular window of resolved cells, returned by `Store.getVisibleWindow`
in a single call. The renderer paints from this view and MUST NOT call
`Store.getCell` per cell. `styleIds` are view-local indices into this view's
compact `styles` dictionary; on the worker renderer path, `styleIds.buffer` is
transferred during paint, so main-thread code must not read it after `paint`.

Lifetime: valid until the next store mutation or window refresh.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/store.ts#L45</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#visible-window-view-sheet"><code>sheet</code></a>
<a href="#visible-window-view-rows"><code>rows</code></a>
<a href="#visible-window-view-cols"><code>cols</code></a>
<a href="#visible-window-view-values"><code>values</code></a>
<a href="#visible-window-view-style-ids"><code>styleIds</code></a>
<a href="#visible-window-view-styles"><code>styles</code></a>
<a href="#visible-window-view-value-kinds"><code>valueKinds</code></a>
<a href="#visible-window-view-number-values"><code>numberValues</code></a>
<a href="#visible-window-view-string-pool-ids"><code>stringPoolIds</code></a>
<a href="#visible-window-view-string-local-ids"><code>stringLocalIds</code></a>
<a href="#visible-window-view-string-pool-update-ids"><code>stringPoolUpdateIds</code></a>
<a href="#visible-window-view-string-pool-update-values"><code>stringPoolUpdateValues</code></a>
<a href="#visible-window-view-local-strings"><code>localStrings</code></a>
<a href="#visible-window-view-ffi-calls"><code>ffiCalls</code></a>
<a href="#visible-window-view-ffi-boundary-calls"><code>ffiBoundaryCalls</code></a>
<a href="#visible-window-view-ffi-input-bytes"><code>ffiInputBytes</code></a>
<a href="#visible-window-view-ffi-output-bytes"><code>ffiOutputBytes</code></a>
<a href="#visible-window-view-ffi-largest-transfer-bytes"><code>ffiLargestTransferBytes</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>18</span>

<div class="api-member-list">

<details class="api-member" id="visible-window-view-sheet" data-pagefind-weight="1" open>
<summary><code>sheet</code></summary>

<button class="api-copy" type="button" data-copy-code="sheet: SheetId;" data-pagefind-ignore>Copy</button>

```ts generated
sheet: SheetId;
```

</details>

<details class="api-member" id="visible-window-view-rows" data-pagefind-weight="1" open>
<summary><code>rows</code> <span class="api-member-summary">end-exclusive row range</span></summary>

<button class="api-copy" type="button" data-copy-code="rows: { start: number; end: number };" data-pagefind-ignore>Copy</button>

```ts generated
rows: { start: number; end: number };
```

</details>

<details class="api-member" id="visible-window-view-cols" data-pagefind-weight="1" open>
<summary><code>cols</code> <span class="api-member-summary">visible column indices, in paint order</span></summary>

<button class="api-copy" type="button" data-copy-code="cols: readonly number[];" data-pagefind-ignore>Copy</button>

```ts generated
cols: readonly number[];
```

</details>

<details class="api-member" id="visible-window-view-values" data-pagefind-weight="1" open>
<summary><code>values</code> <span class="api-member-summary">row-major resolved values, length (end-start) cols.length</span></summary>

<button class="api-copy" type="button" data-copy-code="values: ArrayLike&lt;CellScalar&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
values: ArrayLike<CellScalar>;
```

<p class="api-member-doc">row-major resolved values, length `(end-start) * cols.length`</p>
</details>

<details class="api-member" id="visible-window-view-style-ids" data-pagefind-weight="1" open>
<summary><code>styleIds</code> <span class="api-member-summary">row-major view-local style ids, same length as values</span></summary>

<button class="api-copy" type="button" data-copy-code="styleIds: Uint32Array;" data-pagefind-ignore>Copy</button>

```ts generated
styleIds: Uint32Array;
```

</details>

<details class="api-member" id="visible-window-view-styles" data-pagefind-weight="1" open>
<summary><code>styles</code> <span class="api-member-summary">compact window style dictionary indexed by styleIds</span></summary>

<button class="api-copy" type="button" data-copy-code="styles: readonly CellStyle[];" data-pagefind-ignore>Copy</button>

```ts generated
styles: readonly CellStyle[];
```

</details>

<details class="api-member" id="visible-window-view-value-kinds" data-pagefind-weight="1" open>
<summary><code>valueKinds</code> <span class="api-member-summary">Raw cell tags for worker transfer; internal fast path.</span></summary>

<button class="api-copy" type="button" data-copy-code="valueKinds?: Uint8Array;" data-pagefind-ignore>Copy</button>

```ts generated
valueKinds?: Uint8Array;
```

</details>

<details class="api-member" id="visible-window-view-number-values" data-pagefind-weight="1" open>
<summary><code>numberValues</code> <span class="api-member-summary">Raw numeric payloads for worker transfer; internal fast path.</span></summary>

<button class="api-copy" type="button" data-copy-code="numberValues?: Float64Array;" data-pagefind-ignore>Copy</button>

```ts generated
numberValues?: Float64Array;
```

</details>

<details class="api-member" id="visible-window-view-string-pool-ids" data-pagefind-weight="1" open>
<summary><code>stringPoolIds</code> <span class="api-member-summary">Raw global string-pool ids for worker transfer; 0xffffffff means none.</span></summary>

<button class="api-copy" type="button" data-copy-code="stringPoolIds?: Uint32Array;" data-pagefind-ignore>Copy</button>

```ts generated
stringPoolIds?: Uint32Array;
```

</details>

<details class="api-member" id="visible-window-view-string-local-ids" data-pagefind-weight="1" open>
<summary><code>stringLocalIds</code> <span class="api-member-summary">Raw local-string indices for formula errors; -1 means none.</span></summary>

<button class="api-copy" type="button" data-copy-code="stringLocalIds?: Int32Array;" data-pagefind-ignore>Copy</button>

```ts generated
stringLocalIds?: Int32Array;
```

</details>

<details class="api-member" id="visible-window-view-string-pool-update-ids" data-pagefind-weight="1" open>
<summary><code>stringPoolUpdateIds</code> <span class="api-member-summary">String-pool ids resolved by this window and safe for worker cache updates.</span></summary>

<button class="api-copy" type="button" data-copy-code="stringPoolUpdateIds?: Uint32Array;" data-pagefind-ignore>Copy</button>

```ts generated
stringPoolUpdateIds?: Uint32Array;
```

</details>

<details class="api-member" id="visible-window-view-string-pool-update-values" data-pagefind-weight="1" open>
<summary><code>stringPoolUpdateValues</code> <span class="api-member-summary">String values parallel to stringPoolUpdateIds.</span></summary>

<button class="api-copy" type="button" data-copy-code="stringPoolUpdateValues?: readonly string[];" data-pagefind-ignore>Copy</button>

```ts generated
stringPoolUpdateValues?: readonly string[];
```

</details>

<details class="api-member" id="visible-window-view-local-strings" data-pagefind-weight="1" open>
<summary><code>localStrings</code> <span class="api-member-summary">Local non-pooled strings, currently formula error sentinels.</span></summary>

<button class="api-copy" type="button" data-copy-code="localStrings?: readonly string[];" data-pagefind-ignore>Copy</button>

```ts generated
localStrings?: readonly string[];
```

</details>

<details class="api-member" id="visible-window-view-ffi-calls" data-pagefind-weight="1" open>
<summary><code>ffiCalls</code> <span class="api-member-summary">Internal count of WASM boundary calls used to produce this window.</span></summary>

<button class="api-copy" type="button" data-copy-code="ffiCalls?: number;" data-pagefind-ignore>Copy</button>

```ts generated
ffiCalls?: number;
```

</details>

<details class="api-member" id="visible-window-view-ffi-boundary-calls" data-pagefind-weight="1" open>
<summary><code>ffiBoundaryCalls</code> <span class="api-member-summary">Every wasm-bindgen method/accessor/free crossing used by diagnostics.</span></summary>

<button class="api-copy" type="button" data-copy-code="ffiBoundaryCalls?: number;" data-pagefind-ignore>Copy</button>

```ts generated
ffiBoundaryCalls?: number;
```

</details>

<details class="api-member" id="visible-window-view-ffi-input-bytes" data-pagefind-weight="1" open>
<summary><code>ffiInputBytes</code> <span class="api-member-summary">Exact copied input bytes for this packed boundary operation.</span></summary>

<button class="api-copy" type="button" data-copy-code="ffiInputBytes?: number;" data-pagefind-ignore>Copy</button>

```ts generated
ffiInputBytes?: number;
```

</details>

<details class="api-member" id="visible-window-view-ffi-output-bytes" data-pagefind-weight="1" open>
<summary><code>ffiOutputBytes</code> <span class="api-member-summary">Exact copied output bytes for this packed boundary operation.</span></summary>

<button class="api-copy" type="button" data-copy-code="ffiOutputBytes?: number;" data-pagefind-ignore>Copy</button>

```ts generated
ffiOutputBytes?: number;
```

</details>

<details class="api-member" id="visible-window-view-ffi-largest-transfer-bytes" data-pagefind-weight="1" open>
<summary><code>ffiLargestTransferBytes</code> <span class="api-member-summary">Largest individual copied buffer/string payload in this operation.</span></summary>

<button class="api-copy" type="button" data-copy-code="ffiLargestTransferBytes?: number;" data-pagefind-ignore>Copy</button>

```ts generated
ffiLargestTransferBytes?: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface VisibleWindowView {&#10;  sheet: SheetId;&#10;  rows: {&#10;    start: number;&#10;    end: number;&#10;  };&#10;  cols: readonly number[];&#10;  values: ArrayLike&lt;CellScalar&gt;;&#10;  styleIds: Uint32Array;&#10;  styles: readonly CellStyle[];&#10;  valueKinds?: Uint8Array;&#10;  numberValues?: Float64Array;&#10;  stringPoolIds?: Uint32Array;&#10;  stringLocalIds?: Int32Array;&#10;  stringPoolUpdateIds?: Uint32Array;&#10;  stringPoolUpdateValues?: readonly string[];&#10;  localStrings?: readonly string[];&#10;  ffiCalls?: number;&#10;  ffiBoundaryCalls?: number;&#10;  ffiInputBytes?: number;&#10;  ffiOutputBytes?: number;&#10;  ffiLargestTransferBytes?: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface VisibleWindowView {
  sheet: SheetId;
  rows: {
    start: number;
    end: number;
  };
  cols: readonly number[];
  values: ArrayLike<CellScalar>;
  styleIds: Uint32Array;
  styles: readonly CellStyle[];
  valueKinds?: Uint8Array;
  numberValues?: Float64Array;
  stringPoolIds?: Uint32Array;
  stringLocalIds?: Int32Array;
  stringPoolUpdateIds?: Uint32Array;
  stringPoolUpdateValues?: readonly string[];
  localStrings?: readonly string[];
  ffiCalls?: number;
  ffiBoundaryCalls?: number;
  ffiInputBytes?: number;
  ffiOutputBytes?: number;
  ffiLargestTransferBytes?: number;
}
```

</details>

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

<p class="api-consumers-label">Public exports naming <code>VisibleWindowView</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/store/"><code>Store</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
