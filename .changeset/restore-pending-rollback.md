---
"@sheetwrite/core": patch
---

Roll back restored pending commits if a later stored record cannot apply. Keep each record's paged acknowledgement revision and preserve user undo history when restore fails.
