---
"@sheetwrite/core": minor
---

The pivot field list shows the columns of related tables (#229). A pivot over a table gets one **Related** section for each table that its table reaches through relationships. Adding a related column turns the table source into a model source in the same undo step, and keeps the indices of the fields in use. Related fields show their table name, for example `Customers › Region`.
