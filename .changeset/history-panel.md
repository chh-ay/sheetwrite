---
"@sheetwrite/core": minor
---

Version history panel (#228). `createHistoryCommands({ archive, authorId, sync, authorName })` from `@sheetwrite/core/history` returns the `GridConfig.history` capability that shows Review › Version History and Save Version in the full ribbon, the compact ribbon and the toolbar (`GridActions.versionHistory`, `GridActions.saveVersion`, and command states of the same names). The panel loads as a separate chunk on the first command. It saves named versions after pending changes are committed, lists versions with authors, compares a version with a later one or with the current committed document page by page, opens a read-only preview, and restores the workbook, one sheet or a range after a confirmation. `HistoryArchive.diffVersions` accepts `to: "head"`, and a reader lease can name `"head"`.
