---
"@sheetwrite/core": patch
"@sheetwrite/formula-assist": patch
---

New optional package `@sheetwrite/formula-assist`. `formulaAssistAddon()` predicts the rest of the formula typed in the formula bar and shows it as dimmed text after the caret. Tab takes all of it, Ctrl+→ (also ⌥→ on macOS) takes one word, and Esc hides it until the text changes. When no suggestion shows, Tab inside a call that still lacks a required argument (the argument guide shows it) writes `,` and moves to the next argument, where Excel's Tab could only refuse the formula; everywhere else Tab is Excel's. Predictions come from the workbook alone, without network or AI: a neighbouring formula that the cells above and below, or left and right, agree on, moved to the cell; and syntax (the only function or sheet the typed letters can start, closing brackets). A suggestion shows only when the benchmark measured it right at least 90% of the time and it is clearly ahead of the next one. The add-on entry only registers itself; the predictor is a separate chunk that starts loading when the grid mounts, outside the first load of the page.

Core gives add-ons `formulaSuggestions(suggester)` in their grid hook, with the `FormulaSuggester`, `FormulaSuggestionSession`, `FormulaEdit` and `FormulaSheetReads` contracts, and draws the ghost text in the formula bar. The cell editor keeps Excel's AutoComplete, and without a suggester the formula bar's keys are unchanged. `openFormulaEdit`, `shownSuggestion` and `suggestionWordEnds` in `@sheetwrite/core/testing` run a suggester without a grid.
