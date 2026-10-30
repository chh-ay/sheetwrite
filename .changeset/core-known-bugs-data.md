---
"@sheetwrite/core": patch
---

Fix several bugs that changed user data:

- Fill, copy and row or column edits keep function names such as `LOG10` and `BIN2DEC`. A reference that moves outside the sheet, before column A or row 1 or past column XFD or row 1048576, becomes `#REF!` instead of stopping at the edge. A range with such a corner becomes one `#REF!`.
- Pasting `-5` or `+1` as plain text from another app into a number column stores a number. Only text that would become a formula gets a leading quote.
- Case-insensitive replace keeps non-ASCII text intact when lower case changes the text length (for example `İ`).
- Replace all skips reference cells, so the reference stays linked.
- `loadPage` keeps empty cells, booleans and dates, the same as `loadColumnar`.
- Editing a boolean cell shows `TRUE` or `FALSE`, and the editor reads formulas from any store.
- Delete on a focused sheet tab does not remove the last visible sheet, and Backspace no longer removes a sheet.
- Snapshots reject a row height of 0, the same as sheet operations, and canonical order no longer depends on the runtime locale.
