// The add-on registry. `initSheetwrite` loads this module only when a host
// installs add-ons, so a page without add-ons carries none of it.

import { setChartRendererFactory, setChartViewProviderFactory } from "./chart-backend.js";
import { SheetwriteError } from "./errors.js";
import { registerQueryCommands } from "./query-commands.js";
import type { SheetwriteAddon, SheetwriteAddonContext } from "./types/addon.js";
import type { Grid, SheetwriteAddonSettings } from "./types/grid.js";
import {
 setXlsxTableExportBackend,
 setXlsxTableImportBackend,
 setXlsxWorkbookBackend,
} from "./xlsx-backends.js";

/** Core's page-wide registration methods, which write the chart and XLSX backends. */
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
export class AddonRegistry {
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

   addon.setup?.(setupContext);
   this.installed.set(addon.name, addon);
  }
 }

 /** Whether an add-on with this name is installed. */
 has(name: string): boolean {
  return this.installed.has(name);
 }

 /**
  * Run each installed add-on's grid hook in install order. The cleanups run
  * through `onDestroy` when the grid is destroyed. A failing hook destroys
  * the grid, which runs the cleanups of the hooks before it, and rethrows.
  */
 attach(
  grid: Grid,
  settings: SheetwriteAddonSettings | undefined,
  onDestroy: (cleanup: () => void) => void,
 ): void {
  try {
   for (const addon of this.installed.values()) {
    const cleanup = addon.grid?.({
     grid,
     settings: settings?.[addon.name],
     queryCommands(commands) {
      const remove = registerQueryCommands(grid, commands);
      onDestroy(remove);
      return remove;
     },
    });
    if (cleanup) onDestroy(cleanup);
   }
  } catch (error) {
   grid.destroy();
   throw error;
  }
 }
}

/** The page's add-on registry. */
export const addonRegistry = new AddonRegistry();
