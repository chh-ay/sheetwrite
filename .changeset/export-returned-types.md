---
"@sheetwrite/core": patch
---

`@sheetwrite/core` exports the types that its public methods take or return, so a host can name them: `ClipboardOutcome` (the result of `grid.actions.copy`, `cut`, `paste`, `pasteValues` and `pasteSpecial`), `PasteSpecialOptions`, `SelectionSummary` (`grid.summarizeSelection()`), `AddSheetInput`, `BorderPreset`, `CellRef`, `ClipboardWindowView`, `CompactRangeHistory`, `RangeMutationAllocationStats`, `RestoreProvenance` and `XlsxWorkbookExportContext`. `@sheetwrite/core/history` exports `AtomicHistoryStorage` and `HistoryStorageTransaction`, and `@sheetwrite/core/testing` exports `ShownSuggestion`. Before, these types appeared in signatures but could not be imported.
