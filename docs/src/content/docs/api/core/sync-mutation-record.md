---
title: "SyncMutationRecord | @sheetwrite/core"
description: "Pending commit paired with its current synchronization status."
---
<!-- api-export:@sheetwrite/core|.|SyncMutationRecord -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Pending commit paired with its current synchronization status.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L92</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="sync-mutation-record-status" data-pagefind-weight="1" open>
<summary><code>status</code></summary>

<button class="api-copy" type="button" data-copy-code="status: SyncMutationStatus;" data-pagefind-ignore>Copy</button>

```ts generated
status: SyncMutationStatus;
```

</details>

<details class="api-member" id="sync-mutation-record-document-id" data-pagefind-weight="1" open>
<summary><code>documentId</code></summary>

<button class="api-copy" type="button" data-copy-code="documentId: string;" data-pagefind-ignore>Copy</button>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="sync-mutation-record-base-version" data-pagefind-weight="1" open>
<summary><code>baseVersion</code></summary>

<button class="api-copy" type="button" data-copy-code="baseVersion: number;" data-pagefind-ignore>Copy</button>

```ts generated
baseVersion: number;
```

</details>

<details class="api-member" id="sync-mutation-record-client-mutation-id" data-pagefind-weight="1" open>
<summary><code>clientMutationId</code></summary>

<button class="api-copy" type="button" data-copy-code="clientMutationId: string;" data-pagefind-ignore>Copy</button>

```ts generated
clientMutationId: string;
```

</details>

<details class="api-member" id="sync-mutation-record-operations" data-pagefind-weight="1" open>
<summary><code>operations</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly operations: readonly DocumentOp[];" data-pagefind-ignore>Copy</button>

```ts generated
readonly operations: readonly DocumentOp[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SyncMutationRecord {&#10;  status: SyncMutationStatus;&#10;  documentId: string;&#10;  baseVersion: number;&#10;  clientMutationId: string;&#10;  readonly operations: readonly DocumentOp[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SyncMutationRecord {
  status: SyncMutationStatus;
  documentId: string;
  baseVersion: number;
  clientMutationId: string;
  readonly operations: readonly DocumentOp[];
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

<p class="api-consumers-label">Public exports naming <code>SyncMutationRecord</code></p>

<ul class="api-consumer-list">
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
