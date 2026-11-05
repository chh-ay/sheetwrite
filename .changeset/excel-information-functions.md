---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
"@sheetwrite/core": minor
---

Both engines add Excel's information functions `ERROR.TYPE`, `ISEVEN`, `ISODD`, `ISNONTEXT`, `ISREF`, `SHEET` and `SHEETS` (#278). `SHEET` and `SHEETS` count every sheet in tab order, hidden sheets too, and recompute when a sheet is added, removed, renamed or moved.

`INFO` and `STOCKHISTORY` stay unsupported by design: formula evaluation does not read the host environment or query external data providers.
