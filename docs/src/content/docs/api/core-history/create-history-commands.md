---
title: "createHistoryCommands | @sheetwrite/core/history"
description: "createHistoryCommands function in @sheetwrite/core/history: Opt in to Review › Version History and Save Version in every command renderer."
---
<!-- api-export:@sheetwrite/core|./history|createHistoryCommands -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="function">function</span></div>

Opt in to Review › Version History and Save Version in every command
renderer. Set the returned capability as `GridConfig.history`. The panel
and its code load only when either command runs; archive recording stays
under the host's existing committed-transaction journal.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/history-ui.ts#L10"><code>packages/core/src/version-history/history-ui.ts#L10</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createHistoryCommands(
  options: HistoryCommandsOptions,
): NonNullable<GridConfig["history"]>
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/queries</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>createHistoryCommands</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
