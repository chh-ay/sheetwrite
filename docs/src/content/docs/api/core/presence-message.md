---
title: "PresenceMessage | @sheetwrite/core"
description: "Ephemeral collaborator selection and activity update."
---
<!-- api-export:@sheetwrite/core|.|PresenceMessage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Ephemeral collaborator selection and activity update.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L15</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="presence-message-actor" data-pagefind-weight="1" open>
<summary><code>actor</code></summary>

<button class="api-copy" type="button" data-copy-code="actor: PresenceActor;" data-pagefind-ignore>Copy</button>

```ts generated
actor: PresenceActor;
```

</details>

<details class="api-member" id="presence-message-active-sheet" data-pagefind-weight="1" open>
<summary><code>activeSheet</code></summary>

<button class="api-copy" type="button" data-copy-code="activeSheet: string;" data-pagefind-ignore>Copy</button>

```ts generated
activeSheet: string;
```

</details>

<details class="api-member" id="presence-message-selections" data-pagefind-weight="1" open>
<summary><code>selections</code></summary>

<button class="api-copy" type="button" data-copy-code="selections: readonly Range[];" data-pagefind-ignore>Copy</button>

```ts generated
selections: readonly Range[];
```

</details>

<details class="api-member" id="presence-message-sent-at" data-pagefind-weight="1" open>
<summary><code>sentAt</code></summary>

<button class="api-copy" type="button" data-copy-code="sentAt: number;" data-pagefind-ignore>Copy</button>

```ts generated
sentAt: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface PresenceMessage {&#10;  actor: PresenceActor;&#10;  activeSheet: string;&#10;  selections: readonly Range[];&#10;  sentAt: number;&#10;}" data-pagefind-ignore>Copy</button>

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

<script>
(() => {
  if (window.__sheetwriteApiCopy !== undefined) return;
  window.__sheetwriteApiCopy = true;
  const selectCopy = (text) => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  };
  const copy = (button) => {
    const text = button.dataset.copyCode ?? "";
    const confirm = () => {
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = "Copy"; }, 1400);
    };
    if (navigator.clipboard === undefined) {
      if (selectCopy(text)) confirm();
      return;
    }
    navigator.clipboard.writeText(text).then(confirm, () => {
      if (selectCopy(text)) confirm();
    });
  };
  document.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest(".api-copy") : null;
    if (button !== null) copy(button);
  });
})();
</script>
