---
"@sheetwrite/core": patch
---

Add declarative keyboard bindings, custom key combinations and platform-aware shortcut labels. Context menus and toolbar titles use the same bindings.

API change: a key combination is a string such as `"Mod+Shift+K"` or `"Ctrl+Alt+Delete"`, or an object such as `{ key: "k", mod: true, shift: true }`. `Mod` is Command on macOS and Control elsewhere; `Ctrl` and `Meta` are always literal. `ContextMenuItem.shortcut` accepts a bound action name, such as `"copy"`, or a key combination. Replace free-text shortcut hints with one of these forms. Use `config.keyboard.bindings` to change or disable an action's keys.

A context-menu item with a key combination and an `onClick` now runs `onClick` when the grid has focus and the user presses that combination. A combination with `Mod`, `Ctrl` or `Meta` also works in the inline editor. Two commands with the same combination throw a `SheetwriteError` with code `shortcut-conflict`; a malformed combination throws `invalid-shortcut`.

Document `highlightCells(null)` to clear temporary highlights. Update showcase menus for their tasks and add a clear action and host event log entries to the Vanilla highlight menu.
