---
title: "SnapshotResourceError | @sheetwrite/core"
description: "Stable resource failure raised by direct workbook construction paths."
---
<!-- api-export:@sheetwrite/core|.|SnapshotResourceError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Stable resource failure raised by direct workbook construction paths.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/document-protocol.ts#L194</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="snapshot-resource-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

<button class="api-copy" type="button" data-copy-code="constructor(resource: keyof SnapshotResourceLimits, limit: number, actual: number, options?: ErrorOptions);" data-pagefind-ignore>Copy</button>

```ts generated
constructor(resource: keyof SnapshotResourceLimits, limit: number, actual: number, options?: ErrorOptions);
```

</details>

<details class="api-member" id="snapshot-resource-error-actual" data-pagefind-weight="1" open>
<summary><code>actual</code></summary>

<button class="api-copy" type="button" data-copy-code="actual: number;" data-pagefind-ignore>Copy</button>

```ts generated
actual: number;
```

</details>

<details class="api-member" id="snapshot-resource-error-limit" data-pagefind-weight="1" open>
<summary><code>limit</code></summary>

<button class="api-copy" type="button" data-copy-code="limit: number;" data-pagefind-ignore>Copy</button>

```ts generated
limit: number;
```

</details>

<details class="api-member" id="snapshot-resource-error-name" data-pagefind-weight="1" open>
<summary><code>name</code></summary>

<button class="api-copy" type="button" data-copy-code="name: &quot;SnapshotResourceError&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
name: "SnapshotResourceError";
```

</details>

<details class="api-member" id="snapshot-resource-error-resource" data-pagefind-weight="1" open>
<summary><code>resource</code></summary>

<button class="api-copy" type="button" data-copy-code="resource: keyof SnapshotResourceLimits" data-pagefind-ignore>Copy</button>

```ts generated
resource: keyof SnapshotResourceLimits
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class SnapshotResourceError extends SheetwriteError {&#10;  constructor(&#10;    resource: keyof SnapshotResourceLimits,&#10;    limit: number,&#10;    actual: number,&#10;    options?: ErrorOptions,&#10;  );&#10;  actual: number;&#10;  limit: number;&#10;  name: &quot;SnapshotResourceError&quot;;&#10;  resource: keyof SnapshotResourceLimits;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
class SnapshotResourceError extends SheetwriteError {
  constructor(
    resource: keyof SnapshotResourceLimits,
    limit: number,
    actual: number,
    options?: ErrorOptions,
  );
  actual: number;
  limit: number;
  name: "SnapshotResourceError";
  resource: keyof SnapshotResourceLimits;
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

<p class="api-consumers-label">Public exports naming <code>SnapshotResourceError</code></p>

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
