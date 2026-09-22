---
title: "RevisionRestoreResponse | @sheetwrite/core"
description: "Applied or conflict acknowledgement for a revision restore."
---
<!-- api-export:@sheetwrite/core|.|RevisionRestoreResponse -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Applied or conflict acknowledgement for a revision restore.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L261</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  status: &quot;applied&quot;;&#10;  version: number;&#10;  clientMutationId: string;&#10;  snapshot: WorkbookSnapshot;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  status: "applied";
  version: number;
  clientMutationId: string;
  snapshot: WorkbookSnapshot;
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

<button class="api-copy" type="button" data-copy-code="{ status: &quot;conflict&quot;; currentVersion: number }" data-pagefind-ignore>Copy</button>

```ts generated
{ status: "conflict"; currentVersion: number }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export type RevisionRestoreResponse =&#10;  | {&#10;      status: &quot;applied&quot;;&#10;      version: number;&#10;      clientMutationId: string;&#10;      snapshot: WorkbookSnapshot;&#10;    }&#10;  | {&#10;      status: &quot;duplicate&quot;;&#10;      version: number;&#10;      clientMutationId: string;&#10;    }&#10;  | {&#10;      status: &quot;conflict&quot;;&#10;      currentVersion: number;&#10;    };" data-pagefind-ignore>Copy</button>

```ts generated
export type RevisionRestoreResponse =
  | {
      status: "applied";
      version: number;
      clientMutationId: string;
      snapshot: WorkbookSnapshot;
    }
  | {
      status: "duplicate";
      version: number;
      clientMutationId: string;
    }
  | {
      status: "conflict";
      currentVersion: number;
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

<p class="api-consumers-label">Public exports naming <code>RevisionRestoreResponse</code></p>

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
