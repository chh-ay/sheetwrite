---
title: "PresenceOverlay | @sheetwrite/core"
description: "Ephemeral collaborator selection rendered above the grid."
---
<!-- api-export:@sheetwrite/core|.|PresenceOverlay -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Ephemeral collaborator selection rendered above the grid. Presence never
enters document operations, snapshots, dirty state, or undo history.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/coordinates.ts#L39</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="presence-overlay-actor-id" data-pagefind-weight="1" open>
<summary><code>actorId</code></summary>

<button class="api-copy" type="button" data-copy-code="actorId: string;" data-pagefind-ignore>Copy</button>

```ts generated
actorId: string;
```

</details>

<details class="api-member" id="presence-overlay-display-name" data-pagefind-weight="1" open>
<summary><code>displayName</code></summary>

<button class="api-copy" type="button" data-copy-code="displayName?: string;" data-pagefind-ignore>Copy</button>

```ts generated
displayName?: string;
```

</details>

<details class="api-member" id="presence-overlay-color" data-pagefind-weight="1" open>
<summary><code>color</code></summary>

<button class="api-copy" type="button" data-copy-code="color: string;" data-pagefind-ignore>Copy</button>

```ts generated
color: string;
```

</details>

<details class="api-member" id="presence-overlay-active-sheet" data-pagefind-weight="1" open>
<summary><code>activeSheet</code></summary>

<button class="api-copy" type="button" data-copy-code="activeSheet: SheetId;" data-pagefind-ignore>Copy</button>

```ts generated
activeSheet: SheetId;
```

</details>

<details class="api-member" id="presence-overlay-ranges" data-pagefind-weight="1" open>
<summary><code>ranges</code></summary>

<button class="api-copy" type="button" data-copy-code="ranges: readonly Range[];" data-pagefind-ignore>Copy</button>

```ts generated
ranges: readonly Range[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface PresenceOverlay {&#10;  actorId: string;&#10;  displayName?: string;&#10;  color: string;&#10;  activeSheet: SheetId;&#10;  ranges: readonly Range[];&#10;}" data-pagefind-ignore>Copy</button>

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
