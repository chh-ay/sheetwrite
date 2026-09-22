---
title: "PendingCommitLoadOptions | @sheetwrite/core"
description: "Mandatory bounds for one durable pending-commit restore."
---
<!-- api-export:@sheetwrite/core|.|PendingCommitLoadOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Mandatory bounds for one durable pending-commit restore.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L30</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="pending-commit-load-options-signal" data-pagefind-weight="1" open>
<summary><code>signal</code></summary>

<button class="api-copy" type="button" data-copy-code="signal?: AbortSignal;" data-pagefind-ignore>Copy</button>

```ts generated
signal?: AbortSignal;
```

</details>

<details class="api-member" id="pending-commit-load-options-max-records" data-pagefind-weight="1" open>
<summary><code>maxRecords</code> <span class="api-member-summary">Maximum records returned for one document queue.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxRecords: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxRecords: number;
```

</details>

<details class="api-member" id="pending-commit-load-options-max-operations" data-pagefind-weight="1" open>
<summary><code>maxOperations</code> <span class="api-member-summary">Maximum aggregate operation count returned for one document queue.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxOperations: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxOperations: number;
```

</details>

<details class="api-member" id="pending-commit-load-options-max-bytes" data-pagefind-weight="1" open>
<summary><code>maxBytes</code> <span class="api-member-summary">Maximum aggregate UTF-8 bytes of the JSON-encoded operation arrays.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxBytes: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface PendingCommitLoadOptions {&#10;  signal?: AbortSignal;&#10;  maxRecords: number;&#10;  maxOperations: number;&#10;  maxBytes: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface PendingCommitLoadOptions {
  signal?: AbortSignal;
  maxRecords: number;
  maxOperations: number;
  maxBytes: number;
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

<p class="api-consumers-label">Public exports naming <code>PendingCommitLoadOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/pending-commit-storage/"><code>PendingCommitStorage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
