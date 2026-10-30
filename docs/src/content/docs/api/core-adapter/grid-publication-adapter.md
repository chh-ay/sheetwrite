---
title: "GridPublicationAdapter | @sheetwrite/core/adapter"
description: "GridPublicationAdapter interface in @sheetwrite/core/adapter: Inbound hooks implemented by framework adapters for scheduling and imperative-handle publication."
---
<!-- api-export:@sheetwrite/core|./adapter|GridPublicationAdapter -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Inbound hooks implemented by framework adapters for scheduling and imperative-handle publication.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/adapter.ts#L226"><code>packages/core/src/adapter.ts#L226</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="grid-publication-adapter-publish" data-pagefind-weight="1">
<summary><code>publish</code> <span class="api-member-summary">Resolves only after the imperative handle is visible to consumers.</span></summary>

```ts generated
publish(grid: Grid | null): void | Promise<void>;
```

</details>

<details class="api-member" id="grid-publication-adapter-set-initialization-state" data-pagefind-weight="1">
<summary><code>setInitializationState</code></summary>

```ts generated
setInitializationState(state: "loading" | "ready" | "error"): void;
```

</details>

<details class="api-member" id="grid-publication-adapter-report-consumer-failure" data-pagefind-weight="1">
<summary><code>reportConsumerFailure</code> <span class="api-member-summary">Receives asynchronous construction or consumer failures unchanged.</span></summary>

```ts generated
reportConsumerFailure(thrown: unknown): void;
```

<p class="api-member-doc">Receives asynchronous construction or consumer failures unchanged.
The value may be any thrown value, including a SheetwriteError from construction;
it is never reclassified as an initialization error.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface GridPublicationAdapter {
  publish(grid: Grid | null): void | Promise<void>;
  setInitializationState(state: "loading" | "ready" | "error"): void;
  reportConsumerFailure(thrown: unknown): void;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>GridPublicationAdapter</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-adapter/create-adapter-grid-controller/"><code>createAdapterGridController</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
