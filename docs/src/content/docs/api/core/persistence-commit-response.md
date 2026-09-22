---
title: "PersistenceCommitResponse | @sheetwrite/core"
description: "Applied, duplicate, or conflict acknowledgement from persistence."
---
<!-- api-export:@sheetwrite/core|.|PersistenceCommitResponse -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Applied, duplicate, or conflict acknowledgement from persistence. `applied`
confirms the submitted operations unchanged; normalization must conflict.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L112</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  status: &quot;applied&quot;;&#10;  version: number;&#10;  clientMutationId: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  status: "applied";
  version: number;
  clientMutationId: string;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  status: &quot;duplicate&quot;;&#10;  version: number;&#10;  clientMutationId: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  status: "duplicate";
  version: number;
  clientMutationId: string;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  status: &quot;conflict&quot;;&#10;  currentVersion: number;&#10;  operationsSinceBase?: readonly VersionedOperation[];&#10;  snapshot?: WorkbookSnapshot;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  status: "conflict";
  currentVersion: number;
  operationsSinceBase?: readonly VersionedOperation[];
  snapshot?: WorkbookSnapshot;
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export type PersistenceCommitResponse =&#10;  | {&#10;      status: &quot;applied&quot;;&#10;      version: number;&#10;      clientMutationId: string;&#10;    }&#10;  | {&#10;      status: &quot;duplicate&quot;;&#10;      version: number;&#10;      clientMutationId: string;&#10;    }&#10;  | {&#10;      status: &quot;conflict&quot;;&#10;      currentVersion: number;&#10;      operationsSinceBase?: readonly VersionedOperation[];&#10;      snapshot?: WorkbookSnapshot;&#10;    };" data-pagefind-ignore>Copy</button>

```ts generated
export type PersistenceCommitResponse =
  | {
      status: "applied";
      version: number;
      clientMutationId: string;
    }
  | {
      status: "duplicate";
      version: number;
      clientMutationId: string;
    }
  | {
      status: "conflict";
      currentVersion: number;
      operationsSinceBase?: readonly VersionedOperation[];
      snapshot?: WorkbookSnapshot;
    };
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

<p class="api-consumers-label">Public exports naming <code>PersistenceCommitResponse</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/memory-persistence-adapter/"><code>MemoryPersistenceAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/persistence-adapter/"><code>PersistenceAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sync-coordinator/"><code>SyncCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sync-coordinator-event/"><code>SyncCoordinatorEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
