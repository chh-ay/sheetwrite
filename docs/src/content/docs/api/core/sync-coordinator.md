---
title: "SyncCoordinator | @sheetwrite/core"
description: "Deterministic, transport-neutral optimistic sync."
---
<!-- api-export:@sheetwrite/core|.|SyncCoordinator -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Deterministic, transport-neutral optimistic sync. Local rendering is never
blocked: changes queue immediately, while hosts explicitly call `sendNext`
or `retry` to perform network work.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L261</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#sync-coordinator-constructor"><code>constructor</code></a>
<a href="#sync-coordinator-apply-versioned-operation"><code>applyVersionedOperation</code></a>
<a href="#sync-coordinator-destroy"><code>destroy</code></a>
<a href="#sync-coordinator-flush"><code>flush</code></a>
<a href="#sync-coordinator-handle-response"><code>handleResponse</code></a>
<a href="#sync-coordinator-on"><code>on</code></a>
<a href="#sync-coordinator-pending-commits"><code>pendingCommits</code></a>
<a href="#sync-coordinator-pending-count"><code>pendingCount</code></a>
<a href="#sync-coordinator-ready"><code>ready</code></a>
<a href="#sync-coordinator-resume-after-reload"><code>resumeAfterReload</code></a>
<a href="#sync-coordinator-retry"><code>retry</code></a>
<a href="#sync-coordinator-retry-persistence"><code>retryPersistence</code></a>
<a href="#sync-coordinator-send"><code>send</code></a>
<a href="#sync-coordinator-send-next"><code>sendNext</code></a>
<a href="#sync-coordinator-server-version"><code>serverVersion</code></a>
<a href="#sync-coordinator-set-online"><code>setOnline</code></a>
<a href="#sync-coordinator-state"><code>state</code></a>
<a href="#sync-coordinator-subscribe"><code>subscribe</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>18</span>

<div class="api-member-list">

<details class="api-member" id="sync-coordinator-constructor" data-pagefind-weight="1" open>
<summary><code>constructor</code></summary>

<button class="api-copy" type="button" data-copy-code="constructor(grid: Grid, adapter: PersistenceAdapter, options: SyncCoordinatorOptions);" data-pagefind-ignore>Copy</button>

```ts generated
constructor(grid: Grid, adapter: PersistenceAdapter, options: SyncCoordinatorOptions);
```

</details>

<details class="api-member" id="sync-coordinator-apply-versioned-operation" data-pagefind-weight="1" open>
<summary><code>applyVersionedOperation</code></summary>

<button class="api-copy" type="button" data-copy-code="applyVersionedOperation: (operation: VersionedOperation) =&gt; Promise&lt;void&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
applyVersionedOperation: (operation: VersionedOperation) => Promise<void>;
```

</details>

<details class="api-member" id="sync-coordinator-destroy" data-pagefind-weight="1" open>
<summary><code>destroy</code></summary>

<button class="api-copy" type="button" data-copy-code="destroy: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
destroy: () => void;
```

</details>

<details class="api-member" id="sync-coordinator-flush" data-pagefind-weight="1" open>
<summary><code>flush</code></summary>

<button class="api-copy" type="button" data-copy-code="flush: () =&gt; Promise&lt;readonly PersistenceCommitResponse[]&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
flush: () => Promise<readonly PersistenceCommitResponse[]>;
```

</details>

<details class="api-member" id="sync-coordinator-handle-response" data-pagefind-weight="1">
<summary><code>handleResponse</code> <span class="api-member-summary">Public for transports that deliver responses independently of send promises.</span></summary>

<button class="api-copy" type="button" data-copy-code="handleResponse: (response: PersistenceCommitResponse, requestedMutationId?: string) =&gt; Promise&lt;void&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
handleResponse: (response: PersistenceCommitResponse, requestedMutationId?: string) => Promise<void>;
```

</details>

<details class="api-member" id="sync-coordinator-on" data-pagefind-weight="1" open>
<summary><code>on</code></summary>

