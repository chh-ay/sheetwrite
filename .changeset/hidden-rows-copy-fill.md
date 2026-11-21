---
"@sheetwrite/core": patch
---

Copy, the fill handle, Ctrl+D and Ctrl+R take the rows hidden with Hide Rows or a collapsed group between the selected rows, as Excel does; a series counts through them. Rows a filter hides stay out. `Store.getClipboardWindow` takes `{ dataRows: true }` to read data rows in sheet order.
