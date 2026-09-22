---
title: "SyncCoordinatorOptions | @sheetwrite/core"
description: "Document, version, durability, and online options for synchronization."
---
<!-- api-export:@sheetwrite/core|.|SyncCoordinatorOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Document, version, durability, and online options for synchronization.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L199</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#sync-coordinator-options-document-id"><code>documentId</code></a>
<a href="#sync-coordinator-options-server-version"><code>serverVersion</code></a>
<a href="#sync-coordinator-options-create-mutation-id"><code>createMutationId</code></a>
<a href="#sync-coordinator-options-pending-storage"><code>pendingStorage</code></a>
<a href="#sync-coordinator-options-initial-connection"><code>initialConnection</code></a>
<a href="#sync-coordinator-options-recover-version-gap"><code>recoverVersionGap</code></a>
<a href="#sync-coordinator-options-limits"><code>limits</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="sync-coordinator-options-document-id" data-pagefind-weight="1" open>
<summary><code>documentId</code></summary>

<button class="api-copy" type="button" data-copy-code="documentId: string;" data-pagefind-ignore>Copy</button>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="sync-coordinator-options-server-version" data-pagefind-weight="1" open>
<summary><code>serverVersion</code></summary>

<button class="api-copy" type="button" data-copy-code="serverVersion: number;" data-pagefind-ignore>Copy</button>

```ts generated
serverVersion: number;
```

</details>

<details class="api-member" id="sync-coordinator-options-create-mutation-id" data-pagefind-weight="1" open>
<summary><code>createMutationId</code></summary>

<button class="api-copy" type="button" data-copy-code="createMutationId?: () =&gt; string;" data-pagefind-ignore>Copy</button>

```ts generated
createMutationId?: () => string;
```

</details>

<details class="api-member" id="sync-coordinator-options-pending-storage" data-pagefind-weight="1" open>
<summary><code>pendingStorage</code></summary>

<button class="api-copy" type="button" data-copy-code="pendingStorage?: PendingCommitStorage;" data-pagefind-ignore>Copy</button>

```ts generated
pendingStorage?: PendingCommitStorage;
```

</details>

<details class="api-member" id="sync-coordinator-options-initial-connection" data-pagefind-weight="1" open>
<summary><code>initialConnection</code></summary>

<button class="api-copy" type="button" data-copy-code="initialConnection?: &quot;offline&quot; | &quot;online&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
initialConnection?: "offline" | "online";
```

</details>

<details class="api-member" id="sync-coordinator-options-recover-version-gap" data-pagefind-weight="1">
<summary><code>recoverVersionGap</code> <span class="api-member-summary">Optional host recovery hook.</span></summary>

<button class="api-copy" type="button" data-copy-code="recoverVersionGap?: ( request: SyncVersionGapRequest, ) =&gt; Promise&lt;readonly VersionedOperation[] | WorkbookSnapshot&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
recoverVersionGap?: ( request: SyncVersionGapRequest, ) => Promise<readonly VersionedOperation[] | WorkbookSnapshot>;
```

<p class="api-member-doc">Optional host recovery hook. Return the missing ordered operations, or a
snapshot for the host to remount before calling `resumeAfterReload`.</p>
</details>

<details class="api-member" id="sync-coordinator-options-limits" data-pagefind-weight="1" open>
<summary><code>limits</code> <span class="api-member-summary">Positive safe-integer overrides merged over DEFAULTSYNCCOORDINATORLIMITS.</span></summary>

<button class="api-copy" type="button" data-copy-code="limits?: Partial&lt;SyncCoordinatorLimits&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
limits?: Partial<SyncCoordinatorLimits>;
```

<p class="api-member-doc">Positive safe-integer overrides merged over `DEFAULT_SYNC_COORDINATOR_LIMITS`.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SyncCoordinatorOptions {&#10;  documentId: string;&#10;  serverVersion: number;&#10;  createMutationId?: () =&gt; string;&#10;  pendingStorage?: PendingCommitStorage;&#10;  initialConnection?: &quot;offline&quot; | &quot;online&quot;;&#10;  recoverVersionGap?: (&#10;    request: SyncVersionGapRequest,&#10;  ) =&gt; Promise&lt;readonly VersionedOperation[] | WorkbookSnapshot&gt;;&#10;  limits?: Partial&lt;SyncCoordinatorLimits&gt;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SyncCoordinatorOptions {
  documentId: string;
  serverVersion: number;
  createMutationId?: () => string;
  pendingStorage?: PendingCommitStorage;
  initialConnection?: "offline" | "online";
  recoverVersionGap?: (
    request: SyncVersionGapRequest,
  ) => Promise<readonly VersionedOperation[] | WorkbookSnapshot>;
  limits?: Partial<SyncCoordinatorLimits>;
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

<p class="api-consumers-label">Public exports naming <code>SyncCoordinatorOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sync-coordinator/"><code>SyncCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
