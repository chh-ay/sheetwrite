---
"@sheetwrite/core": patch
---

`SheetwriteError`'s doc comment now says plainly what it is, with the 8 KiB message limit as a note. `createGrid` documents its `opts` parameter, and so do the other exported functions that described only some of their parameters (`createGridFromSnapshot`, `createRibbon`, `createToolbar`, `createNameBox`, `createFormulaBar`, `createSelectionStatus`, `createSpreadsheetShell`, `parseCsv`, `fromCsv`, the XLSX import and export functions, the external link functions, `previewFormula`, `resolveChartView`, `validateWorkbookSnapshot` and `validWorkbookTable`), so editor hovers list every parameter. No behaviour changes.
