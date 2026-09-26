---
title: "PresenceOverlay | @sheetwrite/core"
description: "Ephemeral collaborator selection rendered above the grid."
---
<!-- api-export:@sheetwrite/core|.|PresenceOverlay -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Ephemeral collaborator selection rendered above the grid. Presence never
enters document operations, snapshots, dirty state, or undo history.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/coordinates.ts#L39"><code>packages/core/src/types/coordinates.ts#L39</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="presence-overlay-actor-id" data-pagefind-weight="1">
<summary><code>actorId</code></summary>

```ts generated
actorId: string;
```

</details>

<details class="api-member" id="presence-overlay-display-name" data-pagefind-weight="1">
<summary><code>displayName</code></summary>

```ts generated
displayName?: string;
```

</details>

<details class="api-member" id="presence-overlay-color" data-pagefind-weight="1">
<summary><code>color</code></summary>

```ts generated
color: string;
```

</details>

<details class="api-member" id="presence-overlay-active-sheet" data-pagefind-weight="1">
<summary><code>activeSheet</code></summary>

```ts generated
activeSheet: SheetId;
```

</details>

<details class="api-member" id="presence-overlay-ranges" data-pagefind-weight="1">
<summary><code>ranges</code></summary>

```ts generated
ranges: readonly Range[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PresenceOverlay {
  actorId: string;
  displayName?: string;
  color: string;
  activeSheet: SheetId;
  ranges: readonly Range[];
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

<p class="api-consumers-label">Public exports naming <code>PresenceOverlay</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
