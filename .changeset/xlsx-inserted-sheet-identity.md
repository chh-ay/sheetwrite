---
"@sheetwrite/xlsx": patch
---

Import a workbook that Excel re-saved after a sheet was inserted before a known sheet. Each worksheet first takes the Sheetwrite metadata of the same name, and only unclaimed metadata is matched by position, so the inserted sheet gets a new identity instead of sharing one with the known sheet. Generated sheet IDs avoid every ID that the metadata keeps, and cell fields are restored from the same metadata sheet as the identity.
