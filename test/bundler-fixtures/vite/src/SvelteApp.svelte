<script lang="ts">
import type { Grid } from "@sheetwrite/core";
import type { GridReadyEvent } from "@sheetwrite/core/adapter";
import { SheetwriteGrid } from "@sheetwrite/svelte";
import wasmUrl from "@sheetwrite/wasm/wasm?url";
import { editReadyGrid, initialData, replacementData, workbook } from "./lifecycle.js";

let { onComplete: on_complete }: { onComplete: (getGrid: () => Grid | undefined) => void } =
  $props();
let data = $state(initialData);
let grid = $state<Grid>();
let ready_count = 0;

function handle_ready(event: GridReadyEvent): void {
  ready_count += 1;
  if (ready_count !== 1 && ready_count !== 2) throw new Error("Unexpected Svelte generation");
  editReadyGrid(event, ready_count);
  if (ready_count === 1) {
    data = replacementData;
    return;
  }
  on_complete(() => grid);
}
</script>

<SheetwriteGrid
  {workbook}
  {data}
  wasmSource={wasmUrl}
  bind:grid
  height={240}
  onReady={handle_ready}
/>
