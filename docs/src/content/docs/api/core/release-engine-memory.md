---
title: "releaseEngineMemory | @sheetwrite/core"
description: "releaseEngineMemory function in @sheetwrite/core: Move all live stores into a fresh WASM instance."
---
<!-- api-export:@sheetwrite/core|.|releaseEngineMemory -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Move all live stores into a fresh WASM instance. Call explicitly while idle;
the main-thread pause scales with resident data and compact undo history.
Preparation failures leave every live store and the selected instance unchanged.
A larger replacement is discarded; the report then has zero migrated stores.

## Examples

```ts compile
import { initSheetwrite, releaseEngineMemory } from "@sheetwrite/core";

await initSheetwrite();
// Run between user actions, not in an input or render callback.
const report = await releaseEngineMemory();
document.body.dataset.engineBytes = String(report.wasmBytesAfter);
```

## See also

- [EngineMemoryReleaseReport](/docs/api/core/engine-memory-release-report/)

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/engine-memory.ts#L39"><code>packages/core/src/engine-memory.ts#L39</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function releaseEngineMemory(): Promise<EngineMemoryReleaseReport>
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>releaseEngineMemory</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
