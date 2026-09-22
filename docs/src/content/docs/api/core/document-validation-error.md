---
title: "DocumentValidationError | @sheetwrite/core"
description: "Path-qualified validation failure for a document operation."
---
<!-- api-export:@sheetwrite/core|.|DocumentValidationError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Path-qualified validation failure for a document operation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/document-protocol.ts#L215</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="document-validation-error-path" data-pagefind-weight="1" open>
<summary><code>path</code></summary>

<button class="api-copy" type="button" data-copy-code="path: string;" data-pagefind-ignore>Copy</button>

```ts generated
path: string;
```

</details>

<details class="api-member" id="document-validation-error-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

<button class="api-copy" type="button" data-copy-code="code: | &quot;unsupported-schema&quot; | &quot;invalid-value&quot; | &quot;duplicate-id&quot; | &quot;missing-reference&quot; | &quot;out-of-bounds&quot; | &quot;overlapping-merge&quot; | &quot;non-serializable&quot; | &quot;resource-limit&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
code: | "unsupported-schema" | "invalid-value" | "duplicate-id" | "missing-reference" | "out-of-bounds" | "overlapping-merge" | "non-serializable" | "resource-limit";
```

</details>

<details class="api-member" id="document-validation-error-message" data-pagefind-weight="1" open>
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

<button class="api-copy" type="button" data-copy-code="export interface DocumentValidationError {&#10;  path: string;&#10;  code:&#10;    | &quot;unsupported-schema&quot;&#10;    | &quot;invalid-value&quot;&#10;    | &quot;duplicate-id&quot;&#10;    | &quot;missing-reference&quot;&#10;    | &quot;out-of-bounds&quot;&#10;    | &quot;overlapping-merge&quot;&#10;    | &quot;non-serializable&quot;&#10;    | &quot;resource-limit&quot;;&#10;  message: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface DocumentValidationError {
  path: string;
  code:
    | "unsupported-schema"
    | "invalid-value"
    | "duplicate-id"
    | "missing-reference"
    | "out-of-bounds"
    | "overlapping-merge"
    | "non-serializable"
    | "resource-limit";
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

<p class="api-consumers-label">Public exports naming <code>DocumentValidationError</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-validation-result/"><code>DocumentValidationResult</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/snapshot-validation-error/"><code>SnapshotValidationError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
