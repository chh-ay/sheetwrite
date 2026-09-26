---
title: "RevisionRestoreResponse | @sheetwrite/core"
description: "Applied or conflict acknowledgement for a revision restore."
---
<!-- api-export:@sheetwrite/core|.|RevisionRestoreResponse -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Applied or conflict acknowledgement for a revision restore.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/collaboration.ts#L261"><code>packages/core/src/collaboration.ts#L261</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  status: "applied";
  version: number;
  clientMutationId: string;
  snapshot: WorkbookSnapshot;
}
```

</div>
<div class="api-variant">

```ts generated
{
  status: "duplicate";
  version: number;
  clientMutationId: string;
}
```

</div>
<div class="api-variant">

```ts generated
{ status: "conflict"; currentVersion: number }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type RevisionRestoreResponse =
  | {
      status: "applied";
      version: number;
      clientMutationId: string;
      snapshot: WorkbookSnapshot;
    }
  | {
      status: "duplicate";
      version: number;
      clientMutationId: string;
    }
  | {
      status: "conflict";
      currentVersion: number;
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

<p class="api-consumers-label">Public exports naming <code>RevisionRestoreResponse</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/revision-adapter/"><code>RevisionAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/revision-coordinator/"><code>RevisionCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
