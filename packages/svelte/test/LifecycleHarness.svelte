<script lang="ts">
  import type { Grid } from "@sheetwrite/core";
  import { untrack } from "svelte";
  import type { SheetwriteGridProps } from "../src/props.js";
  import SheetwriteGrid from "../src/Grid.svelte";

  type HarnessProps = Omit<SheetwriteGridProps, "fallback" | "grid"> & {
    fallbackLabel: string;
  };

  let { initialProps: initial_props }: { initialProps: HarnessProps } = $props();
  let current_props = $state.raw(initial_props);
  let published_grid: Grid | undefined;
  const published_at_ready: Array<Grid | null | undefined> = [];
  let grid_props = $derived.by(() => {
    const { fallbackLabel: _fallback_label, ...props } = current_props;
    return props;
  });

  export function update(nextProps: HarnessProps): void {
    current_props = nextProps;
  }

  export function getGrid(): Grid | undefined {
    return published_grid;
  }

  export function getPublishedAtReady(): Array<Grid | null | undefined> {
    return published_at_ready;
  }

  function set_grid(value: Grid | undefined): void {
    published_grid = value;
  }

  function handle_ready(event: Parameters<NonNullable<typeof grid_props.onReady>>[0]): void {
    published_at_ready.push(untrack(() => published_grid));
    grid_props.onReady?.(event);
  }
</script>

{#snippet fallback()}
  <span data-lifecycle-fallback>{current_props.fallbackLabel}</span>
{/snippet}

<SheetwriteGrid {...grid_props} bind:grid={getGrid, set_grid} {fallback} onReady={handle_ready} />
