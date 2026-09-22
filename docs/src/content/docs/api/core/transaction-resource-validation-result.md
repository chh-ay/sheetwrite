---
title: "TransactionResourceValidationResult | @sheetwrite/core"
description: "Successful byte/count inspection or one structured transaction rejection."
---
<!-- api-export:@sheetwrite/core|.|TransactionResourceValidationResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Successful byte/count inspection or one structured transaction rejection.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/document-protocol.ts#L46</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ ok: true; operationCount: number; encodedBytes: number }" data-pagefind-ignore>Copy</button>

```ts generated
{ ok: true; operationCount: number; encodedBytes: number }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  ok: false;&#10;  issue: Extract&lt;&#10;    MutationIssue,&#10;    { kind: &quot;resource-limit&quot; } | { kind: &quot;invalid-operation&quot; }&#10;  &gt;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  ok: false;
  issue: Extract<
    MutationIssue,
    { kind: "resource-limit" } | { kind: "invalid-operation" }
  >;
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export type TransactionResourceValidationResult =&#10;  | {&#10;      ok: true;&#10;      operationCount: number;&#10;      encodedBytes: number;&#10;    }&#10;  | {&#10;      ok: false;&#10;      issue: Extract&lt;&#10;        MutationIssue,&#10;        | {&#10;            kind: &quot;resource-limit&quot;;&#10;          }&#10;        | {&#10;            kind: &quot;invalid-operation&quot;;&#10;          }&#10;      &gt;;&#10;    };" data-pagefind-ignore>Copy</button>

```ts generated
export type TransactionResourceValidationResult =
  | {
      ok: true;
      operationCount: number;
      encodedBytes: number;
    }
  | {
      ok: false;
      issue: Extract<
        MutationIssue,
        | {
            kind: "resource-limit";
          }
        | {
            kind: "invalid-operation";
          }
      >;
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

<p class="api-consumers-label">Public exports naming <code>TransactionResourceValidationResult</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/validate-transaction-resources/"><code>validateTransactionResources</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
