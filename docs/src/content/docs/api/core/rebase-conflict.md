---
title: "RebaseConflict | @sheetwrite/core"
description: "Reason and affected operations for an unsafe document rebase."
---
<!-- api-export:@sheetwrite/core|.|RebaseConflict -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Reason and affected operations for an unsafe document rebase.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/rebase.ts#L16</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="rebase-conflict-code" data-pagefind-weight="1" open>
<summary><code>code</code></summary>

<button class="api-copy" type="button" data-copy-code="code: RebaseConflictCode;" data-pagefind-ignore>Copy</button>

```ts generated
code: RebaseConflictCode;
```

</details>

<details class="api-member" id="rebase-conflict-local-operation-index" data-pagefind-weight="1" open>
<summary><code>localOperationIndex</code></summary>

<button class="api-copy" type="button" data-copy-code="localOperationIndex: number;" data-pagefind-ignore>Copy</button>

```ts generated
localOperationIndex: number;
```

</details>

<details class="api-member" id="rebase-conflict-remote-operation-index" data-pagefind-weight="1" open>
<summary><code>remoteOperationIndex</code></summary>

<button class="api-copy" type="button" data-copy-code="remoteOperationIndex: number;" data-pagefind-ignore>Copy</button>

```ts generated
remoteOperationIndex: number;
```

</details>

<details class="api-member" id="rebase-conflict-message" data-pagefind-weight="1" open>
<summary><code>message</code></summary>

<button class="api-copy" type="button" data-copy-code="message: string;" data-pagefind-ignore>Copy</button>

```ts generated
message: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface RebaseConflict {&#10;  code: RebaseConflictCode;&#10;  localOperationIndex: number;&#10;  remoteOperationIndex: number;&#10;  message: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface RebaseConflict {
  code: RebaseConflictCode;
  localOperationIndex: number;
  remoteOperationIndex: number;
  message: string;
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

<p class="api-consumers-label">Public exports naming <code>RebaseConflict</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-rebase-result/"><code>DocumentRebaseResult</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
