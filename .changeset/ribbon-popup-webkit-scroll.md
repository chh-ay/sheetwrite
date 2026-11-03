---
"@sheetwrite/core": patch
---

In Safari (WebKit), a ribbon or toolbar menu opened from the keyboard stays open. Before, focus on the first menu item scrolled the page, and the scroll closed the menu at once. A page scroll now closes a ribbon or toolbar popup only when its button moves, so a late scroll event for an earlier scroll does not close a menu that just opened.

Ribbon tab and mode changes now finish their layout before the next command can open a menu. A late toolbar size notification no longer closes an open More commands group when its width has not changed. Keyboard menus stay open until dismissed, and Escape returns focus to their button.
