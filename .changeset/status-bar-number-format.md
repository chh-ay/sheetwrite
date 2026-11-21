---
"@sheetwrite/core": patch
---

The shell's status bar shows Average and Sum in the number format of the active cell, as Excel does: `Sum: $736,610` for a selection that starts on a `$#,##0` cell. Without a format they stay in Excel's General display, such as `Average: 61384.16667`. Before, they always showed in General.
