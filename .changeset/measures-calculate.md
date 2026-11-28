---
"@sheetwrite/core": minor
"@sheetwrite/formulas": minor
---

Measures can use `CALCULATE(expression, filter, …)` to evaluate an expression in a changed filter context (#230).

- A filter compares one model column with a value (`Customers[Region]="West"`, `Orders[Month]>=3`) and replaces the cell's row items, column items and report filter on that column, or is `ALL(Table[Column])` and removes them. Filters on other columns stay, and filters still flow from the one side to the many side only.
- Other filters (`ALL(Table)`, `FILTER`, a comparison of two columns) and a `CALCULATE` inside another show `#VALUE!`. In cell formulas `CALCULATE` and `ALL` stay unknown functions (`#NAME?`), as in Excel.
