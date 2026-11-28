---
"@sheetwrite/core": patch
---

Find and Replace match a number in a number format by its text, as Excel does: Look in: Formulas by the formula bar's text (`1/15/2026`, `15%`), Look in: Values by the text the cell shows (`$4.50`). Before, they compared the stored number, so a date or percentage typed in a new sheet could not be found by what was typed, and `0.15` found a cell that shows `15%`. Replace rewrites that text and reads it back as typed. Sheets with no number format keep the engine's scan alone.
