---
"@sheetwrite/core": minor
---

Insert and edit charts and pivot tables from the ribbon. **Insert › Chart** makes a chart from the selection and opens the chart panel (kind, ranges, titles, legend). **Insert › PivotTable** asks for a destination and opens the field list, where fields move between Rows, Columns, Values and Filters by drag or by keyboard; selecting a cell in a pivot's output opens it again. The panels open beside the grid with `grid.openPanel()`, which hosts can also use for their own panels. Each change is one undo step. With the default engine, Insert › PivotTable is disabled and says that pivot tables need the full engine. The panel code loads on first use.
