---
"@sheetwrite/core": patch
---

The grid's dialogs (Format Cells, Insert, Delete and the merge warning) open centred in the browser window, as Excel's do, instead of inside the grid's area. They fit any window down to 390 px wide: a short window scrolls the dialog's body, and the title, OK and Cancel stay in view. Before, Format Cells was cut to the grid's height, so at 1280 × 720 OK was below the visible part of the dialog. Each dialog is a modal `<dialog>` element in the browser's top layer, so a host's overflow, transform or stacking cannot cut it, and the rest of the page is inert while it is open.
