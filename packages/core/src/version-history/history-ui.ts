import type { HistoryArchive } from "../history-archive.js";
import type { SyncCoordinator } from "../sync.js";
import type { Grid, GridConfig } from "../types/grid.js";

/** Host identity and persistence used by the optional history panel. */
export interface HistoryCommandsOptions {
  /** Archive of the committed document shown by the grid. */
  archive: HistoryArchive;
  /** Authenticated person saving named versions. */
  authorId: string;
  /** The grid's coordinator, resolved when a command runs. Omit for a local archive. */
  sync?: (grid: Grid) => SyncCoordinator;
  /** Display name for an authenticated author ID; the ID is shown when omitted. */
  authorName?: (authorId: string) => string;
}

/**
 * Opt in to Review › Version History and Save Version in every command
 * renderer. Set the returned capability as `GridConfig.history`. The panel
 * and its code load only when either command runs; archive recording stays
 * under the host's existing committed-transaction journal.
 */
export function createHistoryCommands(
  options: HistoryCommandsOptions,
): NonNullable<GridConfig["history"]> {
  return (grid, action) => {
    void import("../panels/panel-controller.js").then(({ openHistoryPanel }) => {
      openHistoryPanel(grid, async () => {
        const { historyPanel } = await import("../panels/history-panel.js");

        return (target) => historyPanel(target, options, action === "save");
      });
    });
  };
}
