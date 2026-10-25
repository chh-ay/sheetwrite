---
"@sheetwrite/wasm": patch
---

Fix render windows that painted columns past the sheet's last column, rows past its end, and unloaded cells with the first styled cell's fill and borders. Those cells now read as unstyled.
