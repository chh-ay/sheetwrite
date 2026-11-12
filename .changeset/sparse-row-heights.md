---
"@sheetwrite/core": patch
---

Resizing a row no longer costs time or memory for every row of the sheet (part of #625). Row geometry keeps only the rows whose height differs from the default, so the first resized row of a 1,000,000-row sheet no longer allocates 16 MB. A committed height change, its undo, and a cancelled resize drag update the row index in place instead of rebuilding it. Row positions, hit tests and painted heights are unchanged.
