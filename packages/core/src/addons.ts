// The add-on registry. `initSheetwrite` loads this module only when a host
// installs add-ons, so a page without add-ons carries none of it.

import { setChartRendererFactory, setChartViewProviderFactory } from "./chart-backend.js";
import { SheetwriteError } from "./errors.js";
import type { SheetwriteAddon, SheetwriteAddonContext } from "./types/addon.js";
import type { Grid, SheetwriteAddonSettings } from "./types/grid.js";

// The XLSX slots and the query command seam load on their first use, so the
// grid's import of this module preloads nothing else: every module it names
// adds bytes to the first chunk.

/** XLSX parts given during setup that are still being written to their slots. */
const pendingXlsx: Promise<void>[] = [];

/** Core's page-wide registration methods, which write the chart and XLSX backends. */
const setupContext: SheetwriteAddonContext = {
  charts(parts) {
    setChartViewProviderFactory(parts.views);
    setChartRendererFactory(parts.renderer);
  },
  xlsx(parts) {
    const written = import("./xlsx-backends.js").then((slots) => {
      if (parts.workbook) slots.setXlsxWorkbookBackend(parts.workbook);

      if (parts.tableImport) slots.setXlsxTableImportBackend(parts.tableImport);

      if (parts.tableExport) slots.setXlsxTableExportBackend(parts.tableExport);
    });
    pendingXlsx.push(written);
  },
};

/** What the registry needs of a grid beyond its public interface. */
interface AddonGrid extends Grid {
  /** Runs `cleanup` when the grid is destroyed. */
  addCleanup(cleanup: () => void): void;
  /** Opens the history panel or its Save Version form. */
  historyCommand?: (action: "open" | "save") => void;
}

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
  async install(addons: readonly SheetwriteAddon[]): Promise<void> {
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

    // `initSheetwrite` resolves once every XLSX part is in its slot.
    await Promise.all(pendingXlsx.splice(0));
  }

  /** Whether an add-on with this name is installed. */
  has(name: string): boolean {
    return this.installed.has(name);
  }

  /**
   * Run each installed add-on's grid hook in install order. The cleanups run
   * when the grid is destroyed. A failing hook destroys the grid, which runs
   * the cleanups of the hooks before it, and rethrows.
   */
  attach(grid: AddonGrid, settings: SheetwriteAddonSettings | undefined): void {
    try {
      for (const addon of this.installed.values()) {
        const cleanup = addon.grid?.({
          grid,
          settings: settings?.[addon.name],
          queryCommands(commands) {
            const registered = import("./query-commands.js").then((seam) =>
              seam.registerQueryCommands(grid, commands),
            );
            const remove = (): void => {
              void registered.then((unregister) => unregister());
            };
            grid.addCleanup(remove);
            return remove;
          },
          historyCommand(command) {
            grid.historyCommand = command;
          },
        });
        if (cleanup) grid.addCleanup(cleanup);
      }
    } catch (error) {
      grid.destroy();
      throw error;
    }
  }
}

/** The page's add-on registry. */
export const addonRegistry = new AddonRegistry();
