---
title: "SyncProtocolError | @sheetwrite/core"
description: "Typed rejection of malformed or resource-exhausting synchronization input."
---
<!-- api-export:@sheetwrite/core|.|SyncProtocolError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Typed rejection of malformed or resource-exhausting synchronization input.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/sync.ts#L204"><code>packages/core/src/sync.ts#L204</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="sync-protocol-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(code: SyncProtocolErrorCode, message: string);
```

</details>

<details class="api-member" id="sync-protocol-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: "SyncProtocolError"
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class SyncProtocolError extends SheetwriteError {
  constructor(code: SyncProtocolErrorCode, message: string);
  name: "SyncProtocolError";
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

<p class="api-consumers-label">Public exports naming <code>SyncProtocolError</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
