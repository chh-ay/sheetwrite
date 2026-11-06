// Add-on contracts for @sheetwrite/core.
// No runtime values live here.

import type { Grid } from "./grid.js";
import type { QueryCommands } from "./query.js";
import type { ChartRendererFactory, ChartViewProviderFactory } from "./store.js";
import type {
  XlsxTableExportBackend,
  XlsxTableImportBackend,
  XlsxWorkbookBackend,
} from "./xlsx.js";

/** Chart parts an add-on gives to core. */
export interface SheetwriteChartParts {
  /** Opens cached chart views for `openChartViews(store)`. */
  readonly views: ChartViewProviderFactory;
  /** Creates the chart renderer of each grid created after setup. */
  readonly renderer: ChartRendererFactory;
}

/** XLSX parts an add-on gives to core; each part given replaces that role. */
export interface SheetwriteXlsxParts {
  /** Reads and writes complete workbooks. */
  readonly workbook?: XlsxWorkbookBackend;
  /** Reads the first sheet as a table. */
  readonly tableImport?: XlsxTableImportBackend;
  /** Writes one table. */
  readonly tableExport?: XlsxTableExportBackend;
}

/**
 * Page-wide registration methods. An add-on gets them in `setup` and may keep
 * them, for example to replace a lazy part with the loaded one.
 */
export interface SheetwriteAddonContext {
  /** Sets the chart views and the grid chart renderer. */
  charts(parts: SheetwriteChartParts): void;
  /** Sets the XLSX roles given in `parts`. */
  xlsx(parts: SheetwriteXlsxParts): void;
}

/** One new grid, with the settings it was created with for one add-on. */
export interface SheetwriteAddonGridContext<Settings> {
  readonly grid: Grid;
  /** Settings from `createGrid(host, { addons: { [name]: settings } })`, or `undefined`. */
  readonly settings: Settings | undefined;
  /**
   * Shows the grid's Get Data, Refresh All and Queries & Connections commands
   * and connects them to `commands`. The grid removes them when it is
   * destroyed; the returned function removes them earlier.
   */
  queryCommands(commands: QueryCommands): () => void;
}

/**
 * One optional Sheetwrite package. Each add-on package exports a factory
 * named `<name>Addon` that returns this object; hosts pass it to
 * `initSheetwrite({ addons })`.
 *
 * `setup` runs once, in list order, after the engine loads. `grid` runs after
 * each later `createGrid` call, in the same order, and the cleanup it returns
 * runs when that grid is destroyed. Both hooks are synchronous and should
 * stay small: an add-on loads its heavy code on first use.
 */
export interface SheetwriteAddon<Settings = unknown> {
  /** Unique add-on name; it is also the key of its per-grid settings. */
  readonly name: string;
  /** Registers the add-on's page-wide parts with core. */
  setup?(context: SheetwriteAddonContext): void;
  /** Applies the add-on to one new grid. */
  grid?(context: SheetwriteAddonGridContext<Settings>): (() => void) | void;
}
