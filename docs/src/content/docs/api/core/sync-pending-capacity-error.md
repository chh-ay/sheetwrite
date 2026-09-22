---
title: "SyncPendingCapacityError | @sheetwrite/core"
description: "Typed local transaction rejection produced when the durable queue cannot reserve capacity."
---
<!-- api-export:@sheetwrite/core|.|SyncPendingCapacityError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Typed local transaction rejection produced when the durable queue cannot reserve capacity.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L188</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="sync-pending-capacity-error-constructor" data-pagefind-weight="1" open>
<summary><code>constructor</code></summary>

<button class="api-copy" type="button" data-copy-code="constructor(issue: Extract&lt;MutationIssue, { kind: &quot;resource-limit&quot;; }&gt;);" data-pagefind-ignore>Copy</button>

```ts generated
constructor(issue: Extract<MutationIssue, { kind: "resource-limit"; }>);
```

</details>

<details class="api-member" id="sync-pending-capacity-error-issue" data-pagefind-weight="1">
<summary><code>issue</code></summary>

<button class="api-copy" type="button" data-copy-code="issue: { kind: &quot;resource-limit&quot;; severity: &quot;error&quot;; resource: &quot;operations&quot; | &quot;encoded-bytes&quot; | &quot;pending-commits&quot; | &quot;pending-operations&quot; | &quot;pending-encoded-bytes&quot; | &quot;paged-dirty-cells&quot; | &quot;paged-reference-simulation&quot;; actual: number; max: number; message: string; };" data-pagefind-ignore>Copy</button>

```ts generated
issue: { kind: "resource-limit"; severity: "error"; resource: "operations" | "encoded-bytes" | "pending-commits" | "pending-operations" | "pending-encoded-bytes" | "paged-dirty-cells" | "paged-reference-simulation"; actual: number; max: number; message: string; };
```

</details>

<details class="api-member" id="sync-pending-capacity-error-name" data-pagefind-weight="1" open>
<summary><code>name</code></summary>

<button class="api-copy" type="button" data-copy-code="name: &quot;SyncPendingCapacityError&quot;" data-pagefind-ignore>Copy</button>

```ts generated
name: "SyncPendingCapacityError"
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class SyncPendingCapacityError extends SheetwriteError {&#10;  constructor(&#10;    issue: Extract&lt;&#10;      MutationIssue,&#10;      {&#10;        kind: &quot;resource-limit&quot;;&#10;      }&#10;    &gt;,&#10;  );&#10;  issue: {&#10;    kind: &quot;resource-limit&quot;;&#10;    severity: &quot;error&quot;;&#10;    resource:&#10;      | &quot;operations&quot;&#10;      | &quot;encoded-bytes&quot;&#10;      | &quot;pending-commits&quot;&#10;      | &quot;pending-operations&quot;&#10;      | &quot;pending-encoded-bytes&quot;&#10;      | &quot;paged-dirty-cells&quot;&#10;      | &quot;paged-reference-simulation&quot;;&#10;    actual: number;&#10;    max: number;&#10;    message: string;&#10;  };&#10;  name: &quot;SyncPendingCapacityError&quot;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
class SyncPendingCapacityError extends SheetwriteError {
  constructor(
    issue: Extract<
      MutationIssue,
      {
        kind: "resource-limit";
      }
    >,
  );
  issue: {
    kind: "resource-limit";
    severity: "error";
    resource:
      | "operations"
      | "encoded-bytes"
      | "pending-commits"
      | "pending-operations"
      | "pending-encoded-bytes"
      | "paged-dirty-cells"
      | "paged-reference-simulation";
    actual: number;
    max: number;
    message: string;
  };
  name: "SyncPendingCapacityError";
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

<p class="api-consumers-label">Public exports naming <code>SyncPendingCapacityError</code></p>

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
