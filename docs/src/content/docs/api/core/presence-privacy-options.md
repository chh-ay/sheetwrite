---
title: "PresencePrivacyOptions | @sheetwrite/core"
description: "Controls which ephemeral collaborator details may be transmitted."
---
<!-- api-export:@sheetwrite/core|.|PresencePrivacyOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Controls which ephemeral collaborator details may be transmitted.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/collaboration.ts#L32"><code>packages/core/src/collaboration.ts#L32</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="presence-privacy-options-share-display-name" data-pagefind-weight="1">
<summary><code>shareDisplayName</code></summary>

```ts generated
shareDisplayName?: boolean;
```

</details>

<details class="api-member" id="presence-privacy-options-share-selection" data-pagefind-weight="1">
<summary><code>shareSelection</code></summary>

```ts generated
shareSelection?: boolean;
```

</details>

<details class="api-member" id="presence-privacy-options-receive-presence" data-pagefind-weight="1">
<summary><code>receivePresence</code></summary>

```ts generated
receivePresence?: boolean;
```

</details>

<details class="api-member" id="presence-privacy-options-allow-actor" data-pagefind-weight="1">
<summary><code>allowActor</code></summary>

```ts generated
allowActor?: (actor: Readonly<PresenceActor>) => boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PresencePrivacyOptions {
  shareDisplayName?: boolean;
  shareSelection?: boolean;
  receivePresence?: boolean;
  allowActor?: (actor: Readonly<PresenceActor>) => boolean;
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

<p class="api-consumers-label">Public exports naming <code>PresencePrivacyOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/presence-coordinator-options/"><code>PresenceCoordinatorOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
