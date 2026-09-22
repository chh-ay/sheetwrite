---
title: "RecordingContext2D | @sheetwrite/core/testing"
description: "The stub 2D context the canvas test stubs install: every method is a no-op that counts its invocations in calls, so tests can assert paint activity (e.g."
---
<!-- api-export:@sheetwrite/core|./testing|RecordingContext2D -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-testing/">@sheetwrite/core/testing</a><span class="api-status" data-kind="interface">interface</span></div>

The stub 2D context the canvas test stubs install: every method is a no-op
that counts its invocations in `calls`, so tests can assert paint activity
(e.g. `ctx.calls.fillText > 0`) without a real canvas.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/testing</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/testing.ts#L10</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#recording-context2-d-calls"><code>calls</code></a>
<a href="#recording-context2-d-fill-style"><code>fillStyle</code></a>
<a href="#recording-context2-d-stroke-style"><code>strokeStyle</code></a>
<a href="#recording-context2-d-font"><code>font</code></a>
<a href="#recording-context2-d-text-align"><code>textAlign</code></a>
<a href="#recording-context2-d-text-baseline"><code>textBaseline</code></a>
<a href="#recording-context2-d-line-width"><code>lineWidth</code></a>
<a href="#recording-context2-d-index"><code>index</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>8</span>

<div class="api-member-list">

<details class="api-member" id="recording-context2-d-calls" data-pagefind-weight="1" open>
<summary><code>calls</code> <span class="api-member-summary">Per-method invocation counts, keyed by the 2D-context method name.</span></summary>

<button class="api-copy" type="button" data-copy-code="readonly calls: Record&lt;string, number&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
readonly calls: Record<string, number>;
```

</details>

<details class="api-member" id="recording-context2-d-fill-style" data-pagefind-weight="1" open>
<summary><code>fillStyle</code></summary>

<button class="api-copy" type="button" data-copy-code="fillStyle: string;" data-pagefind-ignore>Copy</button>

```ts generated
fillStyle: string;
```

</details>

<details class="api-member" id="recording-context2-d-stroke-style" data-pagefind-weight="1" open>
<summary><code>strokeStyle</code></summary>

<button class="api-copy" type="button" data-copy-code="strokeStyle: string;" data-pagefind-ignore>Copy</button>

```ts generated
strokeStyle: string;
```

</details>

<details class="api-member" id="recording-context2-d-font" data-pagefind-weight="1" open>
<summary><code>font</code></summary>

<button class="api-copy" type="button" data-copy-code="font: string;" data-pagefind-ignore>Copy</button>

```ts generated
font: string;
```

</details>

<details class="api-member" id="recording-context2-d-text-align" data-pagefind-weight="1" open>
<summary><code>textAlign</code></summary>

<button class="api-copy" type="button" data-copy-code="textAlign: string;" data-pagefind-ignore>Copy</button>

```ts generated
textAlign: string;
```

</details>

<details class="api-member" id="recording-context2-d-text-baseline" data-pagefind-weight="1" open>
<summary><code>textBaseline</code></summary>

<button class="api-copy" type="button" data-copy-code="textBaseline: string;" data-pagefind-ignore>Copy</button>

```ts generated
textBaseline: string;
```

</details>

<details class="api-member" id="recording-context2-d-line-width" data-pagefind-weight="1" open>
<summary><code>lineWidth</code></summary>

<button class="api-copy" type="button" data-copy-code="lineWidth: number;" data-pagefind-ignore>Copy</button>

```ts generated
lineWidth: number;
```

</details>

<details class="api-member" id="recording-context2-d-index" data-pagefind-weight="1" open>
<summary><code>index</code></summary>

<button class="api-copy" type="button" data-copy-code="[method: string]: unknown;" data-pagefind-ignore>Copy</button>

```ts generated
[method: string]: unknown;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface RecordingContext2D {&#10;  readonly calls: Record&lt;string, number&gt;;&#10;  fillStyle: string;&#10;  strokeStyle: string;&#10;  font: string;&#10;  textAlign: string;&#10;  textBaseline: string;&#10;  lineWidth: number;&#10;  [method: string]: unknown;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface RecordingContext2D {
  readonly calls: Record<string, number>;
  fillStyle: string;
  strokeStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  lineWidth: number;
  [method: string]: unknown;
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

<p class="api-consumers-label">Public exports naming <code>RecordingContext2D</code></p>

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
