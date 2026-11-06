---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

A sheet rename, a sheet delete, a row or column insert or delete, a tab move and a table change keep the formula text as the user wrote it, as Excel does: only the references change. Before, the engine wrote the whole formula again with parentheses around every operator, so `=Sales!A1+1` became `=('Sales Data'!A1+1)`. The same holds for defined-name formulas. The engine writes the new references when the text is read, so a rename over 100,000 formulas takes 116 ms instead of 189 ms, and a row insert 24 ms instead of 88 ms.
