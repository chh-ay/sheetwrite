---
title: "DataSourceRequest | @sheetwrite/core"
description: "Cancellable sheet rectangle requested from a DataSource."
---
<!-- api-export:@sheetwrite/core|.|DataSourceRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Cancellable sheet rectangle requested from a DataSource.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L33</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#data-source-request-protocol"><code>protocol</code></a>
<a href="#data-source-request-sheet"><code>sheet</code></a>
<a href="#data-source-request-start"><code>start</code></a>
<a href="#data-source-request-end"><code>end</code></a>
<a href="#data-source-request-columns"><code>columns</code></a>
<a href="#data-source-request-signal"><code>signal</code></a>
<a href="#data-source-request-revision"><code>revision</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="data-source-request-protocol" data-pagefind-weight="1" open>
<summary><code>protocol</code> <span class="api-member-summary">Paging contract version.</span></summary>

<button class="api-copy" type="button" data-copy-code="protocol: 2;" data-pagefind-ignore>Copy</button>

```ts generated
protocol: 2;
```

</details>

<details class="api-member" id="data-source-request-sheet" data-pagefind-weight="1" open>
<summary><code>sheet</code></summary>

<button class="api-copy" type="button" data-copy-code="sheet: SheetId;" data-pagefind-ignore>Copy</button>

```ts generated
sheet: SheetId;
```

</details>

<details class="api-member" id="data-source-request-start" data-pagefind-weight="1" open>
<summary><code>start</code> <span class="api-member-summary">Inclusive row index.</span></summary>

<button class="api-copy" type="button" data-copy-code="start: number;" data-pagefind-ignore>Copy</button>

```ts generated
start: number;
```

</details>

<details class="api-member" id="data-source-request-end" data-pagefind-weight="1" open>
<summary><code>end</code> <span class="api-member-summary">Exclusive row index.</span></summary>

<button class="api-copy" type="button" data-copy-code="end: number;" data-pagefind-ignore>Copy</button>

```ts generated
end: number;
```

</details>

<details class="api-member" id="data-source-request-columns" data-pagefind-weight="1" open>
<summary><code>columns</code> <span class="api-member-summary">Exact visible, frozen, or prefetched column runs required by the Grid.</span></summary>

<button class="api-copy" type="button" data-copy-code="columns: readonly DataSourceColumnBand[];" data-pagefind-ignore>Copy</button>

```ts generated
columns: readonly DataSourceColumnBand[];
```

</details>

<details class="api-member" id="data-source-request-signal" data-pagefind-weight="1" open>
<summary><code>signal</code></summary>

<button class="api-copy" type="button" data-copy-code="signal: AbortSignal;" data-pagefind-ignore>Copy</button>

```ts generated
signal: AbortSignal;
```

</details>

<details class="api-member" id="data-source-request-revision" data-pagefind-weight="1" open>
<summary><code>revision</code></summary>

<button class="api-copy" type="button" data-copy-code="revision: number;" data-pagefind-ignore>Copy</button>

```ts generated
revision: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface DataSourceRequest {&#10;  protocol: 2;&#10;  sheet: SheetId;&#10;  start: number;&#10;  end: number;&#10;  columns: readonly DataSourceColumnBand[];&#10;  signal: AbortSignal;&#10;  revision: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface DataSourceRequest {
  protocol: 2;
  sheet: SheetId;
  start: number;
  end: number;
  columns: readonly DataSourceColumnBand[];
  signal: AbortSignal;
  revision: number;
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

<p class="api-consumers-label">Public exports naming <code>DataSourceRequest</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/data-source/"><code>DataSource</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid-events/"><code>GridEvents</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/legacy-row-loader/"><code>LegacyRowLoader</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
