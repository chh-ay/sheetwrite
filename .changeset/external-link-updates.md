---
"@sheetwrite/core": minor
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
"@sheetwrite/xlsx": patch
---

Hosts can update, re-point and break external workbook links (#226). The commands load only from `@sheetwrite/core/external-links`, so an application that does not import them carries none of their code:

- `updateExternalLinks(grid, resolve, books?)` asks the host's `ExternalLinkResolver` for the current values of each link, as Excel's "Update Values" does. It saves them in one undoable change and returns a status per link: `updated`, `unavailable` (the resolver gave `null`) or `failed`.
- `changeExternalLinkSource(grid, book, { book, target })` points the formulas that name a workbook at another one, as "Change Source" does, and keeps the saved values until the next update.
- `breakExternalLinks(grid, books)` replaces the formulas that read those workbooks with their values and removes the links, as "Break Link" does.
- `listExternalLinks(grid)` returns the links. The entry also exports the formula-text helpers for external references (`rewriteExternalSheets`, `externalSheetText`, `formulaContainsExternalReference`, `formulaCallsExternalData`), which the XLSX codec now uses.

A new document operation, `{ op: "setExternalLinks"; links }`, replaces the saved values of all links. It is undoable, syncs to collaborators, persists, and is restored with a workbook version. Excel clears Undo after "Update Values" and "Break Link"; Sheetwrite keeps them undoable, and an undo restores both the links and the formulas.

In both engines, a formula that names a linked workbook reads the link as soon as it is added, also when the formula was entered first. `CellStore.removeExternalSheet(book, sheet)` removes a link sheet, and formulas that read it show `#REF!` and keep their text.
