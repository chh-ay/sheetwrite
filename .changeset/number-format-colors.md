---
"@sheetwrite/core": patch
---

A number format's color now paints the number, as in Excel: `#,##0;[Red]-#,##0` shows a negative number in red. The eight color names and `[Color1]` to `[Color56]` from Excel's default palette work, and the color takes priority over the cell's font color. A condition such as `[Red][<=100]0;[Blue][>100]0` now chooses the section. Before, the color and the condition had no effect.
