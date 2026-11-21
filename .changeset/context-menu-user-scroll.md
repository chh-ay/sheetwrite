---
"@sheetwrite/core": patch
---

The context menu closes when the user scrolls: a mouse wheel, a touch drag, Page Up or Page Down. It stays open through the page's own scrolls. Before, it closed on any scroll. On a slow machine, a right-click on a grid that had just taken the focus could open the menu and close it at once, because the focus's scroll into view arrived after the menu opened.
