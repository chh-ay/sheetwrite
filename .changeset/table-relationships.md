---
"@sheetwrite/core": minor
---

Add a workbook data model: one-to-many relationships between workbook tables, saved in `workbook.dataModel.relationships` (#229).

- New types `DataModel`, `TableRelationship` and `TableColumnRef`. A relationship names a many-side (`from`) and a one-side (`to`) column by stable table and column IDs, as Excel's `x15:modelRelationship` does.
- New document operations `setRelationship` and `removeRelationship`, and the store methods `getRelationships()`, `setRelationship()` and `removeRelationship()`. Each change is one undo step and is saved and synchronized.
- A new relationship needs existing columns in two different tables. At most one relationship joins two tables, and relationships form no cycle. A relationship whose table or column is removed stays saved, so undo restores a working model.
- Rebase reports a conflict for two concurrent relationship changes, and for a pending relationship whose table a concurrent edit changes or removes.
- `RowBridgeMetadataDelta.metadata` has the new value `"relationship"`.
