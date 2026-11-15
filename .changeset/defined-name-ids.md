---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

A formula that uses a defined name now holds the name's id instead of a copy of its formula. Defining, changing or removing a name, and row and column edits in workbooks with names, are about twice as fast, and workbooks with many name uses keep less memory. A name whose formula has relative references is read in place for each cell that uses it instead of in a copy.
