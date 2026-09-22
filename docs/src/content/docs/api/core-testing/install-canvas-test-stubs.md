---
title: "installCanvasTestStubs | @sheetwrite/core/testing"
description: "Install the canvas + layout stubs a DOM test environment (jsdom/happy-dom) needs before createGrid can mount — without them the renderer throws \"Sheetwrite: 2D canvas context is unavailable\"."
---
<!-- api-export:@sheetwrite/core|./testing|installCanvasTestStubs -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-testing/">@sheetwrite/core/testing</a><span class="api-status" data-kind="function">function</span></div>

Install the canvas + layout stubs a DOM test environment (jsdom/happy-dom)
needs before `createGrid` can mount — without them the renderer throws
`"Sheetwrite: 2D canvas context is unavailable"`. Returns a restore
function that undoes every patch.

The installed `getContext("2d")` returns a per-canvas
[`RecordingContext2D`](/docs/api/core-testing/recording-context2-d/); re-request it from a mounted canvas to assert
paint activity. Nothing is painted — assert grid STATE, not pixels.
Test-only: never import from production code.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/testing</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/testing.ts#L74</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="function installCanvasTestStubs(&#10;  options?: CanvasTestStubOptions,&#10;): () =&gt; void" data-pagefind-ignore>Copy</button>

```ts generated
function installCanvasTestStubs(
  options?: CanvasTestStubOptions,
): () => void
```

</div>

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

<p class="api-consumers-label">Public exports naming <code>installCanvasTestStubs</code></p>

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
