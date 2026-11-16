---
"@sheetwrite/core": patch
---

Renaming a sheet to History, in any case, is refused as in Excel, which reserves that name. `validateSheetName` reports it with the new `SheetNameIssueCode` `reserved`. Adding a sheet still accepts the name, so undo, version restore and workbooks from other programs keep a History sheet.
