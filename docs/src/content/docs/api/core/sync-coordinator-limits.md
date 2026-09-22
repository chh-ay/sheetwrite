---
title: "SyncCoordinatorLimits | @sheetwrite/core"
description: "Resource ceilings applied independently to remote collaboration input and local durability."
---
<!-- api-export:@sheetwrite/core|.|SyncCoordinatorLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Resource ceilings applied independently to remote collaboration input and local durability.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L112</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#sync-coordinator-limits-max-mutation-id-bytes"><code>maxMutationIdBytes</code></a>
<a href="#sync-coordinator-limits-max-operations-per-version"><code>maxOperationsPerVersion</code></a>
<a href="#sync-coordinator-limits-max-version-payload-bytes"><code>maxVersionPayloadBytes</code></a>
<a href="#sync-coordinator-limits-max-future-version-distance"><code>maxFutureVersionDistance</code></a>
<a href="#sync-coordinator-limits-max-buffered-versions"><code>maxBufferedVersions</code></a>
<a href="#sync-coordinator-limits-max-buffered-operations"><code>maxBufferedOperations</code></a>
<a href="#sync-coordinator-limits-max-buffered-bytes"><code>maxBufferedBytes</code></a>
<a href="#sync-coordinator-limits-max-recent-acknowledgements"><code>maxRecentAcknowledgements</code></a>
<a href="#sync-coordinator-limits-max-pending-commits"><code>maxPendingCommits</code></a>
<a href="#sync-coordinator-limits-max-pending-operations"><code>maxPendingOperations</code></a>
<a href="#sync-coordinator-limits-max-pending-encoded-bytes"><code>maxPendingEncodedBytes</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>11</span>

<div class="api-member-list">

<details class="api-member" id="sync-coordinator-limits-max-mutation-id-bytes" data-pagefind-weight="1" open>
<summary><code>maxMutationIdBytes</code> <span class="api-member-summary">UTF-8 bytes in a remote or pending mutation ID; defaults to 256.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxMutationIdBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxMutationIdBytes: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-operations-per-version" data-pagefind-weight="1" open>
<summary><code>maxOperationsPerVersion</code> <span class="api-member-summary">Operations accepted in one remote version; defaults to 10,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxOperationsPerVersion: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxOperationsPerVersion: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-version-payload-bytes" data-pagefind-weight="1" open>
<summary><code>maxVersionPayloadBytes</code> <span class="api-member-summary">Encoded operation bytes accepted in one remote version; defaults to 8 MiB.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxVersionPayloadBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxVersionPayloadBytes: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-future-version-distance" data-pagefind-weight="1" open>
<summary><code>maxFutureVersionDistance</code> <span class="api-member-summary">Version distance allowed ahead of the contiguous head; defaults to 1,024.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxFutureVersionDistance: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxFutureVersionDistance: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-buffered-versions" data-pagefind-weight="1" open>
<summary><code>maxBufferedVersions</code> <span class="api-member-summary">Remote future versions retained in the gap buffer; defaults to 256.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxBufferedVersions: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxBufferedVersions: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-buffered-operations" data-pagefind-weight="1" open>
<summary><code>maxBufferedOperations</code> <span class="api-member-summary">Aggregate operations retained in the gap buffer; defaults to 40,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxBufferedOperations: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxBufferedOperations: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-buffered-bytes" data-pagefind-weight="1" open>
<summary><code>maxBufferedBytes</code> <span class="api-member-summary">Aggregate encoded bytes retained in the gap buffer; defaults to 32 MiB.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxBufferedBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxBufferedBytes: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-recent-acknowledgements" data-pagefind-weight="1" open>
<summary><code>maxRecentAcknowledgements</code> <span class="api-member-summary">Recently acknowledged mutation IDs retained for echo deduplication; defaults to 4,096.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxRecentAcknowledgements: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxRecentAcknowledgements: number;
```

<p class="api-member-doc">Recently acknowledged mutation IDs retained for echo deduplication;
defaults to 4,096. Once an ID expires, a stale operation carrying it is a
reload-requiring protocol violation and its operations are never reapplied.</p>
</details>

<details class="api-member" id="sync-coordinator-limits-max-pending-commits" data-pagefind-weight="1" open>
<summary><code>maxPendingCommits</code> <span class="api-member-summary">Pending local commits, including synchronous reservations; defaults to 10,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxPendingCommits: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxPendingCommits: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-pending-operations" data-pagefind-weight="1" open>
<summary><code>maxPendingOperations</code> <span class="api-member-summary">Aggregate DocumentOp count across pending commits; defaults to 100,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxPendingOperations: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxPendingOperations: number;
```

</details>

<details class="api-member" id="sync-coordinator-limits-max-pending-encoded-bytes" data-pagefind-weight="1" open>
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

<button class="api-copy" type="button" data-copy-code="export interface SyncCoordinatorLimits {&#10;  maxMutationIdBytes: number;&#10;  maxOperationsPerVersion: number;&#10;  maxVersionPayloadBytes: number;&#10;  maxFutureVersionDistance: number;&#10;  maxBufferedVersions: number;&#10;  maxBufferedOperations: number;&#10;  maxBufferedBytes: number;&#10;  maxRecentAcknowledgements: number;&#10;  maxPendingCommits: number;&#10;  maxPendingOperations: number;&#10;  maxPendingEncodedBytes: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SyncCoordinatorLimits {
  maxMutationIdBytes: number;
  maxOperationsPerVersion: number;
  maxVersionPayloadBytes: number;
  maxFutureVersionDistance: number;
  maxBufferedVersions: number;
  maxBufferedOperations: number;
  maxBufferedBytes: number;
  maxRecentAcknowledgements: number;
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

<p class="api-consumers-label">Public exports naming <code>SyncCoordinatorLimits</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/default-sync-coordinator-limits/"><code>DEFAULT_SYNC_COORDINATOR_LIMITS</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sync-coordinator-options/"><code>SyncCoordinatorOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
