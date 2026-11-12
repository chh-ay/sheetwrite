import type { CellScalar } from "@sheetwrite/core";
import type { RowBridgeId } from "@sheetwrite/core/adapter";
import type { ComponentConstructorOptions, ComponentInternals, SvelteComponent } from "svelte";
import type { SheetwriteProps } from "./props.js";

export type { SheetwriteProps } from "./props.js";

/**
 * The shape svelte2tsx gives a generic component. The constructor signature keeps `Row` and
 * `Id` for Svelte's template checker, which drops the generics of a plain `Component`.
 */
interface SheetwriteComponent {
  new <Row extends Record<string, CellScalar>, Id extends RowBridgeId = RowBridgeId>(
    options: ComponentConstructorOptions<SheetwriteProps<Row, Id>>,
  ): SvelteComponent<SheetwriteProps<Row, Id>> & { $$bindings?: "grid" };
  <Row extends Record<string, CellScalar>, Id extends RowBridgeId = RowBridgeId>(
    this: void,
    internals: ComponentInternals,
    props: SheetwriteProps<Row, Id>,
  ): {};
  element?: typeof HTMLElement;
  z_$$bindings?: "grid";
}

/** Owns a sheet derived from `columns` and `defaultRows`. Bind `grid` for imperative access; it clears on reset or unmount. */
declare const Sheetwrite: SheetwriteComponent;
export default Sheetwrite;
