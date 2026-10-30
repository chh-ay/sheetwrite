---
"@sheetwrite/core": minor
"@sheetwrite/xlsx": minor
---

Add three cell style fields: `fontFamily` (with the theme font as fallback), `verticalAlign` (`top`, `middle` or `bottom`), and a per-cell `numberFormat` that overrides the column's format; `General` opts a cell out of it. Paint, column auto-fit, snapshots, clipboard and hyperlink styles all honor them, and `isCellFontFamily` exposes the font-name rule. XLSX import and export round-trip all three: a column that mixes number formats keeps each cell's format instead of dropping them, and only fonts other than the workbook default become a cell `fontFamily`.
