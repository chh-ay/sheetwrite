---
title: "rebaseDocumentOperations | @sheetwrite/core"
description: "Conservative server-ordered rebase for pending offline work."
---
<!-- api-export:@sheetwrite/core|.|rebaseDocumentOperations -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Conservative server-ordered rebase for pending offline work. Non-overlapping
literal edits are shifted across row/column insertion and deletion. Ambiguous
formula, overlapping, sheet-lifecycle, and move cases become explicit
conflicts instead of lossy guesses. This is the collaboration design gate;
no CRDT dependency is required for the supported cases.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/rebase.ts#L51"><code>packages/core/src/rebase.ts#L51</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function rebaseDocumentOperations(
  localOperations: readonly DocumentOp[],
  remoteOperations: readonly DocumentOp[],
): DocumentRebaseResult
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

<p class="api-consumers-label">Public exports naming <code>rebaseDocumentOperations</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
