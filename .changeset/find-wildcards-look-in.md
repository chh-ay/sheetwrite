---
"@sheetwrite/core": minor
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
---

Find takes Excel's wildcards and looks in formulas by default, as Excel's Find does.

- `*` matches any run of characters, `?` one character, and `~` makes the next `*`, `?` or `~` literal. A search for a literal `*` or `?` now needs `~*` or `~?`.
- A formula cell is searched by its formula text unless the new `SearchOptions.lookIn` is `"values"`. `grid.search("A1")` finds `=A1*2`, and a search that used to match a formula's result needs `lookIn: "values"`.
- Replace rewrites formula text when looking in formulas, and replaces what a wildcard pattern matches. A replacement that would leave a formula the engine cannot read leaves that cell unchanged.
- `SheetwriteStore.searchCells` and `searchCellsFlat` take the same `lookIn` option, and the engine's `search` takes a sixth argument, `formulas`.
