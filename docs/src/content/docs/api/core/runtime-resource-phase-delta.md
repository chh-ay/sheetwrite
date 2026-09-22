---
title: "RuntimeResourcePhaseDelta | @sheetwrite/core"
description: "Owner and runtime deltas between two phases of the same operation."
---
<!-- api-export:@sheetwrite/core|.|RuntimeResourcePhaseDelta -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Owner and runtime deltas between two phases of the same operation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L123</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="runtime-resource-phase-delta-schema-version" data-pagefind-weight="1" open>
<summary><code>schemaVersion</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly schemaVersion: typeof RUNTIME_RESOURCE_SCHEMA_VERSION;" data-pagefind-ignore>Copy</button>

```ts generated
readonly schemaVersion: typeof RUNTIME_RESOURCE_SCHEMA_VERSION;
```

</details>

<details class="api-member" id="runtime-resource-phase-delta-operation" data-pagefind-weight="1" open>
<summary><code>operation</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly operation: RuntimeResourceOperation;" data-pagefind-ignore>Copy</button>

```ts generated
readonly operation: RuntimeResourceOperation;
```

</details>

<details class="api-member" id="runtime-resource-phase-delta-from" data-pagefind-weight="1" open>
<summary><code>from</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly from: RuntimeResourcePhase;" data-pagefind-ignore>Copy</button>

```ts generated
readonly from: RuntimeResourcePhase;
```

</details>

<details class="api-member" id="runtime-resource-phase-delta-to" data-pagefind-weight="1" open>
<summary><code>to</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly to: RuntimeResourcePhase;" data-pagefind-ignore>Copy</button>

```ts generated
readonly to: RuntimeResourcePhase;
```

</details>

<details class="api-member" id="runtime-resource-phase-delta-owners" data-pagefind-weight="1" open>
<summary><code>owners</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly owners: readonly ResourceOwnerDelta[];" data-pagefind-ignore>Copy</button>

```ts generated
readonly owners: readonly ResourceOwnerDelta[];
```

</details>

<details class="api-member" id="runtime-resource-phase-delta-runtime" data-pagefind-weight="1">
<summary><code>runtime</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly runtime: { readonly usedJSHeapSize: number | null; readonly arrayBufferBytes: number | null; readonly externalBytes: number | null; readonly browserBackingStoreBytes: number | null; };" data-pagefind-ignore>Copy</button>

```ts generated
readonly runtime: { readonly usedJSHeapSize: number | null; readonly arrayBufferBytes: number | null; readonly externalBytes: number | null; readonly browserBackingStoreBytes: number | null; };
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface RuntimeResourcePhaseDelta {&#10;  readonly schemaVersion: typeof RUNTIME_RESOURCE_SCHEMA_VERSION;&#10;  readonly operation: RuntimeResourceOperation;&#10;  readonly from: RuntimeResourcePhase;&#10;  readonly to: RuntimeResourcePhase;&#10;  readonly owners: readonly ResourceOwnerDelta[];&#10;  readonly runtime: {&#10;    readonly usedJSHeapSize: number | null;&#10;    readonly arrayBufferBytes: number | null;&#10;    readonly externalBytes: number | null;&#10;    readonly browserBackingStoreBytes: number | null;&#10;  };&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface RuntimeResourcePhaseDelta {
  readonly schemaVersion: typeof RUNTIME_RESOURCE_SCHEMA_VERSION;
  readonly operation: RuntimeResourceOperation;
  readonly from: RuntimeResourcePhase;
  readonly to: RuntimeResourcePhase;
  readonly owners: readonly ResourceOwnerDelta[];
  readonly runtime: {
    readonly usedJSHeapSize: number | null;
    readonly arrayBufferBytes: number | null;
    readonly externalBytes: number | null;
    readonly browserBackingStoreBytes: number | null;
  };
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

<p class="api-consumers-label">Public exports naming <code>RuntimeResourcePhaseDelta</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/diff-runtime-resource-phases/"><code>diffRuntimeResourcePhases</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
