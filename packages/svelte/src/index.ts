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
export type { SheetwriteGridProps } from "./Grid.svelte";
/**
 * Advanced component for an existing workbook or datasource.
 *
 * @example
 * ```ts
 * import { mount, unmount } from "svelte";
 * import { SheetwriteGrid } from "@sheetwrite/svelte";
 * import type { Workbook } from "@sheetwrite/core";
 *
 * function mountWorkbook(target: HTMLElement, workbook: Workbook) {
 *   const view = mount(SheetwriteGrid, { target, props: { workbook, height: 400 } });
 *   return () => unmount(view);
 * }
 * ```
 * @see Sheetwrite
 * @see /docs/frameworks/svelte/
 */
export { default as SheetwriteGrid } from "./Grid.svelte";
export type { SheetwriteProps } from "./Sheetwrite.svelte";
/**
 * Convenience component for local object rows. Bind `grid` to access the live `Grid`.
 *
 * @example
 * ```ts
 * import { mount, unmount } from "svelte";
 * import { Sheetwrite } from "@sheetwrite/svelte";
 *
 * const view = mount(Sheetwrite, { target: document.body, props: {
 *   columns: [{ key: "amount", title: "Amount", type: "number" }],
 *   defaultRows: [{ amount: 12 }, { amount: 18 }],
 *   height: 400,
 * } });
 * // Call when the host view is removed.
 * await unmount(view);
 * ```
 * @see SheetwriteGrid
 * @see /docs/frameworks/svelte/
 */
export { default as Sheetwrite } from "./Sheetwrite.svelte";
