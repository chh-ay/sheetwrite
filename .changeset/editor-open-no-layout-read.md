---
"@sheetwrite/core": patch
---

Opening the cell editor no longer reads the editor's style and layout back. A one-line value takes the cell's height; only text with line breaks measures the editor, once per edit. On a 100,000-row sheet, opening the editor takes about a quarter less time and an edit commit about a seventh less. A long line now scrolls with the caret without a horizontal scrollbar, as in Excel and as before 0.7.0; on systems with classic scrollbars the editor no longer grows by a scrollbar's height.
