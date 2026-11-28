---
"@sheetwrite/core": minor
"@sheetwrite/formulas": minor
"@sheetwrite/xlsx": patch
---

Pivot tables can use fields from related tables (#229).

- New pivot source `{ model: { table, fields } }`. `table` is the base (many-side) table; each field names a table and column by stable IDs. A field's table must be the base table or a table that the base reaches through many-to-one relationships.
- The output equals a pivot over the lookup-flattened table: an unmatched or blank key gives a blank related value, and an error in a many-side key carries that error. A duplicate one-side key or a key type mismatch shows `#VALUE!`; a missing table, column or relationship shows `#REF!`.
- The full engine reads related values through sorted key indexes built for each pivot rebuild, and keeps no index or row map between recomputes. An edit in a related table rebuilds the pivot.
- XLSX export keeps a model pivot in Sheetwrite metadata and warns, because Excel needs a data-model binary for it.
