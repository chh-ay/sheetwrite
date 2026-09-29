---
title: "PresenceTransport | @sheetwrite/core"
description: "Host transport contract for ephemeral presence messages."
---
<!-- api-export:@sheetwrite/core|.|PresenceTransport -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host transport contract for ephemeral presence messages.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/collaboration.ts#L23"><code>packages/core/src/collaboration.ts#L23</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="presence-transport-publish" data-pagefind-weight="1">
<summary><code>publish</code></summary>

```ts generated
publish(message: PresenceMessage, signal?: AbortSignal): void | Promise<void>;
```

</details>

<details class="api-member" id="presence-transport-subscribe" data-pagefind-weight="1">
<summary><code>subscribe</code></summary>

```ts generated
subscribe( listener: (message: PresenceMessage) => void, signal?: AbortSignal, ): undefined | (() => void);
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PresenceTransport {
  publish(
    message: PresenceMessage,
    signal?: AbortSignal,
  ): void | Promise<void>;
  subscribe(
    listener: (message: PresenceMessage) => void,
    signal?: AbortSignal,
  ): undefined | (() => void);
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

<p class="api-consumers-label">Public exports naming <code>PresenceTransport</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/presence-coordinator/"><code>PresenceCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
