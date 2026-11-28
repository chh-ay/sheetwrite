---
"@sheetwrite/core": patch
---

Keep the store and its error helpers out of webpack's initial chunk when an app only initializes core. The lazy XLSX import and export module no longer imports the store; the grid checks that an exported sheet is complete before the lazy module runs.
