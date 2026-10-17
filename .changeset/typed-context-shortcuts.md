---
"@sheetwrite/core": patch
---

Add declarative keyboard bindings and platform-aware shortcut labels. Context menus and toolbar titles use the same bindings.

API change: `ContextMenuItem.shortcut` now accepts a bound action name, such as `"copy"`, or a typed key combination, such as `{ key: "c", mod: true }`. Replace free-text shortcut strings with one of these forms. Use `config.keyboard.bindings` to change or disable an action's keys.

Document `highlightCells(null)` to clear temporary highlights. Update showcase menus for their tasks and add a clear action and host event log entries to the Vanilla highlight menu.
