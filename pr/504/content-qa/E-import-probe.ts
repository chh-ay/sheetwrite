import type { AddSheetInput, BorderPreset, CellRef, ClipboardOutcome, ClipboardWindowView, CompactRangeHistory, Grid, PasteSpecialOptions, RangeMutationAllocationStats, RestoreProvenance, SelectionSummary, XlsxWorkbookExportContext } from "@sheetwrite/core";
import type { AtomicHistoryStorage, HistoryStorageTransaction } from "@sheetwrite/core/history";
import type { ShownSuggestion } from "@sheetwrite/core/testing";
export async function pasteAndReport(grid: Grid): Promise<ClipboardOutcome> { return grid.actions.paste(); }
export async function summary(grid: Grid): Promise<SelectionSummary | null> { return grid.summarizeSelection(); }
export type Probe = [AddSheetInput, BorderPreset, CellRef, ClipboardWindowView, CompactRangeHistory, PasteSpecialOptions, RangeMutationAllocationStats, RestoreProvenance, XlsxWorkbookExportContext, AtomicHistoryStorage, HistoryStorageTransaction, ShownSuggestion];
