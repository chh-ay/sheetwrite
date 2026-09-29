---
title: "createWorkerMessageHandler | @sheetwrite/core/worker"
description: "Build the worker-side protocol handler."
---
<!-- api-export:@sheetwrite/core|./worker|createWorkerMessageHandler -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-worker/">@sheetwrite/core/worker</a><span class="api-status" data-kind="function">function</span></div>

Build the worker-side protocol handler. Keeping the mutable render state
inside the returned closure lets tests exercise the real message contract
without booting a browser Worker.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/worker.ts#L259"><code>packages/core/src/worker.ts#L259</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createWorkerMessageHandler(
  postAcknowledgement: (message: WorkerAcknowledgement) => void,
): (message: unknown) => void
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

<p class="api-consumers-label">Public exports naming <code>createWorkerMessageHandler</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
