---
"@sheetwrite/core": minor
---

Measures have a command and a panel, and the PivotTable field list lists them (#230).

- **Data › Data Tools › Measures** opens the Measures panel. It lists the measures under their home tables, each with a note when its formula does not parse or its table is gone, and has a form to create, edit and remove measures. Each change is one undo step.
- The PivotTable field list shows the measures a pivot does not use yet under **Measures: Table**, with **Add to Values**. A pivot over one table becomes a model pivot with the same fields when a measure is added.
