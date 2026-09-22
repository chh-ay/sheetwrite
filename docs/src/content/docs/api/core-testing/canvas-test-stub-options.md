---
title: "CanvasTestStubOptions | @sheetwrite/core/testing"
description: "Layout dimensions installed by installCanvasTestStubs in DOM test environments."
---
<!-- api-export:@sheetwrite/core|./testing|CanvasTestStubOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-testing/">@sheetwrite/core/testing</a><span class="api-status" data-kind="interface">interface</span></div>

Layout dimensions installed by [`installCanvasTestStubs`](/docs/api/core-testing/install-canvas-test-stubs/) in DOM test environments.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/testing</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/testing.ts#L23</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="canvas-test-stub-options-width" data-pagefind-weight="1" open>
<summary><code>width</code> <span class="api-member-summary">Stubbed clientWidth for every element (happy-dom/jsdom have no layout).</span></summary>

<button class="api-copy" type="button" data-copy-code="width?: number;" data-pagefind-ignore>Copy</button>

```ts generated
width?: number;
```

<p class="api-member-doc">Stubbed `clientWidth` for every element (happy-dom/jsdom have no layout). Default 800.</p>
</details>

<details class="api-member" id="canvas-test-stub-options-height" data-pagefind-weight="1" open>
<summary><code>height</code> <span class="api-member-summary">Stubbed clientHeight for every element.</span></summary>

<button class="api-copy" type="button" data-copy-code="height?: number;" data-pagefind-ignore>Copy</button>

```ts generated
height?: number;
```

<p class="api-member-doc">Stubbed `clientHeight` for every element. Default 400.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface CanvasTestStubOptions {&#10;  width?: number;&#10;  height?: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface CanvasTestStubOptions {
  width?: number;
  height?: number;
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

<p class="api-consumers-label">Public exports naming <code>CanvasTestStubOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-testing/install-canvas-test-stubs/"><code>installCanvasTestStubs</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
