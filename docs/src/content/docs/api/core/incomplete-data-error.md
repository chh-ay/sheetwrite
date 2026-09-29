---
title: "IncompleteDataError | @sheetwrite/core"
description: "Error thrown when an operation requires datasource cells that are not loaded."
---
<!-- api-export:@sheetwrite/core|.|IncompleteDataError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Error thrown when an operation requires datasource cells that are not loaded.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/store/data-engine.ts#L242"><code>packages/core/src/store/data-engine.ts#L242</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="incomplete-data-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(sheet: SheetId, capability: Extract<QueryCapability, { status: "incomplete"; }>);
```

</details>

<details class="api-member" id="incomplete-data-error-capability" data-pagefind-weight="1">
<summary><code>capability</code></summary>

```ts generated
capability: { status: "incomplete"; loadedCells: number; totalCells: number; };
```

</details>

<details class="api-member" id="incomplete-data-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: "IncompleteDataError"
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class IncompleteDataError extends SheetwriteError {
  constructor(
    sheet: SheetId,
    capability: Extract<
      QueryCapability,
      {
        status: "incomplete";
      }
    >,
  );
  capability: {
    status: "incomplete";
    loadedCells: number;
    totalCells: number;
  };
  name: "IncompleteDataError";
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

<p class="api-consumers-label">Public exports naming <code>IncompleteDataError</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
