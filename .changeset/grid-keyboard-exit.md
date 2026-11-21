---
"@sheetwrite/core": minor
---

The keyboard can always leave the grid. Tab and Shift+Tab still move between cells, as in Excel, and Excel's own way out now works:

- F6 and Shift+F6 move to the next or previous part of the window. In the spreadsheet shell the parts are the ribbon or toolbar, the formula bar, the sheet, the sheet tabs and the status bar, in a cycle. A grid on its own moves the focus to the page's next or previous control.
- Escape then Tab or Shift+Tab, when no cell is being edited, moves the focus to the page's next or previous control.
- The grid's host gets an `aria-description` that names these keys once, when the focus enters the grid. A host that sets its own keeps it.
- The Keyboard shortcuts panel says that F6 and Shift+F6 always move the focus, and refuses them as a command's keys.
