import type { SyncCoordinator } from "../sync.js";
import type { WorkbookSnapshot } from "../types/document.js";
import type { Grid } from "../types/grid.js";
import type { ApplyTransactionResult } from "../types/transaction.js";
import type { HistoryDiffPage, HistoryDiffRequest } from "./diff.js";
import type { HistoryRestoreOptions, HistoryRestoreScope } from "./restore.js";
import type { HistoryListPage, HistoryVersion } from "./types.js";

/** The archive calls the version history panel makes; `HistoryArchive` provides them. */
export interface HistoryPanelArchive {
  /** Names the archived head as a new version. */
  saveVersion(
    name: string,
    authorId: string,
    time: number,
    signal?: AbortSignal,
  ): Promise<HistoryVersion>;
  /** Returns one page of versions, newest first. */
  listVersions(options?: {
    maxEntries?: number;
    cursor?: string;
    signal?: AbortSignal;
  }): Promise<HistoryListPage>;
  /** Rebuilds the document as it was at one version. */
  readVersion(id: string, signal?: AbortSignal): Promise<WorkbookSnapshot>;
  /** Returns one page of the cell changes between two versions. */
  diffVersions(request: HistoryDiffRequest): Promise<HistoryDiffPage>;
  /** Restores all or part of a version into the grid as one undoable change. */
  restoreVersion(
    grid: Grid,
    id: string,
    scope: HistoryRestoreScope,
    options?: HistoryRestoreOptions,
  ): Promise<ApplyTransactionResult>;
  /**
   * Frees the version that the archive keeps rebuilt between calls. The panel
   * calls it when it closes and when the grid trims memory.
   */
  releaseMemory?(): void;
}

/** Host identity and persistence of one grid's version history panel. */
export interface HistoryAddonOptions {
  /** Archive of the committed document shown by the grid. */
  archive: HistoryPanelArchive;
  /** Authenticated person saving named versions. */
  authorId: string;
  /** The grid's coordinator, resolved when a command runs. Omit for a local archive. */
  sync?: (grid: Grid) => SyncCoordinator;
  /** Display name for an authenticated author ID; the ID is shown when omitted. */
  authorName?: (authorId: string) => string;
}
