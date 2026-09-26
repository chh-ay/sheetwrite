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
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/testing.ts#L74"><code>packages/core/src/testing.ts#L74</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

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
