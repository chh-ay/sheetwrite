---
"@sheetwrite/core": patch
---

In Safari (WebKit), a ribbon or toolbar menu opened from the keyboard stays open. Before, focus on the first menu item scrolled the page, and the scroll closed the menu at once. A page scroll now closes a ribbon or toolbar popup only when its button moves, so a late scroll event for an earlier scroll does not close a menu that just opened.
