---
title: "SyncCoordinatorEvent | @sheetwrite/core"
description: "Queue, version, connection, or error transition emitted by synchronization."
---
<!-- api-export:@sheetwrite/core|.|SyncCoordinatorEvent -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Queue, version, connection, or error transition emitted by synchronization.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L217</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>12</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ type: &quot;state&quot;; state: SyncStateSnapshot }" data-pagefind-ignore>Copy</button>

```ts generated
{ type: "state"; state: SyncStateSnapshot }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ type: &quot;restored&quot;; pending: readonly SyncMutationRecord[] }" data-pagefind-ignore>Copy</button>

```ts generated
{ type: "restored"; pending: readonly SyncMutationRecord[] }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ type: &quot;persisting&quot;; mutation: SyncMutationRecord }" data-pagefind-ignore>Copy</button>

```ts generated
{ type: "persisting"; mutation: SyncMutationRecord }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ type: &quot;pending&quot;; mutation: SyncMutationRecord }" data-pagefind-ignore>Copy</button>

```ts generated
{ type: "pending"; mutation: SyncMutationRecord }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ type: &quot;sending&quot;; mutation: SyncMutationRecord }" data-pagefind-ignore>Copy</button>

```ts generated
{ type: "sending"; mutation: SyncMutationRecord }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  type: &quot;acknowledged&quot;;&#10;  clientMutationId: string;&#10;  version: number;&#10;  duplicate: boolean;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  type: "acknowledged";
  clientMutationId: string;
  version: number;
  duplicate: boolean;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  type: &quot;conflict&quot;;&#10;  mutation: SyncMutationRecord;&#10;  response: Extract&lt;PersistenceCommitResponse, { status: &quot;conflict&quot; }&gt;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  type: "conflict";
  mutation: SyncMutationRecord;
  response: Extract<PersistenceCommitResponse, { status: "conflict" }>;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ type: &quot;remote-applied&quot;; operation: VersionedOperation }" data-pagefind-ignore>Copy</button>

```ts generated
{ type: "remote-applied"; operation: VersionedOperation }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  type: &quot;reload-required&quot;;&#10;  expectedVersion: number;&#10;  receivedVersion: number;&#10;  snapshot?: WorkbookSnapshot;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  type: "reload-required";
  expectedVersion: number;
  receivedVersion: number;
  snapshot?: WorkbookSnapshot;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  type: &quot;reloaded&quot;;&#10;  serverVersion: number;&#10;  pending: readonly SyncMutationRecord[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  type: "reloaded";
  serverVersion: number;
  pending: readonly SyncMutationRecord[];
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  type: &quot;storage-error&quot;;&#10;  error: SheetwriteError;&#10;  clientMutationId?: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  type: "storage-error";
  error: SheetwriteError;
  clientMutationId?: string;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  type: &quot;error&quot;;&#10;  error: SheetwriteError;&#10;  clientMutationId?: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  type: "error";
  error: SheetwriteError;
  clientMutationId?: string;
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export type SyncCoordinatorEvent =&#10;  | {&#10;      type: &quot;state&quot;;&#10;      state: SyncStateSnapshot;&#10;    }&#10;  | {&#10;      type: &quot;restored&quot;;&#10;      pending: readonly SyncMutationRecord[];&#10;    }&#10;  | {&#10;      type: &quot;persisting&quot;;&#10;      mutation: SyncMutationRecord;&#10;    }&#10;  | {&#10;      type: &quot;pending&quot;;&#10;      mutation: SyncMutationRecord;&#10;    }&#10;  | {&#10;      type: &quot;sending&quot;;&#10;      mutation: SyncMutationRecord;&#10;    }&#10;  | {&#10;      type: &quot;acknowledged&quot;;&#10;      clientMutationId: string;&#10;      version: number;&#10;      duplicate: boolean;&#10;    }&#10;  | {&#10;      type: &quot;conflict&quot;;&#10;      mutation: SyncMutationRecord;&#10;      response: Extract&lt;&#10;        PersistenceCommitResponse,&#10;        {&#10;          status: &quot;conflict&quot;;&#10;        }&#10;      &gt;;&#10;    }&#10;  | {&#10;      type: &quot;remote-applied&quot;;&#10;      operation: VersionedOperation;&#10;    }&#10;  | {&#10;      type: &quot;reload-required&quot;;&#10;      expectedVersion: number;&#10;      receivedVersion: number;&#10;      snapshot?: WorkbookSnapshot;&#10;    }&#10;  | {&#10;      type: &quot;reloaded&quot;;&#10;      serverVersion: number;&#10;      pending: readonly SyncMutationRecord[];&#10;    }&#10;  | {&#10;      type: &quot;storage-error&quot;;&#10;      error: SheetwriteError;&#10;      clientMutationId?: string;&#10;    }&#10;  | {&#10;      type: &quot;error&quot;;&#10;      error: SheetwriteError;&#10;      clientMutationId?: string;&#10;    };" data-pagefind-ignore>Copy</button>

```ts generated
export type SyncCoordinatorEvent =
  | {
      type: "state";
      state: SyncStateSnapshot;
    }
  | {
      type: "restored";
      pending: readonly SyncMutationRecord[];
    }
  | {
      type: "persisting";
      mutation: SyncMutationRecord;
    }
  | {
      type: "pending";
      mutation: SyncMutationRecord;
    }
  | {
      type: "sending";
      mutation: SyncMutationRecord;
    }
  | {
      type: "acknowledged";
      clientMutationId: string;
      version: number;
      duplicate: boolean;
    }
  | {
      type: "conflict";
      mutation: SyncMutationRecord;
      response: Extract<
        PersistenceCommitResponse,
        {
          status: "conflict";
        }
      >;
    }
  | {
      type: "remote-applied";
      operation: VersionedOperation;
    }
  | {
      type: "reload-required";
      expectedVersion: number;
      receivedVersion: number;
      snapshot?: WorkbookSnapshot;
    }
  | {
      type: "reloaded";
      serverVersion: number;
      pending: readonly SyncMutationRecord[];
    }
  | {
      type: "storage-error";
      error: SheetwriteError;
      clientMutationId?: string;
    }
  | {
      type: "error";
      error: SheetwriteError;
      clientMutationId?: string;
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

<p class="api-consumers-label">Public exports naming <code>SyncCoordinatorEvent</code></p>

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
