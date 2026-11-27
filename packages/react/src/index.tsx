import type { CellScalar, Grid, GridOptions } from "@sheetwrite/core";
import {
  type AdapterGridController,
  type AdapterGridInput,
  assertGridSize,
  createAdapterGridController,
  createSimpleGridInput,
  createSimpleRowBridge,
  extractGridOptions,
  type GridAdapterEventHandlers,
  type GridControllerHandlers,
  type GridPublicationAdapter,
  type GridSizeProps,
  gridSizeStyle,
  type RowBridge,
  type RowBridgeHandler,
  type RowBridgeId,
  type SheetwriteInitializationProps,
  type SimpleColumn,
} from "@sheetwrite/core/adapter";
import {
  type CSSProperties,
  type ForwardedRef,
  forwardRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const use_commit_layout_effect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function publish_grid(ref: ForwardedRef<Grid>, grid: Grid | null): void {
  if (typeof ref === "function") ref(grid);
  else if (ref) ref.current = grid;
}

type GridAdapterEventHandlerName =
  | "onGridChange"
  | "onRowDelta"
  | "onSelectionChange"
  | "onViewportChange"
  | "onEditBegin"
  | "onEditCommit"
  | "onSearch"
  | "onCommandStateChange"
  | "onActiveSheetChange"
  | "onMutationRejected"
  | "onRendererFallback"
  | "onDatasourceError"
  | "onExportError"
  | "onKeyBindingsChange"
  | "onReady"
  | "onInitializationError";
type AssertNever<Value extends never> = Value;
type GridAdapterEventHandlerParity = AssertNever<
  | Exclude<keyof GridAdapterEventHandlers, GridAdapterEventHandlerName>
  | Exclude<GridAdapterEventHandlerName, keyof GridAdapterEventHandlers>
>;
type SheetwriteGridHostAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  GridAdapterEventHandlerName | GridAdapterEventHandlerParity | "children"
>;

/** Advanced framework adapter props for workbook data or datasource ownership. */
export interface SheetwriteGridProps<Id extends RowBridgeId = RowBridgeId>
  extends
    GridOptions,
    GridAdapterEventHandlers<Id>,
    SheetwriteInitializationProps,
    SheetwriteGridHostAttributes {
  /** Projects canonical changes to host-owned row identities. */
  rowBridge?: RowBridge<Id>;
  /** Receives one accepted or reconciled row projection. */
  onRowDelta?: RowBridgeHandler<Id>;
  /** Receives structured issues when a Grid mutation is rejected. */
  onMutationRejected?: GridAdapterEventHandlers["onMutationRejected"];
  /** Fires when worker rendering falls back to the main-thread canvas renderer. */
  onRendererFallback?: GridAdapterEventHandlers["onRendererFallback"];
  /** Receives failed datasource requests and their errors. */
  onDatasourceError?: GridAdapterEventHandlers["onDatasourceError"];
  /** Receives failures from built-in XLSX export actions. */
  onExportError?: GridAdapterEventHandlers["onExportError"];
  /** Receives the user's key bindings after each change in the Keyboard shortcuts panel. */
  onKeyBindingsChange?: GridAdapterEventHandlers["onKeyBindingsChange"];
  /** Fires after the adapter publishes a ready Grid generation. */
  onReady?: GridAdapterEventHandlers["onReady"];
  /** Additional class appended to the required `sheetwrite` host class. */
  className?: string;
  /** Host styles merged before adapter sizing styles. */
  style?: CSSProperties;
  /** Content shown while WASM is loading or after initialization fails. */
  fallback?: ReactNode;
  /** Host height in CSS pixels for numbers or any CSS length string. */
  height?: number | string;
  /** Fills the parent's available width and height, taking precedence over `height`. */
  fill?: true;
}

const SheetwriteGridComponent = forwardRef<Grid, SheetwriteGridProps>(
  function SheetwriteGrid(props, ref): ReactElement {
    const {
      className: class_name,
      style,
      fallback,
      wasmSource: wasm_source,
      onInitializationError: on_initialization_error,
      onGridChange: on_grid_change,
      onRowDelta: on_row_delta,
      onSelectionChange: on_selection_change,
      onViewportChange: on_viewport_change,
      onEditBegin: on_edit_begin,
      onEditCommit: on_edit_commit,
      onSearch: on_search,
      onCommandStateChange: on_command_state_change,
      onActiveSheetChange: on_active_sheet_change,
      onMutationRejected: on_mutation_rejected,
      onRendererFallback: on_renderer_fallback,
      onDatasourceError: on_datasource_error,
      onExportError: on_export_error,
      onKeyBindingsChange: on_key_bindings_change,
      onReady: on_ready,
      rowBridge: row_bridge,
      workbook,
      data,
      datasource,
      datasourceStorage: datasource_storage,
      renderer,
      workerUrl: worker_url,
      presentation,
      theme,
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
      height,
      fill,
      ...host_attributes
    } = props;

    const host_ref = useRef<HTMLDivElement | null>(null);
    const controller_ref = useRef<AdapterGridController | null>(null);
    const current_grid = useRef<Grid | null>(null);
    const published_ref = useRef<ForwardedRef<Grid> | null>(null);
    const [initialization_state, set_initialization_state] = useState<
      "loading" | "ready" | "error"
    >("loading");

    const handlers = useRef<GridAdapterEventHandlers | null>(null);
    use_commit_layout_effect(() => {
      const committed_handlers: GridAdapterEventHandlers = {
        onGridChange: on_grid_change,
        onRowDelta: on_row_delta,
        onSelectionChange: on_selection_change,
        onViewportChange: on_viewport_change,
        onEditBegin: on_edit_begin,
        onEditCommit: on_edit_commit,
        onSearch: on_search,
        onCommandStateChange: on_command_state_change,
        onActiveSheetChange: on_active_sheet_change,
        onMutationRejected: on_mutation_rejected,
        onRendererFallback: on_renderer_fallback,
        onDatasourceError: on_datasource_error,
        onExportError: on_export_error,
        onKeyBindingsChange: on_key_bindings_change,
        onReady: on_ready,
        onInitializationError: on_initialization_error,
      };
      handlers.current = committed_handlers;
      return () => {
        if (handlers.current === committed_handlers) handlers.current = null;
      };
    }, [
      on_grid_change,
      on_row_delta,
      on_selection_change,
      on_viewport_change,
      on_edit_begin,
      on_edit_commit,
      on_search,
      on_command_state_change,
      on_active_sheet_change,
      on_mutation_rejected,
      on_renderer_fallback,
      on_datasource_error,
      on_export_error,
      on_key_bindings_change,
      on_ready,
      on_initialization_error,
    ]);

    use_commit_layout_effect(() => {
      const previous = published_ref.current;
      if (previous && previous !== ref) publish_grid(previous, null);
      published_ref.current = ref;
      publish_grid(ref, current_grid.current);
      return () => {
        if (published_ref.current !== ref) return;
        publish_grid(ref, null);
        published_ref.current = null;
      };
    }, [ref]);

    if (!controller_ref.current) {
      const forward_command_state_change: NonNullable<
        GridControllerHandlers["onCommandStateChange"]
      > = (event) => handlers.current?.onCommandStateChange?.(event);
      controller_ref.current = createAdapterGridController(
        {
          onGridChange: (event) => handlers.current?.onGridChange?.(event),
          onRowDelta: (event) => handlers.current?.onRowDelta?.(event),
          onSelectionChange: (event) => handlers.current?.onSelectionChange?.(event),
          onViewportChange: (event) => handlers.current?.onViewportChange?.(event),
          onEditBegin: (event) => handlers.current?.onEditBegin?.(event),
          onEditCommit: (event) => handlers.current?.onEditCommit?.(event),
          onSearch: (event) => handlers.current?.onSearch?.(event),
          get onCommandStateChange() {
            return handlers.current?.onCommandStateChange
              ? forward_command_state_change
              : undefined;
          },
          onActiveSheetChange: (event) => handlers.current?.onActiveSheetChange?.(event),
          onMutationRejected: (event) => handlers.current?.onMutationRejected?.(event),
          onRendererFallback: (event) => handlers.current?.onRendererFallback?.(event),
          onDatasourceError: (event) => handlers.current?.onDatasourceError?.(event),
          onExportError: (event) => handlers.current?.onExportError?.(event),
          onKeyBindingsChange: (event) => handlers.current?.onKeyBindingsChange?.(event),
          onReady: (event) => handlers.current?.onReady?.(event),
          onInitializationError: (error) => handlers.current?.onInitializationError?.(error),
        },
        {
          publish(grid) {
            current_grid.current = grid;
            publish_grid(published_ref.current, grid);
          },
          setInitializationState: set_initialization_state,
          reportConsumerFailure(thrown) {
            reportError(thrown);
          },
        } satisfies GridPublicationAdapter,
      );
    }
    const committed_input = useRef<AdapterGridInput>({
      options: extractGridOptions({ ...props }),
      rowBridge: row_bridge,
      wasmSource: wasm_source,
    });
    use_commit_layout_effect(() => {
      committed_input.current = {
        options: extractGridOptions({ ...props }),
        rowBridge: row_bridge,
        wasmSource: wasm_source,
      };
    });
    useEffect(() => {
      const controller = controller_ref.current;
      const host = host_ref.current;
      if (!controller || !host) return;
      controller.mount(host, committed_input.current);
      return () => controller.unmount();
    }, []);
    useEffect(() => {
      controller_ref.current?.update(committed_input.current);
    });

    const host_class_name = class_name ? `sheetwrite ${class_name}` : "sheetwrite";
    const sizing = gridSizeStyle({ height, fill });
    const host_style = { ...style, ...sizing };
    return (
      <div {...host_attributes} ref={host_ref} className={host_class_name} style={host_style}>
        {initialization_state === "ready" ? null : fallback}
      </div>
    );
  },
);

/**
 * Advanced framework component with inferred row-bridge identity.
 *
 * @example
 * ```tsx
 * import { SheetwriteGrid } from "@sheetwrite/react";
 * import type { Workbook } from "@sheetwrite/core";
 *
 * export function WorkbookView({ workbook }: { workbook: Workbook }) {
 *   return <SheetwriteGrid workbook={workbook} height={400} />;
 * }
 * ```
 * @see Sheetwrite
 * @see /docs/frameworks/react/
 */
export const SheetwriteGrid = SheetwriteGridComponent as <Id extends RowBridgeId = RowBridgeId>(
  props: SheetwriteGridProps<Id> & { ref?: ForwardedRef<Grid> },
) => ReactElement;

/** Simple framework adapter props for columns and default row objects. */
export type SheetwriteProps<
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
> = Omit<
  SheetwriteGridProps<Id>,
  "workbook" | "data" | "datasource" | "height" | "fill" | "rowBridge"
> &
  GridSizeProps & {
    /** Ordered schema used to derive the component-owned sheet. */
    columns: readonly SimpleColumn<Row>[];
    /** Rows converted to initial columnar data; missing column keys become `null`. */
    defaultRows: readonly Row[];
    /** Name of the generated sheet; defaults to `Sheet 1`. */
    sheetName?: string;
    /** Opt-in stable identity for each host row. */
    getRowId?: (row: Row, index: number) => Id;
    /** Creates stable identities for Grid-inserted rows. */
    createRowId?: Parameters<typeof createSimpleRowBridge<Row, Id>>[0]["createRowId"];
  };

const SheetwriteComponent = forwardRef<
  Grid,
  SheetwriteProps<Record<string, CellScalar>, RowBridgeId>
>(function Sheetwrite(
  {
    columns,
    defaultRows: default_rows,
    sheetName: sheet_name,
    getRowId: get_row_id,
    createRowId: create_row_id,
    ...props
  },
  ref,
): ReactElement {
  assertGridSize({ height: props.height, fill: props.fill });
  const input = useMemo(
    () => createSimpleGridInput({ columns, defaultRows: default_rows, sheetName: sheet_name }),
    [columns, default_rows, sheet_name],
  );
  const row_bridge = useMemo(
    () =>
      createSimpleRowBridge({
        columns,
        defaultRows: default_rows,
        ...(get_row_id === undefined ? {} : { getRowId: get_row_id }),
        ...(create_row_id === undefined ? {} : { createRowId: create_row_id }),
      }),
    [columns, default_rows, get_row_id, create_row_id],
  );
  return <SheetwriteGrid {...props} {...input} rowBridge={row_bridge} ref={ref} />;
});

/**
 * Convenience component for local object rows. It derives a single-sheet workbook from
 * `columns`, `defaultRows`, and `sheetName`, initializes Sheetwrite, and owns the `Grid`
 * through prop-driven resets and unmount cleanup. Pass a `ref` to access the live `Grid`;
 * use `SheetwriteGrid` when the host already owns a workbook or datasource.
 *
 * @example
 * ```tsx
 * import { Sheetwrite } from "@sheetwrite/react";
 *
 * export function Sales() {
 *   return <Sheetwrite
 *     columns={[{ key: "amount", title: "Amount", type: "number" }]}
 *     defaultRows={[{ amount: 12 }, { amount: 18 }]}
 *     height={400}
 *   />;
 * }
 * ```
 * @see SheetwriteGrid
 * @see /docs/frameworks/react/
 */
export const Sheetwrite = SheetwriteComponent as <
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
>(
  props: SheetwriteProps<Row, Id> & {
    /** Receives the live Grid after readiness and `null` on reset or unmount. */
    ref?: ForwardedRef<Grid>;
  },
) => ReactElement;

export type {
  CellEditor,
  CellEditorContext,
  CellEditorInstance,
  CellEditorNavigation,
  CellScalar,
  Grid,
  GridCommandName,
  GridCommandState,
} from "@sheetwrite/core";
export type {
  GridReadyEvent,
  RowBridge,
  RowBridgeDelta,
  RowBridgeHandler,
  RowBridgeId,
  RowBridgeProjection,
  SimpleColumn,
} from "@sheetwrite/core/adapter";
