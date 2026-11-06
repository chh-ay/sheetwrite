import { setChartRendererFactory, setChartViewProviderFactory } from "./chart-backend.js";
import { SheetwriteError } from "./errors.js";
import type { Grid, SheetwriteAddonSettings } from "./types/grid.js";
import type { ChartRendererFactory, ChartViewProviderFactory } from "./types/store.js";
import type {
  XlsxTableExportBackend,
  XlsxTableImportBackend,
  XlsxWorkbookBackend,
} from "./types/xlsx.js";
import {
  setXlsxTableExportBackend,
  setXlsxTableImportBackend,
  setXlsxWorkbookBackend,
} from "./xlsx-backends.js";

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

/** Registration methods available while an add-on's `setup` hook runs. */
export interface SheetwriteAddonContext {
  /** Sets the chart views and the grid chart renderer. */
  charts(parts: SheetwriteChartParts): void;
  /** Sets the XLSX roles given in `parts`. */
  xlsx(parts: SheetwriteXlsxParts): void;
}

/** The grid and the settings for one add-on, passed when that grid is created. */
export interface SheetwriteAddonGridContext<Settings> {
  readonly grid: Grid;
  /** Settings from `createGrid(host, { addons: { [name]: settings } })`, or `undefined`. */
  readonly settings: Settings | undefined;
}

/**
 * One optional Sheetwrite package. Add-on packages export a factory that
 * returns this object; hosts pass it to `initSheetwrite({ addons })`.
 *
 * `setup` runs once, in list order, after the engine loads. `grid` runs after
 * each later `createGrid` call, and the cleanup it returns runs when that grid
 * is destroyed.
 */
export interface SheetwriteAddon<Settings = unknown> {
  /** Unique add-on name; it is also the key of its per-grid settings. */
  readonly name: string;
  /** Registers the add-on's parts with core. */
  setup(context: SheetwriteAddonContext): void;
  /** Applies per-grid settings to one new grid. */
  grid?(context: SheetwriteAddonGridContext<Settings>): (() => void) | void;
}

/** Core's registration methods, which write the chart and XLSX backends. */
const setupContext: SheetwriteAddonContext = {
  charts(parts) {
    setChartViewProviderFactory(parts.views);
    setChartRendererFactory(parts.renderer);
  },
  xlsx(parts) {
    if (parts.workbook) setXlsxWorkbookBackend(parts.workbook);

    if (parts.tableImport) setXlsxTableImportBackend(parts.tableImport);

    if (parts.tableExport) setXlsxTableExportBackend(parts.tableExport);
  },
};

/**
 * The add-ons installed in this page, in install order. Add-ons register
 * page-wide parts, the same way the engine is one per page, so core keeps one
 * registry.
 */
class AddonRegistry {
  private readonly installed = new Map<string, SheetwriteAddon>();

  /**
   * Install add-ons in list order. A name listed twice in one call is
   * rejected before any setup runs. A name installed by an earlier call is
   * kept, so repeated `initSheetwrite` calls are no-ops for it.
   */
  install(addons: readonly SheetwriteAddon[]): void {
    const listedNames = new Set<string>();

    for (const addon of addons) {
      if (listedNames.has(addon.name)) {
        throw new SheetwriteError(
          "invalid-argument",
          "initialize",
          `Sheetwrite: add-on "${addon.name}" is listed more than once.`,
          { context: { addon: addon.name }, retryable: false },
        );
      }

      listedNames.add(addon.name);
    }

    for (const addon of addons) {
      if (this.installed.has(addon.name)) continue;

      addon.setup(setupContext);
      this.installed.set(addon.name, addon);
    }
  }

  /** Reject settings for add-ons that are not installed, before a grid is built. */
  assertGridSettings(settings: SheetwriteAddonSettings | undefined): void {
    if (!settings) return;

    for (const name of Object.keys(settings)) {
      if (this.installed.has(name)) continue;

      throw new SheetwriteError(
        "invalid-argument",
        "create-grid",
        `Sheetwrite: grid settings name add-on "${name}", which initSheetwrite() did not install.`,
        { context: { addon: name }, retryable: false },
      );
    }
  }

  /** Run each installed add-on's grid hook in install order; returns their cleanups. */
  attachGrid(grid: Grid, settings: SheetwriteAddonSettings | undefined): Array<() => void> {
    const cleanups: Array<() => void> = [];

    for (const addon of this.installed.values()) {
      const cleanup = addon.grid?.({ grid, settings: settings?.[addon.name] });
      if (cleanup) cleanups.push(cleanup);
    }

    return cleanups;
  }
}

/** The page's add-on registry. */
export const addonRegistry = new AddonRegistry();
