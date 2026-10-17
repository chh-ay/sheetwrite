---
"@sheetwrite/core": patch
---

Built-in toolbar, context-menu, and find buttons show busy state while commands run and show errors when commands fail. Repeated starts of a pending command are ignored. Blocked clipboard access shows a recovery message.

`GridActions.exportXlsx()` returns a promise that never rejects. Built-in export failures show an alert and emit `export-error`; the event format can be `"csv"` or `"xlsx"`. Direct `Grid.exportXlsx()` calls still reject on failure.
