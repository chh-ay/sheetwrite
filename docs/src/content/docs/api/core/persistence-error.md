---
title: "PersistenceError | @sheetwrite/core"
description: "Typed failure raised by persistence and synchronization flows."
---
<!-- api-export:@sheetwrite/core|.|PersistenceError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Typed failure raised by persistence and synchronization flows.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/persistence.ts#L44"><code>packages/core/src/persistence.ts#L44</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="persistence-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(code: PersistenceErrorCode, message: string, options?: ErrorOptions);
```

</details>

<details class="api-member" id="persistence-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: "PersistenceError"
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class PersistenceError extends SheetwriteError {
  constructor(
    code: PersistenceErrorCode,
    message: string,
    options?: ErrorOptions,
  );
  name: "PersistenceError";
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

<p class="api-consumers-label">Public exports naming <code>PersistenceError</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
