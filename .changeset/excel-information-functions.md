---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
"@sheetwrite/core": minor
---

Both engines add Excel's information functions `ERROR.TYPE`, `INFO`, `ISEVEN`, `ISODD`, `ISNONTEXT`, `ISREF`, `SHEET` and `SHEETS` (#278). `SHEET` and `SHEETS` count every sheet in tab order, hidden sheets too, and recompute when a sheet is added, removed, renamed or moved.

`INFO` returns the sheet count for `"numfile"` and `"Automatic"` for `"recalc"`. It returns `#N/A` for `"directory"`, `"origin"`, `"osversion"`, `"release"` and `"system"`, which describe the desktop program. `STOCKHISTORY` stays unsupported by design, with the other external data functions.
