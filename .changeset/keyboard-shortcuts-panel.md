---
"@sheetwrite/core": minor
"@sheetwrite/react": minor
"@sheetwrite/vue": minor
"@sheetwrite/svelte": minor
---

Users can change the grid's keys in a Keyboard shortcuts panel (#802). Excel's keys stay the defaults.

- `config.keyboardSettings: true` turns the panel on. It opens from File › Options › Keyboard Shortcuts in the ribbon, from a gear in the compact ribbon, and from `grid.openKeyboardSettings()`. Its code loads on first use.
- The user searches commands by name or keys, or presses keys to find the command that owns them. Each row shows the keys beside Excel's default.
- The user records new keys, swaps or replaces keys another command owns, and resets one command or all of them. Undo reverts the last change, and Export and Import move the bindings as JSON. Each change applies at once.
- Keys that type, move in the sheet, or never reach the page are refused with the reason. Examples: Ctrl+W in Chrome, and ⌘⇧3 on a Mac.
- The grid emits `key-bindings-change` with the bindings that differ from Excel's. The host stores them and passes them back through `config.keyboard.bindings`. The adapters forward the event as `onKeyBindingsChange` in React and Svelte, and as `@key-bindings-change` in Vue.
- `keyboardSettings: { locked: [...] }` shows commands read-only. New types: `KeyBindings` and `KeyboardSettingsOptions`.
