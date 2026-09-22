---
title: "SyncPendingQueueLimits | @sheetwrite/core"
description: "Aggregate ceilings for local commits retained until durable acknowledgement."
---
<!-- api-export:@sheetwrite/core|.|SyncPendingQueueLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Aggregate ceilings for local commits retained until durable acknowledgement.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L102</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="sync-pending-queue-limits-max-pending-commits" data-pagefind-weight="1" open>
<summary><code>maxPendingCommits</code> <span class="api-member-summary">Pending local commits, including synchronous reservations; defaults to 10,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxPendingCommits: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxPendingCommits: number;
```

</details>

<details class="api-member" id="sync-pending-queue-limits-max-pending-operations" data-pagefind-weight="1" open>
<summary><code>maxPendingOperations</code> <span class="api-member-summary">Aggregate DocumentOp count across pending commits; defaults to 100,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxPendingOperations: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxPendingOperations: number;
```

</details>

<details class="api-member" id="sync-pending-queue-limits-max-pending-encoded-bytes" data-pagefind-weight="1" open>
<summary><code>maxPendingEncodedBytes</code> <span class="api-member-summary">Aggregate UTF-8 bytes across pending operation arrays; defaults to 128 MiB.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxPendingEncodedBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxPendingEncodedBytes: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SyncPendingQueueLimits {&#10;  maxPendingCommits: number;&#10;  maxPendingOperations: number;&#10;  maxPendingEncodedBytes: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SyncPendingQueueLimits {
  maxPendingCommits: number;
  maxPendingOperations: number;
  maxPendingEncodedBytes: number;
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

<p class="api-consumers-label">Public exports naming <code>SyncPendingQueueLimits</code></p>

<ul class="api-consumer-list">
<li>None.</li>
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
