---
title: "GridController | @sheetwrite/core/adapter"
description: "The lifecycle handle returned by createGridController: the live grid, a theme passthrough, and a single teardown that detaches every subscription and destroys the grid."
---
<!-- api-export:@sheetwrite/core|./adapter|GridController -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

The lifecycle handle returned by [`createGridController`](/docs/api/core-adapter/create-grid-controller/): the live grid,
a theme passthrough, and a single teardown that detaches every subscription
and destroys the grid.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/grid-controller.ts#L60</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#grid-controller-grid"><code>grid</code></a>
<a href="#grid-controller-set-theme"><code>setTheme</code></a>
<a href="#grid-controller-set-read-only"><code>setReadOnly</code></a>
<a href="#grid-controller-set-config"><code>setConfig</code></a>
<a href="#grid-controller-set-overscan"><code>setOverscan</code></a>
<a href="#grid-controller-set-min-columns"><code>setMinColumns</code></a>
<a href="#grid-controller-destroy"><code>destroy</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="grid-controller-grid" data-pagefind-weight="1" open>
<summary><code>grid</code> <span class="api-member-summary">The imperative core grid this controller owns.</span></summary>

<button class="api-copy" type="button" data-copy-code="readonly grid: Grid;" data-pagefind-ignore>Copy</button>

```ts generated
readonly grid: Grid;
```

</details>

<details class="api-member" id="grid-controller-set-theme" data-pagefind-weight="1" open>
<summary><code>setTheme</code> <span class="api-member-summary">Apply the host's declarative theme prop: option-level replacement via <a href="/docs/api/core/grid/#grid-replace-theme"><code>Grid.replaceTheme</code></a>; undefined restores CSS/default resolution.</span></summary>

<button class="api-copy" type="button" data-copy-code="setTheme(theme: Partial&lt;Theme&gt; | undefined): void;" data-pagefind-ignore>Copy</button>

```ts generated
setTheme(theme: Partial<Theme> | undefined): void;
```

</details>

<details class="api-member" id="grid-controller-set-read-only" data-pagefind-weight="1" open>
<summary><code>setReadOnly</code> <span class="api-member-summary">Update editability without replacing the owned grid.</span></summary>

<button class="api-copy" type="button" data-copy-code="setReadOnly(readOnly: boolean): void;" data-pagefind-ignore>Copy</button>

```ts generated
setReadOnly(readOnly: boolean): void;
```

</details>

<details class="api-member" id="grid-controller-set-config" data-pagefind-weight="1" open>
<summary><code>setConfig</code> <span class="api-member-summary">Update built-in chrome and keyboard configuration without replacing the grid.</span></summary>

<button class="api-copy" type="button" data-copy-code="setConfig(config: GridConfig | undefined): void;" data-pagefind-ignore>Copy</button>

```ts generated
setConfig(config: GridConfig | undefined): void;
```

</details>

<details class="api-member" id="grid-controller-set-overscan" data-pagefind-weight="1" open>
<summary><code>setOverscan</code> <span class="api-member-summary">Live-update the render overscan without replacing the grid; undefined restores the default.</span></summary>

<button class="api-copy" type="button" data-copy-code="setOverscan(overscan: number | undefined): void;" data-pagefind-ignore>Copy</button>

```ts generated
setOverscan(overscan: number | undefined): void;
```

</details>

<details class="api-member" id="grid-controller-set-min-columns" data-pagefind-weight="1" open>
<summary><code>setMinColumns</code> <span class="api-member-summary">Live-update the minimum rendered column count without emitting user edits.</span></summary>

<button class="api-copy" type="button" data-copy-code="setMinColumns(minColumns: number | undefined): void;" data-pagefind-ignore>Copy</button>

```ts generated
setMinColumns(minColumns: number | undefined): void;
```

</details>

<details class="api-member" id="grid-controller-destroy" data-pagefind-weight="1" open>
<summary><code>destroy</code> <span class="api-member-summary">Detach every event subscription and destroy the grid.</span></summary>

<button class="api-copy" type="button" data-copy-code="destroy(): void;" data-pagefind-ignore>Copy</button>

```ts generated
destroy(): void;
```

<p class="api-member-doc">Detach every event subscription and destroy the grid. Call exactly once.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface GridController {&#10;  readonly grid: Grid;&#10;  setTheme(theme: Partial&lt;Theme&gt; | undefined): void;&#10;  setReadOnly(readOnly: boolean): void;&#10;  setConfig(config: GridConfig | undefined): void;&#10;  setOverscan(overscan: number | undefined): void;&#10;  setMinColumns(minColumns: number | undefined): void;&#10;  destroy(): void;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface GridController {
  readonly grid: Grid;
  setTheme(theme: Partial<Theme> | undefined): void;
  setReadOnly(readOnly: boolean): void;
  setConfig(config: GridConfig | undefined): void;
  setOverscan(overscan: number | undefined): void;
  setMinColumns(minColumns: number | undefined): void;
  destroy(): void;
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

<p class="api-consumers-label">Public exports naming <code>GridController</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-adapter/apply-changed-live-grid-options/"><code>applyChangedLiveGridOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/create-grid-controller/"><code>createGridController</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
