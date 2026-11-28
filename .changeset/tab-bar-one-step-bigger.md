---
"@sheetwrite/core": patch
---

The sheet-tab bar is one step bigger, the same in the shell and in the grid's own tab bar. The tab names, the ⋯ menu, the + button and the shell's status text use the theme's cell font one step up the type scale (13 px cells give 14 px text), the + and ⋯ icons grow with that text, and the bar is 30 px tall instead of 28 px, with the same padding. The grid area above it is 2 px shorter. The shell's bottom row reads the new `--sheetwrite-tab-font` custom property, which the shell and the grid seed from the theme.
