---
title: "SnapshotValidationError | @sheetwrite/core"
description: "Path-qualified schema failure found while validating an untrusted snapshot."
---
<!-- api-export:@sheetwrite/core|.|SnapshotValidationError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Path-qualified schema failure found while validating an untrusted snapshot.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/document-protocol.ts#L235</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="snapshot-validation-error-constructor" data-pagefind-weight="1" open>
<summary><code>constructor</code></summary>

<button class="api-copy" type="button" data-copy-code="constructor(errors: readonly DocumentValidationError[]);" data-pagefind-ignore>Copy</button>

```ts generated
constructor(errors: readonly DocumentValidationError[]);
```

</details>

<details class="api-member" id="snapshot-validation-error-errors" data-pagefind-weight="1" open>
<summary><code>errors</code></summary>

<button class="api-copy" type="button" data-copy-code="errors: readonly DocumentValidationError[];" data-pagefind-ignore>Copy</button>

```ts generated
errors: readonly DocumentValidationError[];
```

</details>

<details class="api-member" id="snapshot-validation-error-name" data-pagefind-weight="1" open>
<summary><code>name</code></summary>

<button class="api-copy" type="button" data-copy-code="name: &quot;SnapshotValidationError&quot;" data-pagefind-ignore>Copy</button>

```ts generated
name: "SnapshotValidationError"
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class SnapshotValidationError extends SheetwriteError {&#10;  constructor(errors: readonly DocumentValidationError[]);&#10;  errors: readonly DocumentValidationError[];&#10;  name: &quot;SnapshotValidationError&quot;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
class SnapshotValidationError extends SheetwriteError {
  constructor(errors: readonly DocumentValidationError[]);
  errors: readonly DocumentValidationError[];
  name: "SnapshotValidationError";
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

<p class="api-consumers-label">Public exports naming <code>SnapshotValidationError</code></p>

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
