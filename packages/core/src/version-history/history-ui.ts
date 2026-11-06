import { requestPanel } from "../panels/panel-loader.js";
import type { GridConfig } from "../types/grid.js";
import type { HistoryCommandsOptions } from "./panel-contract.js";

/**
 * Opt in to Review › Version History and Save Version in every command
 * renderer. Set the returned capability as `GridConfig.history`. The panel
 * and its code load only when either command runs; archive recording stays
 * under the host's existing committed-transaction journal. A grid destroyed
 * while the panel code loads opens nothing.
 */
export function createHistoryCommands(
  options: HistoryCommandsOptions,
): NonNullable<GridConfig["history"]> {
  return (grid, action) => {
    requestPanel(grid, (controller) =>
      controller.openHistoryPanel(grid, async () => {
        const { historyPanel } = await import("../panels/history-panel.js");

        return (target) => historyPanel(target, options, action === "save");
      }),
    );
  };
}
