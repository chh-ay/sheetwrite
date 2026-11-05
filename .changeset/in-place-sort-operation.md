---
"@sheetwrite/core": minor
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
---

Sort cells in place, as Excel does. `store.sortRange(range, keys, { hasHeader })` moves the rows of a range in one undoable, synced transaction with the new `permuteRows` document operation and the new `"sort"` commit reason.

- Values, formulas, cell styles, notes and one-row hyperlinks move with their row. Row heights, hidden rows, conditional formats, validation rules and protected ranges keep their addresses.
- A formula in a moved row is adjusted for the move of its own row: relative row references without a sheet name move with the row; absolute rows and references with a sheet name stay. Formulas elsewhere keep their references and read the new values.
- Hidden and filtered-out rows keep their place. Identically sized merged cells sort as whole records; other merged layouts reject the sort. A spill range that the sort would move only in part rejects the sort. A sort in a table must cover its whole body.
- The operation carries the row order (one `u32` per row, base64), so every collaborator applies the same order. A concurrent edit inside the sorted range is a rebase conflict. Undo applies the inverse order and restores formulas whose adjusted references left the sheet.
