---
title: "IndexedDbPendingCommitStorageError | @sheetwrite/core/browser"
description: "Typed IndexedDB failure raised by durable pending-commit storage."
---
<!-- api-export:@sheetwrite/core|./browser|IndexedDbPendingCommitStorageError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-browser/">@sheetwrite/core/browser</a><span class="api-status" data-kind="class">class</span></div>

Typed IndexedDB failure raised by durable pending-commit storage.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/browser</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/indexeddb.ts#L22</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="indexed-db-pending-commit-storage-error-constructor" data-pagefind-weight="1" open>
<summary><code>constructor</code></summary>

<button class="api-copy" type="button" data-copy-code="constructor(code: IndexedDbPendingCommitStorageErrorCode, message: string, options?: ErrorOptions);" data-pagefind-ignore>Copy</button>

```ts generated
constructor(code: IndexedDbPendingCommitStorageErrorCode, message: string, options?: ErrorOptions);
```

</details>

<details class="api-member" id="indexed-db-pending-commit-storage-error-name" data-pagefind-weight="1" open>
<summary><code>name</code></summary>

<button class="api-copy" type="button" data-copy-code="name: &quot;IndexedDbPendingCommitStorageError&quot;" data-pagefind-ignore>Copy</button>

```ts generated
name: "IndexedDbPendingCommitStorageError"
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class IndexedDbPendingCommitStorageError extends SheetwriteError {&#10;  constructor(&#10;    code: IndexedDbPendingCommitStorageErrorCode,&#10;    message: string,&#10;    options?: ErrorOptions,&#10;  );&#10;  name: &quot;IndexedDbPendingCommitStorageError&quot;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
class IndexedDbPendingCommitStorageError extends SheetwriteError {
  constructor(
    code: IndexedDbPendingCommitStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  );
  name: "IndexedDbPendingCommitStorageError";
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

<p class="api-consumers-label">Public exports naming <code>IndexedDbPendingCommitStorageError</code></p>

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
