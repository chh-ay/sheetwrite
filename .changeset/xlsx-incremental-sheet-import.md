---
"@sheetwrite/xlsx": patch
---

XLSX import now parses each worksheet from bounded inflated chunks instead of building a whole-worksheet XML tree, and releases parsed cells as soon as the snapshot holds them. On a generated 200,000 × 8 workbook, five interleaved rounds against a baseline given the same early cell release measured median peak RSS 1,254 MiB → 994 MiB (buffered) and 1,068 MiB (`fromXlsxWorkbookFile`); single runs varied by up to about 400 MiB, and the highest candidate run (1,491 MiB) was above the highest baseline run. Character references longer than 31 characters are now rejected wherever they fall in the file.
