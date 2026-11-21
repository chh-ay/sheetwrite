---
"@sheetwrite/core": patch
"@sheetwrite/formula-assist": patch
---

The formula bar keeps a suggestion while you type it. After `=` shows `SUM(D2:D11)`, typing `S` leaves `UM(D2:D11)`, and a character that differs takes it away. While the function list is open, a new suggestion shows when it starts with what one entry inserts, and that entry becomes the selected one; before, it showed only when it was exactly that entry's text. Tab takes the suggestion while it shows; once you move to another entry of the list, Tab takes that entry, as in Excel. `shownSuggestion` in `@sheetwrite/core/testing` takes the ghost on screen as an optional fourth argument, and the `GhostOnScreen` type describes it.
