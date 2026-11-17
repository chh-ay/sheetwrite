---
title: Keyboard shortcuts panel
description: Let users change the grid's keys in a Keyboard shortcuts panel, and store their choice.
---

The Keyboard shortcuts panel lets the user change the keys of the grid's built-in commands. It opens from File › Options in the ribbon, from the gear of the compact ribbon, or from your own menu. Excel's keys stay the defaults: a user who changes nothing gets exactly the keys on [Selection and keyboard](/docs/features/grid/selection-and-keyboard/#keyboard-navigation).

Shortcuts are a user preference, not part of the workbook. The grid applies each change at once and emits `key-bindings-change`; you store the bindings and pass them back through `config.keyboard.bindings`.

```ts prelude="core" partial="requires the grid from Full setup" title="Turn the panel on and keep the user's keys"
const saved = localStorage.getItem("sheetwrite-keys");
grid.setConfig({
  keyboardSettings: true,
  keyboard: { bindings: saved ? JSON.parse(saved) : {} },
});
grid.on("key-bindings-change", ({ bindings }) => {
  localStorage.setItem("sheetwrite-keys", JSON.stringify(bindings));
});
```

`bindings` holds only the commands whose keys differ from Excel's defaults, so it is `{}` after Reset all. Its shape is the one `config.keyboard.bindings` takes, and the grid checks it for conflicts as it does any host binding.

## What the user can do

| In the panel | What happens |
| --- | --- |
| Type in the search box | The list shows the commands whose name, group or keys match: `fill`, or `ctrl+shift+l`. |
| Press keys in the search box | The list shows the command those keys run. Ctrl+A, C, V, X, Z and Y and the arrows still edit the search text. |
| Show changed only | The list shows only the commands with keys other than Excel's. |
| Click a key, or + | Recording starts and is announced. The next keys pressed become the command's keys. Escape stops recording. |
| × beside a key | The command loses those keys. |
| Reset | The command gets Excel's keys back. Reset all does it for every command. |
| Undo | Restores the keys from before the last change. |
| Export / Import… | Saves the bindings as a JSON file, or loads one. An import is one change. |

Each column has a job:

- **Command:** the name the ribbon uses, grouped as in the ribbon.
- **Keys:** what the command runs on now, shown as Ctrl, Shift and Alt, or as ⌘ ⇧ ⌥ ⌃ on a Mac.
- **Excel default:** the keys Excel uses, so the user always sees what they moved away from.

Keys are saved as `Mod+…` when the user holds Ctrl, or ⌘ on a Mac, so one binding works on both.

### Proposals beyond Excel

Excel has no general shortcut editor. Each of these sits on top of Excel's keys and changes nothing for a user who doesn't use it:

- **Press keys to search:** answers "what does Ctrl+Shift+L do?" with one key press, without knowing the command's name.
- **Excel's default beside each binding:** the user can always see what they changed, and Reset is one click away.
- **Undo after every change:** a wrong key press costs nothing, so trying keys out is safe.
- **Show changed only:** reviewing a setup, or sharing it, means reading a short list instead of 34 rows.
- **Export and import:** the user's keys move between machines, and a team can share one setup.

## When the keys are taken

If the new keys already belong to another command, the panel names it, for example "Ctrl+I is assigned to Italic.", and offers three choices:

- **Swap:** the other command takes the keys you replaced. This is offered when you changed a key, not when you added one.
- **Replace:** the other command loses the keys.
- **Cancel:** nothing changes.

Each choice is one change and one `key-bindings-change` event.

The panel refuses keys it can't use, and says why:

- **Keys without Ctrl, ⌘ or Alt** type into the cell. Only function keys, Delete and Insert can stand alone.
- **Keys that move or edit in the sheet**, such as arrows, Enter, Tab, Space, Page Up and F2, keep their Excel meaning.
- **Keys the browser or the operating system keeps** never reach the page.

The keys the browser or the operating system keeps:

| Where | Keys | Source |
| --- | --- | --- |
| Chrome and Edge, Windows and Linux | Ctrl+N, Ctrl+Shift+N, Ctrl+T, Ctrl+Shift+T, Ctrl+W, Ctrl+Shift+W, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp, Ctrl+PageDown, Ctrl+F4 | Chromium's [reserved commands](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/ui/accelerator_table.cc) |
| Chrome and Edge, macOS | ⌘N, ⌘⇧N, ⌘T, ⌘⇧T, ⌘W, ⌘⇧W, ⌃Tab, ⌃⇧Tab, ⌃PageUp, ⌃PageDown, ⌘⇧[, ⌘⇧], ⌘⌥←, ⌘⌥→ | the same list, with Chromium's [Mac bindings](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/global_keyboard_shortcuts_mac.mm) |
| Firefox | Ctrl or ⌘ with N, T, W, Shift+W and Shift+P; Ctrl+Q on Linux; Ctrl+Shift+Q on Windows | Firefox's [reserved keys](https://github.com/mozilla-firefox/firefox/blob/main/browser/base/content/browser-sets.inc.xhtml) |
| macOS, every browser | ⌘Q, ⌘H, ⌘M, ⌘Tab, ⌘`, ⌘Space, ⌘⇧3, ⌘⇧4, ⌘⇧5, ⌘⌥Esc, ⌃ with an arrow | Apple's [Mac keyboard shortcuts](https://support.apple.com/en-us/102650) |
| Windows, every browser | the Windows key with anything, Alt+Tab, Alt+F4, Ctrl+Alt+Delete, Ctrl+Shift+Esc | Microsoft's [Keyboard shortcuts in Windows](https://support.microsoft.com/en-us/windows/keyboard-shortcuts-in-windows-dcc61a57-8ff0-cffe-9796-cb9706c75eec) |
| Linux, every browser | the Super key with anything, Alt+Tab, Alt+F2, Alt+F4, Ctrl+Alt+Delete | GNOME's [Useful keyboard shortcuts](https://help.gnome.org/users/gnome-help/stable/shell-keyboard-shortcuts.html) |

Chromium passes its reserved keys to the page in full screen and in installed-app windows, but the panel still refuses them, because they don't work in an ordinary tab. Safari publishes no list of reserved keys, so in Safari the panel refuses only the macOS keys.

Excel's own defaults stay, even where they never arrive. On a Mac, ⌘⇧3 takes a screenshot, so the Date row says so and the user can choose other keys.

## Lock commands

Pass `locked` to show some commands read-only. A swap or a replace never changes a locked command either; the panel then offers only Cancel.

```ts prelude="core" partial="requires surrounding host state" title="Keep Copy and Paste on their keys"
grid.setConfig({ keyboardSettings: { locked: ["copy", "paste"] } });
```

If `config.keyboard` is `false` or a function, your app handles the keys itself, and the panel shows every command read-only.

## Open it from your own menu

`grid.openKeyboardSettings()` opens the panel when `keyboardSettings` is set, and does nothing otherwise. The panel's code loads the first time it opens, so a grid that never opens it doesn't download it. Keys pressed while it loads are not lost.

```ts prelude="core" partial="requires surrounding host state" title="A Settings button in your app"
document.querySelector("#keyboard-settings")?.addEventListener("click", () => {
  grid.openKeyboardSettings();
});
```

## Framework adapters

The adapters pass the event on as `onKeyBindingsChange` (React and Svelte) and `@key-bindings-change` (Vue):

```tsx prelude="react" partial="requires React component state" title="React"
<SheetwriteGrid
  workbook={workbook}
  config={{ keyboardSettings: true, keyboard: { bindings } }}
  onKeyBindingsChange={(event) => setBindings(event.bindings)}
/>
```

```vue prelude="vue" partial="requires Vue component state" title="Vue"
<SheetwriteGrid
  :workbook="workbook"
  :config="{ keyboardSettings: true, keyboard: { bindings } }"
  @key-bindings-change="(event) => bindings = event.bindings"
/>
```

```svelte prelude="svelte" partial="requires Svelte component state" title="Svelte"
<SheetwriteGrid
  {workbook}
  config={{ keyboardSettings: true, keyboard: { bindings } }}
  onKeyBindingsChange={(event: GridEvents["key-bindings-change"]) => bindings = event.bindings}
/>
```

## Accessibility

- **The dialog:** a modal labelled "Keyboard shortcuts". Tab and Shift+Tab stay inside it, and the search box has focus when it opens.
- **Recording:** the key being recorded is a button with focus. The status line announces "Recording keys for Bold. Press the new keys, or Escape to cancel."
  - Escape stops recording, and a second Escape closes the dialog.
  - Tab stops recording and moves on, so the keyboard is never trapped.
- **Conflicts:** the conflict choices are a labelled group, and the first choice takes focus.
- **Status line:** results, refusals and undo are announced there.
- **Closing:** focus returns to the element that opened the panel.
