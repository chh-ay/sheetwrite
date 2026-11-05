import type { SyncCoordinator } from "../sync.js";
import type { WorkbookSnapshot } from "../types/document.js";
import type { Grid } from "../types/grid.js";
import type { ApplyTransactionResult } from "../types/transaction.js";
import type { HistoryDiffPage, HistoryDiffRequest } from "./diff.js";
import type { HistoryRestoreOptions, HistoryRestoreScope } from "./restore.js";
import type { HistoryListPage, HistoryVersion } from "./types.js";

/** The archive calls the version history panel makes; `HistoryArchive` provides them. */
export interface HistoryPanelArchive {
  saveVersion(
    name: string,
    authorId: string,
    time: number,
    signal?: AbortSignal,
  ): Promise<HistoryVersion>;
  listVersions(options?: {
    maxEntries?: number;
    cursor?: string;
    signal?: AbortSignal;
  }): Promise<HistoryListPage>;
  readVersion(id: string, signal?: AbortSignal): Promise<WorkbookSnapshot>;
  diffVersions(request: HistoryDiffRequest): Promise<HistoryDiffPage>;
  restoreVersion(
    grid: Grid,
    id: string,
    scope: HistoryRestoreScope,
    options?: HistoryRestoreOptions,
  ): Promise<ApplyTransactionResult>;
}

/** Host identity and persistence used by the optional history panel. */
export interface HistoryCommandsOptions {
  /** Archive of the committed document shown by the grid. */
  archive: HistoryPanelArchive;
  /** Authenticated person saving named versions. */
  authorId: string;
  /** The grid's coordinator, resolved when a command runs. Omit for a local archive. */
  sync?: (grid: Grid) => SyncCoordinator;
  /** Display name for an authenticated author ID; the ID is shown when omitted. */
  authorName?: (authorId: string) => string;
}
