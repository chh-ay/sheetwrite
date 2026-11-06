---
"@sheetwrite/core": patch
---

A compact or automatic ribbon no longer moves the grid when it arrives. The grid and `createSpreadsheetShell` reserve the height the ribbon will take, compact or full for the host's width, instead of the full height, so on a narrow host the rows below no longer jump up 56 px after the ribbon chunk loads.
