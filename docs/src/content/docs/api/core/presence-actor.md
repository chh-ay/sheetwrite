---
title: "PresenceActor | @sheetwrite/core"
description: "Public collaborator identity attached to presence updates."
---
<!-- api-export:@sheetwrite/core|.|PresenceActor -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Public collaborator identity attached to presence updates.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/collaboration.ts#L8"><code>packages/core/src/collaboration.ts#L8</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="presence-actor-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="presence-actor-display-name" data-pagefind-weight="1">
<summary><code>displayName</code></summary>

```ts generated
displayName?: string;
```

</details>

<details class="api-member" id="presence-actor-color" data-pagefind-weight="1">
<summary><code>color</code></summary>

```ts generated
color?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PresenceActor {
  id: string;
  displayName?: string;
  color?: string;
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

<p class="api-consumers-label">Public exports naming <code>PresenceActor</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/presence-coordinator-options/"><code>PresenceCoordinatorOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/presence-message/"><code>PresenceMessage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/presence-privacy-options/"><code>PresencePrivacyOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/revision-summary/"><code>RevisionSummary</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
