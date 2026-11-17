---
"@sheetwrite/core": minor
---

Glyphs drawn for the 0.7.0 commands that showed a reused glyph or none:

- **Insert Cells… and Delete Cells…** join Home › Cells › Insert and Delete (and Insert › Rows & Columns) and the context menu's Insert and Delete submenus, with the new `insertCells` and `deleteCells` glyphs. They open Excel's Insert or Delete dialog, as Ctrl/Cmd + + and Ctrl/Cmd + - do. New context-menu actions: `insertCells` and `deleteCells`.
- **Format Cells…** joins Home › Cells › Format, and it and the context menu's Format cells… show the new `formatCells` glyph instead of the row-height glyph.
- **AutoFilter header buttons** draw `filterArrow`, or `filterActive` (a funnel beside the arrow) on a filtered column, from the icon sheet, in its stroke and corners. Before, they were a filled triangle and a filled funnel, and the filtered button lost its arrow. They now need `icons.css`, which `styles.css` includes.
- **Sort & Filter**'s glyph is the sort arrow beside a funnel, so the menu no longer shows the same glyph as its Filter item.
- **PivotChart** shows the new `pivotChart` glyph (columns and the pivot's turning arrow) instead of Chart's glyph, which it sat beside.
- New on the icon sheet for commands that follow: `insertSheet`, `moveCopySheet` and `tabColor` for the sheet tab menu, and `settings` and `keyboardShortcuts`.
