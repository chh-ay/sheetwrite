---
title: "RevisionAdapter | @sheetwrite/core"
description: "Host persistence contract for revision history and restore."
---
<!-- api-export:@sheetwrite/core|.|RevisionAdapter -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host persistence contract for revision history and restore.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L272</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="revision-adapter-list-revisions" data-pagefind-weight="1" open>
<summary><code>listRevisions</code></summary>

<button class="api-copy" type="button" data-copy-code="listRevisions(documentId: string, signal?: AbortSignal): Promise&lt;readonly RevisionSummary[]&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
listRevisions(documentId: string, signal?: AbortSignal): Promise<readonly RevisionSummary[]>;
```

</details>

<details class="api-member" id="revision-adapter-load-revision" data-pagefind-weight="1" open>
<summary><code>loadRevision</code></summary>

<button class="api-copy" type="button" data-copy-code="loadRevision(documentId: string, version: number, signal?: AbortSignal): Promise&lt;unknown&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
loadRevision(documentId: string, version: number, signal?: AbortSignal): Promise<unknown>;
```

</details>

<details class="api-member" id="revision-adapter-restore-revision" data-pagefind-weight="1" open>
<summary><code>restoreRevision</code> <span class="api-member-summary">Must create a new auditable server version; never rewind storage in place.</span></summary>

<button class="api-copy" type="button" data-copy-code="restoreRevision(request: RevisionRestoreRequest): Promise&lt;RevisionRestoreResponse&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
restoreRevision(request: RevisionRestoreRequest): Promise<RevisionRestoreResponse>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface RevisionAdapter {&#10;  listRevisions(&#10;    documentId: string,&#10;    signal?: AbortSignal,&#10;  ): Promise&lt;readonly RevisionSummary[]&gt;;&#10;  loadRevision(&#10;    documentId: string,&#10;    version: number,&#10;    signal?: AbortSignal,&#10;  ): Promise&lt;unknown&gt;;&#10;  restoreRevision(&#10;    request: RevisionRestoreRequest,&#10;  ): Promise&lt;RevisionRestoreResponse&gt;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface RevisionAdapter {
  listRevisions(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<readonly RevisionSummary[]>;
  loadRevision(
    documentId: string,
    version: number,
    signal?: AbortSignal,
  ): Promise<unknown>;
  restoreRevision(
    request: RevisionRestoreRequest,
  ): Promise<RevisionRestoreResponse>;
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

<p class="api-consumers-label">Public exports naming <code>RevisionAdapter</code></p>

<ul class="api-consumer-list">
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
