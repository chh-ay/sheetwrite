---
"@sheetwrite/core": minor
---

A selected cell with a list validation rule shows a dropdown arrow just right of it, as in Excel; clicking the arrow opens the list, and clicking it again closes it. Alt+Down still opens the list.

Typing in a list cell opens the list with the typed text in a box over the cell, and the list keeps only the items that contain the text, ignoring case, as Excel's AutoComplete for dropdown lists does. Typing while the list is open filters it the same way. Down and Up highlight an item; Enter or Tab stores the highlighted item, or else the item the text names, or else the text as typed, which the rule then checks. A formula typed with `=` still starts in the cell editor.

F2 and a double-click on a list cell now edit its text, as in Excel, instead of opening the list.
