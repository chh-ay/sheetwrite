---
"@sheetwrite/core": patch
---

`HistoryArchive.restoreVersion` with a `sync` coordinator at the archive head reads and writes only the checkpoint pages where the version and the head differ, instead of rebuilding the whole version. The restored document and its undo are the same as before.
