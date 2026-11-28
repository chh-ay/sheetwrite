import type { ClipboardController } from "./clipboard-controller.js";
import type { DocumentController } from "./document-controller.js";
import { SheetwriteError } from "./errors.js";
import type { ReadWindowController } from "./read-window-controller.js";
import type { Scope } from "./scope.js";
import type { SheetwriteStore } from "./store.js";
import { resolveActiveSheet } from "./store/ranges.js";
import type { SheetId } from "./types/coordinates.js";
import type { Workbook, WorkbookSnapshot } from "./types/document.js";
import type { Grid } from "./types/grid.js";
import { loadWorkbook } from "./workbook-io.js";

/** Internal replacement seam. The grid keeps its session fields private. */
export interface DocumentReplacementHost {
  readonly grid: Grid;
  readonly store: SheetwriteStore | null;
  cancelOperations(): void;
  readonly windows: ReadWindowController;
  readonly history: DocumentController;
  readonly clipboard: ClipboardController;
  closeFind(): void;
  activate(workbook: Workbook, activeSheet: SheetId): void;
}

/** Parse outside the live document, then retire its owners only after complete validation. */
export async function replaceDocument(
  host: DocumentReplacementHost,
  source: WorkbookSnapshot | ((signal: AbortSignal) => Promise<WorkbookSnapshot>),
  run: Scope,
  signal?: AbortSignal,
): Promise<void> {
  signal?.addEventListener("abort", () => run.close(signal.reason), {
    once: true,
    signal: run.signal,
  });

  try {
    signal?.throwIfAborted();
    run.signal.throwIfAborted();
    assert_replacement_allowed(host);

    const snapshot = await loadWorkbook(source, run.signal);
    run.signal.throwIfAborted();
    assert_replacement_allowed(host);

    // `replaceSnapshot` builds and hydrates the new document, and it can fail.
    // The live owners are reset only after it succeeds.
    host.store?.replaceSnapshot(snapshot);
    host.cancelOperations();
    host.windows.resetDocument();
    host.history.destroy();
    host.clipboard.cancel();
    host.closeFind();

    const workbook = host.grid.store.getWorkbook();
    host.activate(workbook, resolveActiveSheet(workbook.sheets, workbook.activeSheet));
    host.grid.clearSearch();
    host.grid.openPanel(null);
    host.grid.highlightCells(null);
    host.grid.setPresenceOverlays(null);
    host.grid.trimMemory();
  } finally {
    run.close();
  }
}

function assert_replacement_allowed(host: DocumentReplacementHost): void {
  if (host.store === null || host.grid.getCommandState("importXlsx").disabled) {
    throw new SheetwriteError(
      "unavailable",
      "xlsx-import",
      "Disconnect collaboration before import; import needs an editable grid-owned document without a datasource.",
    );
  }
}
