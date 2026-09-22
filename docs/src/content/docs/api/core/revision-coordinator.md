---
title: "RevisionCoordinator | @sheetwrite/core"
description: "Coordinates listing and restoring host-owned workbook revisions."
---
<!-- api-export:@sheetwrite/core|.|RevisionCoordinator -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Coordinates listing and restoring host-owned workbook revisions.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L295</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#revision-coordinator-constructor"><code>constructor</code></a>
<a href="#revision-coordinator-destroy"><code>destroy</code></a>
<a href="#revision-coordinator-list"><code>list</code></a>
<a href="#revision-coordinator-on"><code>on</code></a>
<a href="#revision-coordinator-preview"><code>preview</code></a>
<a href="#revision-coordinator-restore"><code>restore</code></a>
<a href="#revision-coordinator-server-version"><code>serverVersion</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="revision-coordinator-constructor" data-pagefind-weight="1" open>
<summary><code>constructor</code></summary>

<button class="api-copy" type="button" data-copy-code="constructor(adapter: RevisionAdapter, options: RevisionCoordinatorOptions);" data-pagefind-ignore>Copy</button>

```ts generated
constructor(adapter: RevisionAdapter, options: RevisionCoordinatorOptions);
```

</details>

<details class="api-member" id="revision-coordinator-destroy" data-pagefind-weight="1" open>
<summary><code>destroy</code></summary>

<button class="api-copy" type="button" data-copy-code="destroy: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
destroy: () => void;
```

</details>

<details class="api-member" id="revision-coordinator-list" data-pagefind-weight="1" open>
<summary><code>list</code></summary>

<button class="api-copy" type="button" data-copy-code="list: () =&gt; Promise&lt;readonly RevisionSummary[]&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
list: () => Promise<readonly RevisionSummary[]>;
```

</details>

<details class="api-member" id="revision-coordinator-on" data-pagefind-weight="1" open>
<summary><code>on</code></summary>

<button class="api-copy" type="button" data-copy-code="on: (listener: RevisionListener) =&gt; () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
on: (listener: RevisionListener) => () => void;
```

</details>

<details class="api-member" id="revision-coordinator-preview" data-pagefind-weight="1" open>
<summary><code>preview</code></summary>

<button class="api-copy" type="button" data-copy-code="preview: (host: HTMLElement, version: number, options?: SnapshotGridOptions) =&gt; Promise&lt;Grid&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
preview: (host: HTMLElement, version: number, options?: SnapshotGridOptions) => Promise<Grid>;
```

</details>

<details class="api-member" id="revision-coordinator-restore" data-pagefind-weight="1" open>
<summary><code>restore</code></summary>

<button class="api-copy" type="button" data-copy-code="restore: (targetVersion: number, clientMutationId: string) =&gt; Promise&lt;RevisionRestoreResponse&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
restore: (targetVersion: number, clientMutationId: string) => Promise<RevisionRestoreResponse>;
```

</details>

<details class="api-member" id="revision-coordinator-server-version" data-pagefind-weight="1" open>
<summary><code>serverVersion</code></summary>

<button class="api-copy" type="button" data-copy-code="serverVersion: number" data-pagefind-ignore>Copy</button>

```ts generated
serverVersion: number
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class RevisionCoordinator {&#10;  constructor(adapter: RevisionAdapter, options: RevisionCoordinatorOptions);&#10;  destroy: () =&gt; void;&#10;  list: () =&gt; Promise&lt;readonly RevisionSummary[]&gt;;&#10;  on: (listener: RevisionListener) =&gt; () =&gt; void;&#10;  preview: (&#10;    host: HTMLElement,&#10;    version: number,&#10;    options?: SnapshotGridOptions,&#10;  ) =&gt; Promise&lt;Grid&gt;;&#10;  restore: (&#10;    targetVersion: number,&#10;    clientMutationId: string,&#10;  ) =&gt; Promise&lt;RevisionRestoreResponse&gt;;&#10;  serverVersion: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
class RevisionCoordinator {
  constructor(adapter: RevisionAdapter, options: RevisionCoordinatorOptions);
  destroy: () => void;
  list: () => Promise<readonly RevisionSummary[]>;
  on: (listener: RevisionListener) => () => void;
  preview: (
    host: HTMLElement,
    version: number,
    options?: SnapshotGridOptions,
  ) => Promise<Grid>;
  restore: (
    targetVersion: number,
    clientMutationId: string,
  ) => Promise<RevisionRestoreResponse>;
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

<p class="api-consumers-label">Public exports naming <code>RevisionCoordinator</code></p>

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
