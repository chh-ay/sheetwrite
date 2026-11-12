<script lang="ts" generics="Row extends Record<string, CellScalar>, Id extends RowBridgeId = RowBridgeId">
import type { CellScalar } from "@sheetwrite/core";
import { assertGridSize, createSimpleGridInput, createSimpleRowBridge } from "@sheetwrite/core/adapter";
import type { RowBridgeId } from "@sheetwrite/core/adapter";
import GridComponent from "./Grid.svelte";
import type { SheetwriteGridProps, SheetwriteProps } from "./props.js";

type Props = SheetwriteProps<Row, Id>;

let {
  columns,
  defaultRows,
  sheetName,
  getRowId,
  createRowId,
  grid = $bindable(),
  ...props
}: Props = $props();
let input = $derived(createSimpleGridInput({ columns, defaultRows, sheetName }));
let rowBridge = $derived(
  createSimpleRowBridge({
    columns,
    defaultRows,
    ...(getRowId === undefined ? {} : { getRowId }),
    ...(createRowId === undefined ? {} : { createRowId }),
  }),
);
let resolvedProps = $derived.by(() => {
  assertGridSize({ height: props.height, fill: props.fill });
  const forwarded = { ...props, ...input, rowBridge };
  return forwarded as unknown as SheetwriteGridProps;
});
</script>

<GridComponent {...resolvedProps} bind:grid />
