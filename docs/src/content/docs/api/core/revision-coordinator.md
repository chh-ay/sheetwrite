---
title: "RevisionCoordinator | @sheetwrite/core"
description: "Coordinates listing and restoring host-owned workbook revisions."
---
<!-- api-export:@sheetwrite/core|.|RevisionCoordinator -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Coordinates listing and restoring host-owned workbook revisions.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/collaboration.ts#L295"><code>packages/core/src/collaboration.ts#L295</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#revision-coordinator-constructor"><code>constructor</code></a>
<a href="#revision-coordinator-destroy"><code>destroy</code></a>
<a href="#revision-coordinator-list"><code>list</code></a>
<a href="#revision-coordinator-on"><code>on</code></a>
<a href="#revision-coordinator-preview"><code>preview</code></a>
<a href="#revision-coordinator-restore"><code>restore</code></a>
<a href="#revision-coordinator-server-version"><code>serverVersion</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="revision-coordinator-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(adapter: RevisionAdapter, options: RevisionCoordinatorOptions);
```

</details>

<details class="api-member" id="revision-coordinator-destroy" data-pagefind-weight="1">
<summary><code>destroy</code></summary>

```ts generated
destroy: () => void;
```

</details>

<details class="api-member" id="revision-coordinator-list" data-pagefind-weight="1">
<summary><code>list</code></summary>

```ts generated
list: () => Promise<readonly RevisionSummary[]>;
```

</details>

<details class="api-member" id="revision-coordinator-on" data-pagefind-weight="1">
<summary><code>on</code></summary>

```ts generated
on: (listener: RevisionListener) => () => void;
```

</details>

<details class="api-member" id="revision-coordinator-preview" data-pagefind-weight="1">
<summary><code>preview</code></summary>

```ts generated
preview: (host: HTMLElement, version: number, options?: SnapshotGridOptions) => Promise<Grid>;
```

</details>

<details class="api-member" id="revision-coordinator-restore" data-pagefind-weight="1">
<summary><code>restore</code></summary>

```ts generated
restore: (targetVersion: number, clientMutationId: string) => Promise<RevisionRestoreResponse>;
```

</details>

<details class="api-member" id="revision-coordinator-server-version" data-pagefind-weight="1">
<summary><code>serverVersion</code></summary>

```ts generated
serverVersion: number
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class RevisionCoordinator {
  constructor(adapter: RevisionAdapter, options: RevisionCoordinatorOptions);
  destroy: () => void;
  list: () => Promise<readonly RevisionSummary[]>;
  on: (listener: RevisionListener) => () => void;
  preview: (
    host: HTMLElement,
    version: number,
    options?: SnapshotGridOptions,
  ) => Promise<Grid>;
  restore: (
    targetVersion: number,
    clientMutationId: string,
  ) => Promise<RevisionRestoreResponse>;
  serverVersion: number;
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

<p class="api-consumers-label">Public exports naming <code>RevisionCoordinator</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
