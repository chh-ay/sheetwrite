---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

A "contains" filter that ignores case now matches non-ASCII letters in either case when more than one column filter applies, as in Excel: "É" finds both "École" and "école". Before, such a filter matched no row once a second filter was added.
