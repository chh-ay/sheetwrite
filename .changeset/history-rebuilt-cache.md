---
"@sheetwrite/core": minor
---

`HistoryArchive` keeps the last version that `readVersion` or `restoreVersion` rebuilt, so the version history panel's select, compare and restore rebuild the selected version once instead of three times. A moved head is never reused, also when another tab moved it. `HistoryArchive.releaseMemory()` frees the kept version; the panel calls it when it closes and when its grid trims memory, through the new optional `GridPanel.trimMemory()` that `Grid.trimMemory()` calls on the open panel. `HistoryPanelArchive` gets the matching optional `releaseMemory()`.