<button class="api-copy" type="button" data-copy-code="on: (listener: SyncListener) =&gt; () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
on: (listener: SyncListener) => () => void;
```

</details>

<details class="api-member" id="sync-coordinator-pending-commits" data-pagefind-weight="1" open>
<summary><code>pendingCommits</code></summary>

<button class="api-copy" type="button" data-copy-code="pendingCommits: () =&gt; readonly SyncMutationRecord[];" data-pagefind-ignore>Copy</button>

```ts generated
pendingCommits: () => readonly SyncMutationRecord[];
```

</details>

<details class="api-member" id="sync-coordinator-pending-count" data-pagefind-weight="1" open>
<summary><code>pendingCount</code></summary>

<button class="api-copy" type="button" data-copy-code="pendingCount: number;" data-pagefind-ignore>Copy</button>

```ts generated
pendingCount: number;
```

</details>

<details class="api-member" id="sync-coordinator-ready" data-pagefind-weight="1" open>
<summary><code>ready</code> <span class="api-member-summary">Resolves after durable work is restored and every startup commit is visible locally.</span></summary>

<button class="api-copy" type="button" data-copy-code="ready: () =&gt; Promise&lt;void&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
ready: () => Promise<void>;
```

</details>

<details class="api-member" id="sync-coordinator-resume-after-reload" data-pagefind-weight="1" open>
<summary><code>resumeAfterReload</code> <span class="api-member-summary">Resume only after the host remounted/reloaded document state and reapplied retained local operations.</span></summary>

<button class="api-copy" type="button" data-copy-code="resumeAfterReload: (snapshot: WorkbookSnapshot) =&gt; Promise&lt;void&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
resumeAfterReload: (snapshot: WorkbookSnapshot) => Promise<void>;
```

<p class="api-member-doc">Resume only after the host remounted/reloaded document state and reapplied
retained local operations. No lossy structural merge is attempted here.</p>
</details>

<details class="api-member" id="sync-coordinator-retry" data-pagefind-weight="1" open>
<summary><code>retry</code> <span class="api-member-summary">Explicit retry; the original mutation ID and durable record are retained.</span></summary>

<button class="api-copy" type="button" data-copy-code="retry: (clientMutationId: string) =&gt; Promise&lt;PersistenceCommitResponse | null&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
retry: (clientMutationId: string) => Promise<PersistenceCommitResponse | null>;
```

</details>

<details class="api-member" id="sync-coordinator-retry-persistence" data-pagefind-weight="1" open>
<summary><code>retryPersistence</code></summary>

<button class="api-copy" type="button" data-copy-code="retryPersistence: (clientMutationId: string) =&gt; Promise&lt;boolean&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
retryPersistence: (clientMutationId: string) => Promise<boolean>;
```

</details>

<details class="api-member" id="sync-coordinator-send" data-pagefind-weight="1" open>
<summary><code>send</code></summary>

<button class="api-copy" type="button" data-copy-code="send: (clientMutationId: string) =&gt; Promise&lt;PersistenceCommitResponse | null&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
send: (clientMutationId: string) => Promise<PersistenceCommitResponse | null>;
```

</details>

<details class="api-member" id="sync-coordinator-send-next" data-pagefind-weight="1" open>
<summary><code>sendNext</code></summary>

<button class="api-copy" type="button" data-copy-code="sendNext: () =&gt; Promise&lt;PersistenceCommitResponse | null&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
sendNext: () => Promise<PersistenceCommitResponse | null>;
```

</details>

<details class="api-member" id="sync-coordinator-server-version" data-pagefind-weight="1" open>
<summary><code>serverVersion</code></summary>

<button class="api-copy" type="button" data-copy-code="serverVersion: number;" data-pagefind-ignore>Copy</button>

```ts generated
serverVersion: number;
```

</details>

<details class="api-member" id="sync-coordinator-set-online" data-pagefind-weight="1" open>
<summary><code>setOnline</code> <span class="api-member-summary">Update connectivity. Reconnection drains durable work in order; going offline aborts in-flight requests so retries retain their mutation IDs.</span></summary>

<button class="api-copy" type="button" data-copy-code="setOnline: (online: boolean) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
setOnline: (online: boolean) => void;
```

