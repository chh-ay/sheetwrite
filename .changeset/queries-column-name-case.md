---
"@sheetwrite/queries": patch
---

The query engine rejects output column names that differ only in letter case in any alphabet, such as `Ä` and `ä`, with `duplicate-column`, as Excel table headers must differ in more than case; before, only ASCII letter case was ignored and the refresh could not write the table.
