---
"@sheetwrite/core": patch
"@sheetwrite/xlsx": patch
---

Keep workbook layout and link text stable when another spreadsheet app saves an XLSX file.

Import cells with no XLSX vertical alignment at the bottom, as Excel shows them. Import centered cells with the Sheetwrite default alignment. Export the Sheetwrite default as centered alignment. This changes how imported Excel cells with no alignment setting appear.

Use the OOXML column width conversion. Keep automatic row heights automatic. Use cell text when a hyperlink has no display text. Export hyperlink colors and underlines in cell styles so other apps can keep them.

Native fixture widths now match what Excel shows. Remove the old extra 5 pixels. The changed widths, in pixels, are: 19 → 14, 25 → 20, 26 → 21, 40 → 35, 44 → 39, 52 → 47, 53 → 48, 60 → 55, 64 → 59, 78 → 73, 85 → 80, 86 → 81, 94 → 89, 107 → 102, 114 → 109, 116 → 111, 119 → 114, 132 → 127, 154 → 149, 156 → 151, 162 → 157, and 171 → 166.

Keep explicit cell font colors and underline settings when a hyperlink has no style. Use the default link look only for font properties the cell does not set.
