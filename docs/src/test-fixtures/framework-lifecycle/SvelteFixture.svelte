<script lang="ts">
  import type { GridReadyEvent } from "@sheetwrite/core/adapter";
  import { SheetwriteGrid } from "@sheetwrite/svelte";
  import "@sheetwrite/svelte/styles.css";
  import {
    INVALID_WASM_SOURCE,
    LIFECYCLE_DATA,
    LIFECYCLE_RESET_DATA,
    LIFECYCLE_WORKBOOK,
  } from "./fixture.js";

  let wasm_source = $state.raw<Uint8Array | undefined>(INVALID_WASM_SOURCE);
  let data = $state.raw(LIFECYCLE_DATA);
  let mounted = $state(true);
  let status = $state<"loading" | "error" | "ready">("loading");
  let errors = $state(0);
  let ready = $state("");

  function retry(): void {
    status = "loading";
    wasm_source = undefined;
  }

  function reset_input(): void {
    data = LIFECYCLE_RESET_DATA;
  }

  function handle_initialization_error(): void {
    errors += 1;
    status = "error";
  }

  function handle_ready(event: GridReadyEvent): void {
    ready = `${event.generation}:${event.reason}`;
    status = "ready";
  }
</script>

{#snippet fallback()}
  <span data-lifecycle-fallback>Svelte fallback</span>
{/snippet}

<main data-framework-lifecycle="svelte">
  <button type="button" data-lifecycle-retry onclick={retry}>Retry Svelte</button>
  <button type="button" data-lifecycle-reset onclick={reset_input}>Reset Svelte input</button>
  <button type="button" data-lifecycle-unmount onclick={() => (mounted = false)}
    >Unmount Svelte</button
  >
  <output data-lifecycle-status>{status}</output>
  <output data-lifecycle-errors>{errors}</output>
  <output data-lifecycle-ready>{ready}</output>
  {#if mounted}
    <SheetwriteGrid
      workbook={LIFECYCLE_WORKBOOK}
      {data}
      height={320}
      wasmSource={wasm_source}
      {fallback}
      onInitializationError={handle_initialization_error}
      onReady={handle_ready}
    />
  {/if}
</main>
