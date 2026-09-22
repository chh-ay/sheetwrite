---
title: "CellEditorInstance | @sheetwrite/svelte"
description: "Retained lifecycle returned by a custom editor's mount method."
---
<!-- api-export:@sheetwrite/svelte|.|CellEditorInstance -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/svelte/">@sheetwrite/svelte</a><span class="api-status" data-kind="interface">interface</span></div>

Retained lifecycle returned by a custom editor's mount method.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/svelte</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/types/grid.d.ts#L36</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="cell-editor-instance-update" data-pagefind-weight="1" open>
<summary><code>update</code></summary>

<button class="api-copy" type="button" data-copy-code="update(context: CellEditorContext): void;" data-pagefind-ignore>Copy</button>

```ts generated
update(context: CellEditorContext): void;
```

</details>

<details class="api-member" id="cell-editor-instance-reposition" data-pagefind-weight="1" open>
<summary><code>reposition</code></summary>

<button class="api-copy" type="button" data-copy-code="reposition(rect: CellEditorRect): void;" data-pagefind-ignore>Copy</button>

```ts generated
reposition(rect: CellEditorRect): void;
```

</details>

<details class="api-member" id="cell-editor-instance-commit" data-pagefind-weight="1">
<summary><code>commit</code></summary>

<button class="api-copy" type="button" data-copy-code="commit(navigation: CellEditorNavigation): string | undefined | Promise&lt;string | undefined&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
commit(navigation: CellEditorNavigation): string | undefined | Promise<string | undefined>;
```

</details>

<details class="api-member" id="cell-editor-instance-cancel" data-pagefind-weight="1" open>
<summary><code>cancel</code></summary>

<button class="api-copy" type="button" data-copy-code="cancel(): void;" data-pagefind-ignore>Copy</button>

```ts generated
cancel(): void;
```

</details>

<details class="api-member" id="cell-editor-instance-destroy" data-pagefind-weight="1" open>
<summary><code>destroy</code></summary>

<button class="api-copy" type="button" data-copy-code="destroy(): void;" data-pagefind-ignore>Copy</button>

```ts generated
destroy(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface CellEditorInstance {&#10;  update(context: CellEditorContext): void;&#10;  reposition(rect: CellEditorRect): void;&#10;  commit(&#10;    navigation: CellEditorNavigation,&#10;  ): string | undefined | Promise&lt;string | undefined&gt;;&#10;  cancel(): void;&#10;  destroy(): void;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface CellEditorInstance {
  update(context: CellEditorContext): void;
  reposition(rect: CellEditorRect): void;
  commit(
    navigation: CellEditorNavigation,
  ): string | undefined | Promise<string | undefined>;
  cancel(): void;
  destroy(): void;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/svelte</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>CellEditorInstance</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/cell-editor/"><code>CellEditor</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/cell-editor/"><code>CellEditor</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/cell-editor/"><code>CellEditor</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/cell-editor/"><code>CellEditor</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
