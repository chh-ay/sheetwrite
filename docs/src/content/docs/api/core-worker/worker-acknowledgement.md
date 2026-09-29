---
title: "WorkerAcknowledgement | @sheetwrite/core/worker"
description: "Lifecycle and frame acknowledgements posted back to the sender."
---
<!-- api-export:@sheetwrite/core|./worker|WorkerAcknowledgement -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-worker/">@sheetwrite/core/worker</a><span class="api-status" data-kind="type">type</span></div>

Lifecycle and frame acknowledgements posted back to the sender.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/worker.ts#L249"><code>packages/core/src/worker.ts#L249</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ type: "ready" }
```

</div>
<div class="api-variant">

```ts generated
{ type: "fatal"; reason: string }
```

</div>
<div class="api-variant">

```ts generated
{ type: "painted" }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type WorkerAcknowledgement =
  | {
      type: "ready";
    }
  | {
      type: "fatal";
      reason: string;
    }
  | {
      type: "painted";
    };
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

<p class="api-consumers-label">Public exports naming <code>WorkerAcknowledgement</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-worker/create-worker-message-handler/"><code>createWorkerMessageHandler</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
