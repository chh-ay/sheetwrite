---
title: "PresencePrivacyOptions | @sheetwrite/core"
description: "Controls which ephemeral collaborator details may be transmitted."
---
<!-- api-export:@sheetwrite/core|.|PresencePrivacyOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Controls which ephemeral collaborator details may be transmitted.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L32</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="presence-privacy-options-share-display-name" data-pagefind-weight="1" open>
<summary><code>shareDisplayName</code></summary>

<button class="api-copy" type="button" data-copy-code="shareDisplayName?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
shareDisplayName?: boolean;
```

</details>

<details class="api-member" id="presence-privacy-options-share-selection" data-pagefind-weight="1" open>
<summary><code>shareSelection</code></summary>

<button class="api-copy" type="button" data-copy-code="shareSelection?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
shareSelection?: boolean;
```

</details>

<details class="api-member" id="presence-privacy-options-receive-presence" data-pagefind-weight="1" open>
<summary><code>receivePresence</code></summary>

<button class="api-copy" type="button" data-copy-code="receivePresence?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
receivePresence?: boolean;
```

</details>

<details class="api-member" id="presence-privacy-options-allow-actor" data-pagefind-weight="1" open>
<summary><code>allowActor</code></summary>

<button class="api-copy" type="button" data-copy-code="allowActor?: (actor: Readonly&lt;PresenceActor&gt;) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
allowActor?: (actor: Readonly<PresenceActor>) => boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface PresencePrivacyOptions {&#10;  shareDisplayName?: boolean;&#10;  shareSelection?: boolean;&#10;  receivePresence?: boolean;&#10;  allowActor?: (actor: Readonly&lt;PresenceActor&gt;) =&gt; boolean;&#10;}" data-pagefind-ignore>Copy</button>

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
