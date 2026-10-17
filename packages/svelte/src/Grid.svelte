<script lang="ts">
import { isSheetwriteReady } from "@sheetwrite/core";
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
  datasourceStorage,
  renderer = "canvas",
  workerUrl,
  theme,
  presentation,
  readOnly,
  protectionResolver,
  mutationPolicy,
  transactionResourceLimits,
  hyperlinkActivation,
  renderers,
  editors,
  overscan,
  minColumns,
  config,
  wasmSource,
  height,
  fill,
  rowBridge,
  fallback,
  onGridChange,
  onRowDelta,
  onSelectionChange,
  onViewportChange,
  onEditBegin,
  onEditCommit,
  onSearch,
  onActiveSheetChange,
  onCommandStateChange,
  onMutationRejected,
  onRendererFallback,
  onDatasourceError,
  onExportError,
  onReady,
  onInitializationError,
  grid = $bindable(),
  ...hostAttributes
}: Props = $props();

let host: HTMLDivElement;
let loading = $state(!isSheetwriteReady());

function forwardCommandStateChange(
  event: Parameters<NonNullable<typeof onCommandStateChange>>[0],
): void {
  onCommandStateChange?.(event);
}

const handlers: GridAdapterEventHandlers = {
  onGridChange: (event: Parameters<NonNullable<typeof onGridChange>>[0]) => onGridChange?.(event),
  onRowDelta: (event: Parameters<NonNullable<typeof onRowDelta>>[0]) => onRowDelta?.(event),
  onSelectionChange: (event: Parameters<NonNullable<typeof onSelectionChange>>[0]) =>
    onSelectionChange?.(event),
  onViewportChange: (event: Parameters<NonNullable<typeof onViewportChange>>[0]) =>
    onViewportChange?.(event),
  onEditBegin: (event: Parameters<NonNullable<typeof onEditBegin>>[0]) => onEditBegin?.(event),
  onEditCommit: (event: Parameters<NonNullable<typeof onEditCommit>>[0]) => onEditCommit?.(event),
  onSearch: (event: Parameters<NonNullable<typeof onSearch>>[0]) => onSearch?.(event),
  onActiveSheetChange: (event: Parameters<NonNullable<typeof onActiveSheetChange>>[0]) =>
    onActiveSheetChange?.(event),
  // The controller only subscribes to command state while this is defined, so
  // absence must be visible instead of an always-present wrapper.
  get onCommandStateChange() {
    return onCommandStateChange === undefined ? undefined : forwardCommandStateChange;
  },
  onMutationRejected: (event: Parameters<NonNullable<typeof onMutationRejected>>[0]) =>
    onMutationRejected?.(event),
  onRendererFallback: (event: Parameters<NonNullable<typeof onRendererFallback>>[0]) =>
    onRendererFallback?.(event),
  onDatasourceError: (event: Parameters<NonNullable<typeof onDatasourceError>>[0]) =>
    onDatasourceError?.(event),
  onExportError: (event: Parameters<NonNullable<typeof onExportError>>[0]) =>
    onExportError?.(event),
  onReady: (event: Parameters<NonNullable<typeof onReady>>[0]) => onReady?.(event),
  onInitializationError: (error: Parameters<NonNullable<typeof onInitializationError>>[0]) =>
    onInitializationError?.(error),
};

const lifetime = createAdapterGridController(handlers, {
  publish(nextGrid) {
    grid = nextGrid ?? undefined;
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
  const input: AdapterGridInput = {
    options: {
      workbook, data, datasource, datasourceStorage, renderer, workerUrl, presentation,
      protectionResolver, mutationPolicy, transactionResourceLimits, hyperlinkActivation,
      renderers, editors, theme, readOnly, overscan, minColumns, config,
    },
    rowBridge,
    wasmSource,
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
  {...hostAttributes}
  bind:this={host}
  class={["sheetwrite", hostAttributes.class]}
  style:width={sizing.width}
  style:height={sizing.height}
  style:min-height={sizing.minHeight}
>
  {#if loading && fallback}{@render fallback()}{/if}
</div>
