---
title: "MemoryPersistenceAdapter | @sheetwrite/core"
description: "Executable database-neutral reference adapter for tests, demos, and local workflows."
---
<!-- api-export:@sheetwrite/core|.|MemoryPersistenceAdapter -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Executable database-neutral reference adapter for tests, demos, and local workflows.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/persistence.ts#L86</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="memory-persistence-adapter-constructor" data-pagefind-weight="1" open>
<summary><code>constructor</code></summary>

<button class="api-copy" type="button" data-copy-code="constructor(...snapshots: readonly WorkbookSnapshot[]);" data-pagefind-ignore>Copy</button>

```ts generated
constructor(...snapshots: readonly WorkbookSnapshot[]);
```

</details>

<details class="api-member" id="memory-persistence-adapter-commit" data-pagefind-weight="1" open>
<summary><code>commit</code></summary>

<button class="api-copy" type="button" data-copy-code="commit: (request: PersistenceCommitRequest) =&gt; Promise&lt;PersistenceCommitResponse&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
commit: (request: PersistenceCommitRequest) => Promise<PersistenceCommitResponse>;
```

</details>

<details class="api-member" id="memory-persistence-adapter-load" data-pagefind-weight="1" open>
<summary><code>load</code></summary>

<button class="api-copy" type="button" data-copy-code="load: (documentId: string, signal?: AbortSignal) =&gt; Promise&lt;WorkbookSnapshot&gt;" data-pagefind-ignore>Copy</button>

```ts generated
load: (documentId: string, signal?: AbortSignal) => Promise<WorkbookSnapshot>
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class MemoryPersistenceAdapter implements PersistenceAdapter {&#10;  constructor(...snapshots: readonly WorkbookSnapshot[]);&#10;  commit: (&#10;    request: PersistenceCommitRequest,&#10;  ) =&gt; Promise&lt;PersistenceCommitResponse&gt;;&#10;  load: (&#10;    documentId: string,&#10;    signal?: AbortSignal,&#10;  ) =&gt; Promise&lt;WorkbookSnapshot&gt;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
class MemoryPersistenceAdapter implements PersistenceAdapter {
  constructor(...snapshots: readonly WorkbookSnapshot[]);
  commit: (
    request: PersistenceCommitRequest,
  ) => Promise<PersistenceCommitResponse>;
  load: (
    documentId: string,
    signal?: AbortSignal,
  ) => Promise<WorkbookSnapshot>;
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

<p class="api-consumers-label">Public exports naming <code>MemoryPersistenceAdapter</code></p>

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
