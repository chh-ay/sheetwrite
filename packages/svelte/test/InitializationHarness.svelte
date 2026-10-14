<script lang="ts">
  import type { Grid } from "@sheetwrite/core";
  import { untrack } from "svelte";
  import type { SheetwriteGridProps } from "../src/props.js";
  import SheetwriteGrid from "../src/Grid.svelte";

  let { initialProps }: { initialProps: SheetwriteGridProps } = $props();
  let source = $state.raw(initialProps.wasmSource);
  let errorHandler = $state.raw(initialProps.onInitializationError);
  let readOnly = $state(initialProps.readOnly);
  let grid: Grid | undefined;
  const publishedAtReady: Array<Grid | undefined> = [];

  export function update(props: SheetwriteGridProps): void {
    source = props.wasmSource;
    errorHandler = props.onInitializationError;
    readOnly = props.readOnly;
  }
  export function updateReadOnly(value: boolean): void { readOnly = value; }
  export function getGrid(): Grid | undefined { return grid; }
  export function getPublishedAtReady(): Array<Grid | undefined> { return publishedAtReady; }
</script>

{#snippet fallback()}<span data-lifecycle-fallback>loading</span>{/snippet}
<SheetwriteGrid workbook={initialProps.workbook} wasmSource={source} {readOnly} renderer="canvas"
  onInitializationError={errorHandler} bind:grid {fallback}
  onReady={(event) => {
    publishedAtReady.push(untrack(() => grid));
    initialProps.onReady?.(event);
  }} />
