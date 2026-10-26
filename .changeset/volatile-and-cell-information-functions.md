---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
"@sheetwrite/core": minor
---

Add `RAND` and `RANDBETWEEN`, and make volatile formulas recalculate after each edit. `RAND`, `RANDBETWEEN`, `TODAY` and `NOW`, and the formulas that read them, now recalculate in every transaction that changes a cell, as in Excel. Before, they recalculated only when the host called `recalculateVolatile`. A transaction without cell changes recalculates nothing. Workbooks without volatile formulas do no extra work, and the extra work of an edit grows only with the number of volatile formulas and their dependents. `TODAY` and `NOW` still read the time only from `recalculateVolatile`.

`RANDBETWEEN(bottom, top)` rounds `bottom` up and `top` down. It returns `#NUM!` for an empty interval and `#VALUE!` for a bound that is not a number.

Add `FORMULATEXT`, `ISFORMULA`, `HYPERLINK` and `CELL`. `FORMULATEXT` returns the formula of a cell, or `#N/A` when the cell holds no formula. `HYPERLINK` returns its friendly name, or the link when there is no friendly name; the grid does not open the link. `CELL` supports the info types `address`, `col`, `contents`, `row` and `type`; other info types return `#VALUE!`. Formula autocomplete offers all six functions.
