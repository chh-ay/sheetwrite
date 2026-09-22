---
title: "PendingCommitStorage | @sheetwrite/core"
description: "Host-owned durable queue."
---
<!-- api-export:@sheetwrite/core|.|PendingCommitStorage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host-owned durable queue. Browser storage lives in the optional `./browser` entrypoint.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L41</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="pending-commit-storage-load" data-pagefind-weight="1" open>
<summary><code>load</code></summary>

<button class="api-copy" type="button" data-copy-code="load(documentId: string, options: PendingCommitLoadOptions): Promise&lt;readonly PendingCommit[]&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
load(documentId: string, options: PendingCommitLoadOptions): Promise<readonly PendingCommit[]>;
```

</details>

<details class="api-member" id="pending-commit-storage-put" data-pagefind-weight="1" open>
<summary><code>put</code></summary>

<button class="api-copy" type="button" data-copy-code="put(commit: PendingCommit, signal?: AbortSignal): Promise&lt;void&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
put(commit: PendingCommit, signal?: AbortSignal): Promise<void>;
```

</details>

<details class="api-member" id="pending-commit-storage-remove" data-pagefind-weight="1" open>
<summary><code>remove</code></summary>

<button class="api-copy" type="button" data-copy-code="remove(documentId: string, clientMutationId: string, signal?: AbortSignal): Promise&lt;void&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
remove(documentId: string, clientMutationId: string, signal?: AbortSignal): Promise<void>;
```

</details>

<details class="api-member" id="pending-commit-storage-replace" data-pagefind-weight="1">
<summary><code>replace</code> <span class="api-member-summary">Atomically replaces one document queue only if its ordered IDs still match the caller's expected view.</span></summary>

<button class="api-copy" type="button" data-copy-code="replace( documentId: string, expectedClientMutationIds: readonly string[], commits: readonly PendingCommit[], signal?: AbortSignal, ): Promise&lt;void&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
replace( documentId: string, expectedClientMutationIds: readonly string[], commits: readonly PendingCommit[], signal?: AbortSignal, ): Promise<void>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface PendingCommitStorage {&#10;  load(&#10;    documentId: string,&#10;    options: PendingCommitLoadOptions,&#10;  ): Promise&lt;readonly PendingCommit[]&gt;;&#10;  put(commit: PendingCommit, signal?: AbortSignal): Promise&lt;void&gt;;&#10;  remove(&#10;    documentId: string,&#10;    clientMutationId: string,&#10;    signal?: AbortSignal,&#10;  ): Promise&lt;void&gt;;&#10;  replace(&#10;    documentId: string,&#10;    expectedClientMutationIds: readonly string[],&#10;    commits: readonly PendingCommit[],&#10;    signal?: AbortSignal,&#10;  ): Promise&lt;void&gt;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface PendingCommitStorage {
  load(
    documentId: string,
    options: PendingCommitLoadOptions,
  ): Promise<readonly PendingCommit[]>;
  put(commit: PendingCommit, signal?: AbortSignal): Promise<void>;
  remove(
    documentId: string,
    clientMutationId: string,
    signal?: AbortSignal,
  ): Promise<void>;
  replace(
    documentId: string,
    expectedClientMutationIds: readonly string[],
    commits: readonly PendingCommit[],
    signal?: AbortSignal,
  ): Promise<void>;
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

<p class="api-consumers-label">Public exports naming <code>PendingCommitStorage</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sync-coordinator-options/"><code>SyncCoordinatorOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-browser/indexed-db-pending-commit-storage/"><code>IndexedDbPendingCommitStorage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
