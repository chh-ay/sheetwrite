import type { SheetwriteAddon } from "../types/addon.js";
import type { HistoryAddonOptions } from "./panel-contract.js";

/**
 * The version history add-on. It shows Review › Version History and Save
 * Version in each grid that has an archive and an author, from `options` or
 * from `createGrid(host, { addons: { history: { ... } } })`; grid settings
 * replace the init options field by field. The panel and its code load only
 * when either command runs; archive recording stays under the host's
 * committed-transaction journal.
 *
 * @example
 * ```ts
 * import { createGrid, initSheetwrite, type Workbook } from "@sheetwrite/core";
 * import { historyAddon, type HistoryArchive } from "@sheetwrite/core/history";
 *
 * await initSheetwrite({ addons: [historyAddon()] });
 *
 * function mountWithHistory(host: HTMLElement, workbook: Workbook, archive: HistoryArchive) {
 *   return createGrid(host, {
 *     workbook,
 *     config: { ribbon: true },
 *     addons: { history: { archive, authorId: "ada" } },
 *   });
 * }
 * ```
 * @see /docs/features/data/persistence/
 */
export function historyAddon(
  options: Partial<HistoryAddonOptions> = {},
): SheetwriteAddon<Partial<HistoryAddonOptions>> {
  return {
    name: "history",
    grid({ grid, settings, historyCommand }) {
      const merged = { ...options, ...settings };
      const { archive, authorId } = merged;
      if (archive === undefined || authorId === undefined) return;

      const gridOptions: HistoryAddonOptions = { ...merged, archive, authorId };
      historyCommand((action) => {
        void import("../panels/panel-controller.js").then(({ openHistoryPanel }) => {
          openHistoryPanel(grid, async () => {
            const { historyPanel } = await import("../panels/history-panel.js");

            return (target) => historyPanel(target, gridOptions, action === "save");
          });
        });
      });
    },
  };
}
