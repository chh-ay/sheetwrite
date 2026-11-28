<script lang="ts">
import { type GridOptions, isSheetwriteReady } from "@sheetwrite/core";
import {
  type AdapterGridInput,
  createAdapterGridController,
  type GridAdapterEventHandlers,
  type GridPublicationAdapter,
  gridSizeStyle,
} from "@sheetwrite/core/adapter";
import { untrack } from "svelte";
import type { SheetwriteGridProps as Props } from "./props.js";

let {
  workbook,
  data,
  datasource,
  datasourceStorage: datasource_storage,
  renderer = "canvas",
  workerUrl: worker_url,
  theme,
  presentation,
  readOnly: read_only,
  protectionResolver: protection_resolver,
  mutationPolicy: mutation_policy,
  transactionResourceLimits: transaction_resource_limits,
  hyperlinkActivation: hyperlink_activation,
  addons,
  renderers,
  editors,
  overscan,
  minColumns: min_columns,
  config,
  wasmSource: wasm_source,
  height,
  fill,
  rowBridge: row_bridge,
  fallback,
  onGridChange: on_grid_change,
  onRowDelta: on_row_delta,
  onSelectionChange: on_selection_change,
  onViewportChange: on_viewport_change,
  onEditBegin: on_edit_begin,
  onEditCommit: on_edit_commit,
  onSearch: on_search,
  onActiveSheetChange: on_active_sheet_change,
  onCommandStateChange: on_command_state_change,
  onMutationRejected: on_mutation_rejected,
  onRendererFallback: on_renderer_fallback,
  onDatasourceError: on_datasource_error,
  onExportError: on_export_error,
  onKeyBindingsChange: on_key_bindings_change,
  onReady: on_ready,
  onInitializationError: on_initialization_error,
  grid = $bindable(),
  ...host_attributes
}: Props = $props();

let host: HTMLDivElement;
let loading = $state(!isSheetwriteReady());

function forward_command_state_change(
  event: Parameters<NonNullable<typeof on_command_state_change>>[0],
): void {
  on_command_state_change?.(event);
}

const handlers: GridAdapterEventHandlers = {
  onGridChange: (event: Parameters<NonNullable<typeof on_grid_change>>[0]) =>
    on_grid_change?.(event),
  onRowDelta: (event: Parameters<NonNullable<typeof on_row_delta>>[0]) => on_row_delta?.(event),
  onSelectionChange: (event: Parameters<NonNullable<typeof on_selection_change>>[0]) =>
    on_selection_change?.(event),
  onViewportChange: (event: Parameters<NonNullable<typeof on_viewport_change>>[0]) =>
    on_viewport_change?.(event),
  onEditBegin: (event: Parameters<NonNullable<typeof on_edit_begin>>[0]) => on_edit_begin?.(event),
  onEditCommit: (event: Parameters<NonNullable<typeof on_edit_commit>>[0]) =>
    on_edit_commit?.(event),
  onSearch: (event: Parameters<NonNullable<typeof on_search>>[0]) => on_search?.(event),
  onActiveSheetChange: (event: Parameters<NonNullable<typeof on_active_sheet_change>>[0]) =>
    on_active_sheet_change?.(event),
  // The controller only subscribes to command state while this is defined, so
  // absence must be visible instead of an always-present wrapper.
  get onCommandStateChange() {
    return on_command_state_change === undefined ? undefined : forward_command_state_change;
  },
  onMutationRejected: (event: Parameters<NonNullable<typeof on_mutation_rejected>>[0]) =>
    on_mutation_rejected?.(event),
  onRendererFallback: (event: Parameters<NonNullable<typeof on_renderer_fallback>>[0]) =>
    on_renderer_fallback?.(event),
  onDatasourceError: (event: Parameters<NonNullable<typeof on_datasource_error>>[0]) =>
    on_datasource_error?.(event),
  onExportError: (event: Parameters<NonNullable<typeof on_export_error>>[0]) =>
    on_export_error?.(event),
  onKeyBindingsChange: (event: Parameters<NonNullable<typeof on_key_bindings_change>>[0]) =>
    on_key_bindings_change?.(event),
  onReady: (event: Parameters<NonNullable<typeof on_ready>>[0]) => on_ready?.(event),
  onInitializationError: (error: Parameters<NonNullable<typeof on_initialization_error>>[0]) =>
    on_initialization_error?.(error),
};

const lifetime = createAdapterGridController(handlers, {
  publish(next_grid) {
    grid = next_grid ?? undefined;
  },
  setInitializationState(state) {
    loading = state !== "ready";
  },
  reportConsumerFailure(thrown) {
    reportError(thrown);
  },
} satisfies GridPublicationAdapter);
let attached = false;
$effect(() => {
  // The props are destructured (with `renderer`'s default) for Svelte's reactivity,
  // so the options are listed here rather than read by `extractGridOptions`;
  // `satisfies` fails the typecheck when a GridOptions key is missing.
  const input: AdapterGridInput = {
    options: {
      workbook, data, datasource, datasourceStorage: datasource_storage, renderer,
      workerUrl: worker_url, presentation, protectionResolver: protection_resolver,
      mutationPolicy: mutation_policy, transactionResourceLimits: transaction_resource_limits,
      hyperlinkActivation: hyperlink_activation, addons, renderers, editors, theme,
      readOnly: read_only, overscan, minColumns: min_columns, config,
    } satisfies Record<keyof GridOptions, unknown>,
    rowBridge: row_bridge,
    wasmSource: wasm_source,
  };
  untrack(() => {
    if (attached) lifetime.update(input);
    else {
      attached = true;
      lifetime.mount(host, input);
    }
  });
});
$effect(() => () => untrack(() => lifetime.unmount()));

let sizing = $derived(gridSizeStyle({ height, fill }));
</script>

<div
  {...host_attributes}
  bind:this={host}
  class={["sheetwrite", host_attributes.class]}
  style:width={sizing.width}
  style:height={sizing.height}
  style:min-height={sizing.minHeight}
>
  {#if loading && fallback}{@render fallback()}{/if}
</div>
