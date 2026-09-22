---
title: "SyncVersionGapRequest | @sheetwrite/core"
description: "Contiguous-version recovery request produced when remote input skips ahead."
---
<!-- api-export:@sheetwrite/core|.|SyncVersionGapRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Contiguous-version recovery request produced when remote input skips ahead.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L94</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="sync-version-gap-request-document-id" data-pagefind-weight="1" open>
<summary><code>documentId</code></summary>

<button class="api-copy" type="button" data-copy-code="documentId: string;" data-pagefind-ignore>Copy</button>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="sync-version-gap-request-expected-version" data-pagefind-weight="1" open>
<summary><code>expectedVersion</code></summary>

<button class="api-copy" type="button" data-copy-code="expectedVersion: number;" data-pagefind-ignore>Copy</button>

```ts generated
expectedVersion: number;
```

</details>

<details class="api-member" id="sync-version-gap-request-received-version" data-pagefind-weight="1" open>
<summary><code>receivedVersion</code></summary>

<button class="api-copy" type="button" data-copy-code="receivedVersion: number;" data-pagefind-ignore>Copy</button>

```ts generated
receivedVersion: number;
```

</details>

<details class="api-member" id="sync-version-gap-request-signal" data-pagefind-weight="1" open>
<summary><code>signal</code></summary>

<button class="api-copy" type="button" data-copy-code="signal: AbortSignal;" data-pagefind-ignore>Copy</button>

```ts generated
signal: AbortSignal;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SyncVersionGapRequest {&#10;  documentId: string;&#10;  expectedVersion: number;&#10;  receivedVersion: number;&#10;  signal: AbortSignal;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SyncVersionGapRequest {
  documentId: string;
  expectedVersion: number;
  receivedVersion: number;
  signal: AbortSignal;
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

<p class="api-consumers-label">Public exports naming <code>SyncVersionGapRequest</code></p>

<ul class="api-consumer-list">
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