</details>

<details class="api-member" id="sync-coordinator-state" data-pagefind-weight="1" open>
<summary><code>state</code></summary>

<button class="api-copy" type="button" data-copy-code="state: SyncStateSnapshot;" data-pagefind-ignore>Copy</button>

```ts generated
state: SyncStateSnapshot;
```

</details>

<details class="api-member" id="sync-coordinator-subscribe" data-pagefind-weight="1" open>
<summary><code>subscribe</code></summary>

<button class="api-copy" type="button" data-copy-code="subscribe: (source: RemoteOperationSource | AsyncIterable&lt;VersionedOperation&gt;) =&gt; () =&gt; void" data-pagefind-ignore>Copy</button>

```ts generated
subscribe: (source: RemoteOperationSource | AsyncIterable<VersionedOperation>) => () => void
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class SyncCoordinator {&#10;  constructor(&#10;    grid: Grid,&#10;    adapter: PersistenceAdapter,&#10;    options: SyncCoordinatorOptions,&#10;  );&#10;  applyVersionedOperation: (operation: VersionedOperation) =&gt; Promise&lt;void&gt;;&#10;  destroy: () =&gt; void;&#10;  flush: () =&gt; Promise&lt;readonly PersistenceCommitResponse[]&gt;;&#10;  handleResponse: (&#10;    response: PersistenceCommitResponse,&#10;    requestedMutationId?: string,&#10;  ) =&gt; Promise&lt;void&gt;;&#10;  on: (listener: SyncListener) =&gt; () =&gt; void;&#10;  pendingCommits: () =&gt; readonly SyncMutationRecord[];&#10;  pendingCount: number;&#10;  ready: () =&gt; Promise&lt;void&gt;;&#10;  resumeAfterReload: (snapshot: WorkbookSnapshot) =&gt; Promise&lt;void&gt;;&#10;  retry: (&#10;    clientMutationId: string,&#10;  ) =&gt; Promise&lt;PersistenceCommitResponse | null&gt;;&#10;  retryPersistence: (clientMutationId: string) =&gt; Promise&lt;boolean&gt;;&#10;  send: (&#10;    clientMutationId: string,&#10;  ) =&gt; Promise&lt;PersistenceCommitResponse | null&gt;;&#10;  sendNext: () =&gt; Promise&lt;PersistenceCommitResponse | null&gt;;&#10;  serverVersion: number;&#10;  setOnline: (online: boolean) =&gt; void;&#10;  state: SyncStateSnapshot;&#10;  subscribe: (&#10;    source: RemoteOperationSource | AsyncIterable&lt;VersionedOperation&gt;,&#10;  ) =&gt; () =&gt; void;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
class SyncCoordinator {
  constructor(
    grid: Grid,
    adapter: PersistenceAdapter,
    options: SyncCoordinatorOptions,
  );
  applyVersionedOperation: (operation: VersionedOperation) => Promise<void>;
  destroy: () => void;
  flush: () => Promise<readonly PersistenceCommitResponse[]>;
  handleResponse: (
    response: PersistenceCommitResponse,
    requestedMutationId?: string,
  ) => Promise<void>;
  on: (listener: SyncListener) => () => void;
  pendingCommits: () => readonly SyncMutationRecord[];
  pendingCount: number;
  ready: () => Promise<void>;
  resumeAfterReload: (snapshot: WorkbookSnapshot) => Promise<void>;
  retry: (
    clientMutationId: string,
  ) => Promise<PersistenceCommitResponse | null>;
  retryPersistence: (clientMutationId: string) => Promise<boolean>;
  send: (
    clientMutationId: string,
  ) => Promise<PersistenceCommitResponse | null>;
  sendNext: () => Promise<PersistenceCommitResponse | null>;
  serverVersion: number;
  setOnline: (online: boolean) => void;
  state: SyncStateSnapshot;
  subscribe: (
    source: RemoteOperationSource | AsyncIterable<VersionedOperation>,
  ) => () => void;
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

<p class="api-consumers-label">Public exports naming <code>SyncCoordinator</code></p>

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
