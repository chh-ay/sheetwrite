---
title: "ProtectionRequest | @sheetwrite/core"
description: "Local operation and protected-range context supplied to the host policy."
---
<!-- api-export:@sheetwrite/core|.|ProtectionRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Local operation and protected-range context supplied to the host policy.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L228</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="protection-request-protected-range" data-pagefind-weight="1" open>
<summary><code>protectedRange</code></summary>

<button class="api-copy" type="button" data-copy-code="protectedRange: Readonly&lt;ProtectedRange&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
protectedRange: Readonly<ProtectedRange>;
```

</details>

<details class="api-member" id="protection-request-operation" data-pagefind-weight="1" open>
<summary><code>operation</code></summary>

<button class="api-copy" type="button" data-copy-code="operation: Readonly&lt;DocumentOp&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
operation: Readonly<DocumentOp>;
```

</details>

<details class="api-member" id="protection-request-commit-reason" data-pagefind-weight="1" open>
<summary><code>commitReason</code></summary>

<button class="api-copy" type="button" data-copy-code="commitReason: CommitReason;" data-pagefind-ignore>Copy</button>

```ts generated
commitReason: CommitReason;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface ProtectionRequest {&#10;  protectedRange: Readonly&lt;ProtectedRange&gt;;&#10;  operation: Readonly&lt;DocumentOp&gt;;&#10;  commitReason: CommitReason;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface ProtectionRequest {
  protectedRange: Readonly<ProtectedRange>;
  operation: Readonly<DocumentOp>;
  commitReason: CommitReason;
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

<p class="api-consumers-label">Public exports naming <code>ProtectionRequest</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/protection-resolver/"><code>ProtectionResolver</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
