import type { CellScalar, Grid, GridOptions } from "@sheetwrite/core";
import {
  type AdapterGridController,
  type AdapterGridInput,
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

const useCommitLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function publishGrid(ref: ForwardedRef<Grid>, grid: Grid | null): void {
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

/** Advanced framework component for workbook data or datasource input. */
const SheetwriteGridComponent = forwardRef<Grid, SheetwriteGridProps>(
  function SheetwriteGrid(props, ref): ReactElement {
    const {
      className,
      style,
      fallback,
      wasmSource,
      onInitializationError,
      onGridChange,
      onRowDelta,
      onSelectionChange,
      onViewportChange,
      onEditBegin,
      onEditCommit,
      onSearch,
      onCommandStateChange,
      onActiveSheetChange,
      onMutationRejected,
      onRendererFallback,
      onDatasourceError,
      onExportError,
      onReady,
      rowBridge,
      workbook,
      data,
      datasource,
      datasourceStorage,
      renderer,
      workerUrl,
      presentation,
      theme,
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
      height,
      fill,
      ...hostAttributes
    } = props;

    const hostRef = useRef<HTMLDivElement | null>(null);
    const controllerRef = useRef<AdapterGridController | null>(null);
    const currentGrid = useRef<Grid | null>(null);
    const publishedRef = useRef<ForwardedRef<Grid> | null>(null);
    const [initializationState, setInitializationState] = useState<"loading" | "ready" | "error">(
      "loading",
    );

    const handlers = useRef<GridAdapterEventHandlers | null>(null);
    useCommitLayoutEffect(() => {
      const committedHandlers: GridAdapterEventHandlers = {
        onGridChange,
        onRowDelta,
        onSelectionChange,
        onViewportChange,
        onEditBegin,
        onEditCommit,
        onSearch,
        onCommandStateChange,
        onActiveSheetChange,
        onMutationRejected,
        onRendererFallback,
        onDatasourceError,
        onExportError,
        onReady,
        onInitializationError,
      };
      handlers.current = committedHandlers;
      return () => {
        if (handlers.current === committedHandlers) handlers.current = null;
      };
    }, [
      onGridChange,
      onRowDelta,
      onSelectionChange,
      onViewportChange,
      onEditBegin,
      onEditCommit,
      onSearch,
      onCommandStateChange,
      onActiveSheetChange,
      onMutationRejected,
      onRendererFallback,
      onDatasourceError,
      onExportError,
      onReady,
      onInitializationError,
    ]);

    useCommitLayoutEffect(() => {
      const previous = publishedRef.current;
      if (previous && previous !== ref) publishGrid(previous, null);
      publishedRef.current = ref;
      publishGrid(ref, currentGrid.current);
      return () => {
        if (publishedRef.current !== ref) return;
        publishGrid(ref, null);
        publishedRef.current = null;
      };
    }, [ref]);

    if (!controllerRef.current) {
      const forwardCommandStateChange: NonNullable<
        GridControllerHandlers["onCommandStateChange"]
      > = (event) => handlers.current?.onCommandStateChange?.(event);
      controllerRef.current = createAdapterGridController(
        {
          onGridChange: (event) => handlers.current?.onGridChange?.(event),
          onRowDelta: (event) => handlers.current?.onRowDelta?.(event),
          onSelectionChange: (event) => handlers.current?.onSelectionChange?.(event),
          onViewportChange: (event) => handlers.current?.onViewportChange?.(event),
          onEditBegin: (event) => handlers.current?.onEditBegin?.(event),
          onEditCommit: (event) => handlers.current?.onEditCommit?.(event),
          onSearch: (event) => handlers.current?.onSearch?.(event),
          get onCommandStateChange() {
            return handlers.current?.onCommandStateChange ? forwardCommandStateChange : undefined;
          },
          onActiveSheetChange: (event) => handlers.current?.onActiveSheetChange?.(event),
          onMutationRejected: (event) => handlers.current?.onMutationRejected?.(event),
          onRendererFallback: (event) => handlers.current?.onRendererFallback?.(event),
          onDatasourceError: (event) => handlers.current?.onDatasourceError?.(event),
          onExportError: (event) => handlers.current?.onExportError?.(event),
          onReady: (event) => handlers.current?.onReady?.(event),
          onInitializationError: (error) => handlers.current?.onInitializationError?.(error),
        },
        {
          publish(grid) {
            currentGrid.current = grid;
            publishGrid(publishedRef.current, grid);
          },
          setInitializationState,
          reportConsumerFailure(thrown) {
            reportError(thrown);
          },
        } satisfies GridPublicationAdapter,
      );
    }
    const committedInput = useRef<AdapterGridInput>({
      options: extractGridOptions({ ...props }),
      rowBridge,
      wasmSource,
    });
    useCommitLayoutEffect(() => {
      committedInput.current = { options: extractGridOptions({ ...props }), rowBridge, wasmSource };
    });
    useEffect(() => {
      const controller = controllerRef.current;
      const host = hostRef.current;
      if (!controller || !host) return;
      controller.mount(host, committedInput.current);
      return () => controller.unmount();
    }, []);
    useEffect(() => {
      controllerRef.current?.update(committedInput.current);
    });

    const hostClassName = className ? `sheetwrite ${className}` : "sheetwrite";
    const sizing = gridSizeStyle({ height, fill });
    const hostStyle = { ...style, ...sizing };
    return (
      <div {...hostAttributes} ref={hostRef} className={hostClassName} style={hostStyle}>
        {initializationState === "ready" ? null : fallback}
      </div>
    );
  },
);

/** Advanced framework component with inferred row-bridge identity. */
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
  { columns, defaultRows, sheetName, getRowId, createRowId, ...props },
  ref,
): ReactElement {
  const input = useMemo(
    () => createSimpleGridInput({ columns, defaultRows, sheetName }),
    [columns, defaultRows, sheetName],
  );
  const rowBridge = useMemo(
    () =>
      createSimpleRowBridge({
        columns,
        defaultRows,
        ...(getRowId === undefined ? {} : { getRowId }),
        ...(createRowId === undefined ? {} : { createRowId }),
      }),
    [columns, defaultRows, getRowId, createRowId],
  );
  return <SheetwriteGrid {...props} {...input} rowBridge={rowBridge} ref={ref} />;
});

/**
 * Convenience component for local object rows. It derives a single-sheet workbook from
 * `columns`, `defaultRows`, and `sheetName`, initializes Sheetwrite, and owns the `Grid`
 * through prop-driven resets and unmount cleanup. Pass a `ref` to access the live `Grid`;
 * use `SheetwriteGrid` when the host already owns a workbook or datasource.
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
