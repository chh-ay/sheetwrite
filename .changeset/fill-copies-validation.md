---
"@sheetwrite/core": patch
---

The fill handle, Ctrl+D and Ctrl+R copy each source cell's data validation rule to the cells they fill, in place of those cells' own rules, and land the filled values unchecked, as Excel's fill does. Fill Formatting Only copies the rules too; Fill Without Formatting keeps the filled cells' own. A copied rule's relative references now shift to where a paste or fill lands it, as Excel's do, and a rule that a paste splits keeps its formulas where its cells are.
