---
"@sheetwrite/core": patch
---

Keep sheet tab scrolling inside the tab strip. Mounting a workbook no longer scrolls the surrounding page. Keyboard navigation still reveals the selected tab.

The sheet options menu now stays open when another part of the page scrolls. It still closes when a scroll moves the options button. Before, any scroll on the page, such as a growing event log, closed the menu and dropped keyboard focus.
