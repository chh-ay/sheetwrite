---
"@sheetwrite/core": minor
---

Add Data › Data Tools › Manage Data Model and Relationships to the full ribbon, the compact ribbon and the toolbar (#229). Both open the data model panel, which loads on first use: it lists the workbook tables and the relationships with their key status, and creates, edits and deletes relationships as single undo steps. Manage Data Model appears when the workbook has a table, and Relationships when it has two. As Excel does, the panel does not keep a relationship whose lookup keys repeat or whose key types differ.
