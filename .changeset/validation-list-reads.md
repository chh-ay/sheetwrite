---
"@sheetwrite/core": patch
"@sheetwrite/xlsx": patch
---

Data validation reads each list source once per check. Before, each list rule read its source again, one cell at a time, for each checked cell, and a typed entry was checked twice. With 300 list rules over a column, one entry read about 20 million cells, and a fill took minutes.

- The grid's check of an entry and the store's check when it is written are one check, as are the checks of a paste that keeps the target's rules. Each reads a source with one window read and compares an entry with a set of its items.
- A sheet holds at most 1,000 validation rules, exported as `MAX_VALIDATION_RULES`. The XLSX reader drops the rules past it with a `validation-loss` warning. Snapshots past it are refused, and so is an operation that would add a rule past it, from this grid or a peer.
- A transaction's data validation has a budget, counted in rule tests, list cells read and formula results. A transaction that needs more is refused with a `resource-limit` issue whose `resource` is `"validation-checks"`.
