---
"@sheetwrite/core": patch
---

Undo, version restore and remote operations can give a sheet back the name History. Only a user's rename refuses it now: `Grid.renameSheet` (and the tab rename) reports the `reserved` issue, while `renameSheet` operations accept the name, as `addSheet` operations already did.
