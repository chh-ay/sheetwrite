import { requestPanel } from "../panels/panel-loader.js";
import type { SheetwriteAddon } from "../types/addon.js";
import type { HistoryAddonOptions } from "./panel-contract.js";

/**
 * The version history add-on. It shows Review › Version History and Save
 * Version in each grid that has an archive and an author, from `options` or
 * from `createGrid(host, { addons: { history: { ... } } })`; grid settings
 * replace the init options field by field. The panel and its code load only
 * when either command runs; archive recording stays under the host's
 * committed-transaction journal. A grid destroyed while the panel code loads
 * opens nothing.
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
 * @param options - Defaults for every grid, such as `archive` and `authorId`;
 *   a grid's own settings replace them field by field.
 * @returns The add-on to pass in `initSheetwrite({ addons })`.
 * @see /docs/features/data/persistence/
 */
export function historyAddon(
  options: Partial<HistoryAddonOptions> = {},
): SheetwriteAddon<Partial<HistoryAddonOptions>> {
  return {
    name: "history",
    grid({ grid, settings, historyCommand: history_command }) {
      const merged = { ...options, ...settings };
      const { archive, authorId: author_id } = merged;
      if (archive === undefined || author_id === undefined) return;

      const grid_options: HistoryAddonOptions = { ...merged, archive, authorId: author_id };
      history_command((action) => {
        requestPanel(grid, (controller) =>
          controller.openHistoryPanel(grid, async () => {
            const { historyPanel: history_panel } = await import("../panels/history-panel.js");

            return (target) => history_panel(target, grid_options, action === "save");
          }),
        );
      });
    },
  };
}
