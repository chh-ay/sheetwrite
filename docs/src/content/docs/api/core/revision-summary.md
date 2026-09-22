---
title: "RevisionSummary | @sheetwrite/core"
description: "Host-provided metadata describing a saved workbook revision."
---
<!-- api-export:@sheetwrite/core|.|RevisionSummary -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host-provided metadata describing a saved workbook revision.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L244</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="revision-summary-version" data-pagefind-weight="1" open>
<summary><code>version</code></summary>

<button class="api-copy" type="button" data-copy-code="version: number;" data-pagefind-ignore>Copy</button>

```ts generated
version: number;
```

</details>

<details class="api-member" id="revision-summary-created-at" data-pagefind-weight="1" open>
<summary><code>createdAt</code></summary>

<button class="api-copy" type="button" data-copy-code="createdAt: string;" data-pagefind-ignore>Copy</button>

```ts generated
createdAt: string;
```

</details>

<details class="api-member" id="revision-summary-actor" data-pagefind-weight="1" open>
<summary><code>actor</code></summary>

<button class="api-copy" type="button" data-copy-code="actor?: PresenceActor;" data-pagefind-ignore>Copy</button>

```ts generated
actor?: PresenceActor;
```

</details>

<details class="api-member" id="revision-summary-label" data-pagefind-weight="1" open>
<summary><code>label</code></summary>

<button class="api-copy" type="button" data-copy-code="label?: string;" data-pagefind-ignore>Copy</button>

```ts generated
label?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface RevisionSummary {&#10;  version: number;&#10;  createdAt: string;&#10;  actor?: PresenceActor;&#10;  label?: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface RevisionSummary {
  version: number;
  createdAt: string;
  actor?: PresenceActor;
  label?: string;
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

<p class="api-consumers-label">Public exports naming <code>RevisionSummary</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/revision-adapter/"><code>RevisionAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/revision-coordinator/"><code>RevisionCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
