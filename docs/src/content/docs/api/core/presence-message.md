---
title: "PresenceMessage | @sheetwrite/core"
description: "Ephemeral collaborator selection and activity update."
---
<!-- api-export:@sheetwrite/core|.|PresenceMessage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Ephemeral collaborator selection and activity update.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/collaboration.ts#L15"><code>packages/core/src/collaboration.ts#L15</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="presence-message-actor" data-pagefind-weight="1">
<summary><code>actor</code></summary>

```ts generated
actor: PresenceActor;
```

</details>

<details class="api-member" id="presence-message-active-sheet" data-pagefind-weight="1">
<summary><code>activeSheet</code></summary>

```ts generated
activeSheet: string;
```

</details>

<details class="api-member" id="presence-message-selections" data-pagefind-weight="1">
<summary><code>selections</code></summary>

```ts generated
selections: readonly Range[];
```

</details>

<details class="api-member" id="presence-message-sent-at" data-pagefind-weight="1">
<summary><code>sentAt</code></summary>

```ts generated
sentAt: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PresenceMessage {
  actor: PresenceActor;
  activeSheet: string;
  selections: readonly Range[];
  sentAt: number;
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

<p class="api-consumers-label">Public exports naming <code>PresenceMessage</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/presence-coordinator/"><code>PresenceCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/presence-coordinator-event/"><code>PresenceCoordinatorEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/presence-transport/"><code>PresenceTransport</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
