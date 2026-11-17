---
"@sheetwrite/core": patch
---

Typing a text entry completes it from the column, as Excel's AutoComplete does. When exactly one distinct text entry in the filled cells directly above and below (up to the first empty cell, and at most 100,000 rows each way) begins with the typed text, ignoring letter case, the editor shows the rest of it selected. Enter or Tab stores the entry in its own letter case; Backspace or Delete removes the added text. Formulas, numbers, dates and logical values are never completed, and IME composition completes only once it ends. The engine reads the column's distinct values once per edit, on the first typed key, and the code loads with the first edit. `config: { autoComplete: false }` turns it off, as Excel's "Enable AutoComplete for cell values" does.
