---
"@sheetwrite/core": minor
---

The ribbon and the toolbar get **Formulas › Insert Function** for custom functions, 16 new glyphs for the 0.7 features, a tab row that scrolls when it is narrow, and new group dividers.

- **Insert Function** lists the functions registered with `registerFunction` (full engine), each with its signature and description as the tooltip. Picking one starts `=NAME(` in the focus cell's editor. The Formulas tab, and the command in the toolbar, show only while the store has a registered function.
- New glyphs: `insertFunction`, `defineName`, `nameManager`, `explainFormula`, `getData`, `refreshAll`, `queries`, `editLinks`, `relationships`, `dataModel`, `measure`, `dashboard`, `slicer`, `kpiCard`, `versionHistory` and `saveVersion`. `ICON_NAMES`, `IconName` and `@sheetwrite/core/icons.json` list them. They take new rows on the sheet; no published glyph moves, so a replacement sheet drawn for 0.6 still lines up.
- When the tabs do not fit, the tab row scrolls sideways instead of running under the **Compact** button. Focusing a tab with the keyboard scrolls it into view.
- The divider between ribbon groups stops short of the panel edges, so each group label reads as the caption of its controls.
