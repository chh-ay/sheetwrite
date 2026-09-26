---
title: "CanvasTestStubOptions | @sheetwrite/core/testing"
description: "Layout dimensions installed by installCanvasTestStubs in DOM test environments."
---
<!-- api-export:@sheetwrite/core|./testing|CanvasTestStubOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-testing/">@sheetwrite/core/testing</a><span class="api-status" data-kind="interface">interface</span></div>

Layout dimensions installed by [`installCanvasTestStubs`](/docs/api/core-testing/install-canvas-test-stubs/) in DOM test environments.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/testing.ts#L23"><code>packages/core/src/testing.ts#L23</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="canvas-test-stub-options-width" data-pagefind-weight="1">
<summary><code>width</code> <span class="api-member-summary">Stubbed clientWidth for every element (happy-dom/jsdom have no layout).</span></summary>

```ts generated
width?: number;
```

<p class="api-member-doc">Stubbed `clientWidth` for every element (happy-dom/jsdom have no layout). Default 800.</p>
</details>

<details class="api-member" id="canvas-test-stub-options-height" data-pagefind-weight="1">
<summary><code>height</code> <span class="api-member-summary">Stubbed clientHeight for every element.</span></summary>

```ts generated
height?: number;
```

<p class="api-member-doc">Stubbed `clientHeight` for every element. Default 400.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

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
