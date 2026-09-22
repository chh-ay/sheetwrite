---
title: "SyncStateSnapshot | @sheetwrite/core"
description: "Immutable observable synchronization state."
---
<!-- api-export:@sheetwrite/core|.|SyncStateSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Immutable observable synchronization state.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L78</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#sync-state-snapshot-connection"><code>connection</code></a>
<a href="#sync-state-snapshot-activity"><code>activity</code></a>
<a href="#sync-state-snapshot-pending-count"><code>pendingCount</code></a>
<a href="#sync-state-snapshot-pending-operations"><code>pendingOperations</code></a>
<a href="#sync-state-snapshot-pending-encoded-bytes"><code>pendingEncodedBytes</code></a>
<a href="#sync-state-snapshot-pending-capacity"><code>pendingCapacity</code></a>
<a href="#sync-state-snapshot-server-version"><code>serverVersion</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="sync-state-snapshot-connection" data-pagefind-weight="1" open>
<summary><code>connection</code></summary>

<button class="api-copy" type="button" data-copy-code="connection: SyncConnectionState;" data-pagefind-ignore>Copy</button>

```ts generated
connection: SyncConnectionState;
```

</details>

<details class="api-member" id="sync-state-snapshot-activity" data-pagefind-weight="1" open>
<summary><code>activity</code></summary>

<button class="api-copy" type="button" data-copy-code="activity: SyncActivityState;" data-pagefind-ignore>Copy</button>

```ts generated
activity: SyncActivityState;
```

</details>

<details class="api-member" id="sync-state-snapshot-pending-count" data-pagefind-weight="1" open>
<summary><code>pendingCount</code> <span class="api-member-summary">Pending local commits, including synchronous pre-commit reservations.</span></summary>

<button class="api-copy" type="button" data-copy-code="pendingCount: number;" data-pagefind-ignore>Copy</button>

```ts generated
pendingCount: number;
```

</details>

<details class="api-member" id="sync-state-snapshot-pending-operations" data-pagefind-weight="1" open>
<summary><code>pendingOperations</code> <span class="api-member-summary">Aggregate DocumentOp count, including synchronous pre-commit reservations.</span></summary>

<button class="api-copy" type="button" data-copy-code="pendingOperations: number;" data-pagefind-ignore>Copy</button>

```ts generated
pendingOperations: number;
```

</details>

<details class="api-member" id="sync-state-snapshot-pending-encoded-bytes" data-pagefind-weight="1" open>
<summary><code>pendingEncodedBytes</code> <span class="api-member-summary">Aggregate UTF-8 bytes of pending JSON-encoded operation arrays.</span></summary>

<button class="api-copy" type="button" data-copy-code="pendingEncodedBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
pendingEncodedBytes: number;
```

</details>

<details class="api-member" id="sync-state-snapshot-pending-capacity" data-pagefind-weight="1" open>
<summary><code>pendingCapacity</code> <span class="api-member-summary">Current local transaction admission state.</span></summary>

<button class="api-copy" type="button" data-copy-code="pendingCapacity: SyncPendingCapacityState;" data-pagefind-ignore>Copy</button>

```ts generated
pendingCapacity: SyncPendingCapacityState;
```

</details>

<details class="api-member" id="sync-state-snapshot-server-version" data-pagefind-weight="1" open>
<summary><code>serverVersion</code> <span class="api-member-summary">Last accepted contiguous remote server version.</span></summary>

<button class="api-copy" type="button" data-copy-code="serverVersion: number;" data-pagefind-ignore>Copy</button>

```ts generated
serverVersion: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SyncStateSnapshot {&#10;  connection: SyncConnectionState;&#10;  activity: SyncActivityState;&#10;  pendingCount: number;&#10;  pendingOperations: number;&#10;  pendingEncodedBytes: number;&#10;  pendingCapacity: SyncPendingCapacityState;&#10;  serverVersion: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SyncStateSnapshot {
  connection: SyncConnectionState;
  activity: SyncActivityState;
  pendingCount: number;
  pendingOperations: number;
  pendingEncodedBytes: number;
  pendingCapacity: SyncPendingCapacityState;
  serverVersion: number;
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

<p class="api-consumers-label">Public exports naming <code>SyncStateSnapshot</code></p>

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
