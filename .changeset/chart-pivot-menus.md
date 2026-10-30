---
"@sheetwrite/core": minor
---

Reach charts and pivot tables from the ribbon and the context menus. **Insert › Chart** is a split button: the face inserts a column chart, and its menu inserts any of the seven kinds, each with its own glyph. Right-click a chart (or press Shift+F10 or the ContextMenu key on it) for **Edit chart** and **Delete chart**; a read-only grid offers only Edit chart. Right-click a cell of a pivot table's output for **PivotTable Fields**, which opens its field list. The new context-menu action `pivotFields` and `grid.actions.showPivotFields()` do the same from host menus and code. `ContextMenu`'s glyphs follow `config.icons` overrides as before.
