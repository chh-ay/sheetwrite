---
"@sheetwrite/core": minor
---

The built-in context menu is shorter and grouped. Cut, Copy and Paste come first, then Insert, Delete and Clear contents, then Row and Column, then Merge, then the note. Insert, Delete, Row, Column and Merge open submenus. Each row shows its command icon.

The menu now works from the keyboard. It takes focus when it opens: Up and Down move, Home and End jump, Enter or Space runs a row, Right opens a submenu, Left or Escape closes it, and focus returns to the grid when the menu closes.

Custom menus can use the same features. `ContextMenuItem.items` makes a row open a submenu, and `ContextMenuItem.icon` sets its glyph. Built-in actions have default icons, and `config.icons` overrides apply. Rows without an `id` now get `data-context-menu-item` set to their action name.
