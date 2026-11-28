<script lang="ts" generics="Row extends Record<string, CellScalar>, Id extends RowBridgeId = RowBridgeId">
import type { CellScalar } from "@sheetwrite/core";
import { assertGridSize, createSimpleGridInput, createSimpleRowBridge } from "@sheetwrite/core/adapter";
import type { RowBridgeId } from "@sheetwrite/core/adapter";
import GridComponent from "./Grid.svelte";
import type { SheetwriteGridProps, SheetwriteProps } from "./props.js";

type Props = SheetwriteProps<Row, Id>;

let {
  columns,
  defaultRows: default_rows,
  sheetName: sheet_name,
  getRowId: get_row_id,
  createRowId: create_row_id,
  grid = $bindable(),
  ...props
}: Props = $props();
let input = $derived(
  createSimpleGridInput({ columns, defaultRows: default_rows, sheetName: sheet_name }),
);
let row_bridge = $derived(
  createSimpleRowBridge({
    columns,
    defaultRows: default_rows,
    ...(get_row_id === undefined ? {} : { getRowId: get_row_id }),
    ...(create_row_id === undefined ? {} : { createRowId: create_row_id }),
  }),
);
let resolved_props = $derived.by(() => {
  assertGridSize({ height: props.height, fill: props.fill });
  const forwarded = { ...props, ...input, rowBridge: row_bridge };
  return forwarded as unknown as SheetwriteGridProps;
});
</script>

<GridComponent {...resolved_props} bind:grid />
