---
title: "PresenceCoordinatorEvent | @sheetwrite/core"
description: "Connection or actor transition emitted by presence coordination."
---
<!-- api-export:@sheetwrite/core|.|PresenceCoordinatorEvent -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Connection or actor transition emitted by presence coordination.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/collaboration.ts#L55"><code>packages/core/src/collaboration.ts#L55</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ type: "published"; message: PresenceMessage }
```

</div>
<div class="api-variant">

```ts generated
{ type: "updated"; actorId: string }
```

</div>
<div class="api-variant">

```ts generated
{ type: "expired"; actorId: string }
```

</div>
<div class="api-variant">

```ts generated
{ type: "error"; error: SheetwriteError }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type PresenceCoordinatorEvent =
  | {
      type: "published";
      message: PresenceMessage;
    }
  | {
      type: "updated";
      actorId: string;
    }
  | {
      type: "expired";
      actorId: string;
    }
  | {
      type: "error";
      error: SheetwriteError;
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

<p class="api-consumers-label">Public exports naming <code>PresenceCoordinatorEvent</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
