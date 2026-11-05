---
title: "HistoryError | @sheetwrite/core/history"
description: "HistoryError class in @sheetwrite/core/history: Expected archive failure; cancellation preserves the caller's abort reason."
---
<!-- api-export:@sheetwrite/core|./history|HistoryError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="class">class</span></div>

Expected archive failure; cancellation preserves the caller's abort reason.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/codec.ts#L18"><code>packages/core/src/version-history/codec.ts#L18</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="history-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(code: HistoryErrorCode, message: string, options?: ErrorOptions);
```

</details>

<details class="api-member" id="history-error-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

```ts generated
code: HistoryErrorCode;
```

</details>

<details class="api-member" id="history-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: "HistoryError"
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class HistoryError extends SheetwriteError {
  constructor(
    code: HistoryErrorCode,
    message: string,
    options?: ErrorOptions,
  );
  code: HistoryErrorCode;
  name: "HistoryError";
}
```

</details>

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

<p class="api-consumers-label">Public exports naming <code>HistoryError</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
