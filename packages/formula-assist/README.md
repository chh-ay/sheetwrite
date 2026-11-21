# @sheetwrite/formula-assist

Optional formula bar add-on for `@sheetwrite/core`. While you type a formula in the formula bar, it shows the most likely rest of the formula as dimmed text after the caret. Core does not depend on this package.

## Install

```sh
npm install @sheetwrite/core @sheetwrite/formula-assist
```

```ts
import { initSheetwrite } from "@sheetwrite/core";
import { formulaAssistAddon } from "@sheetwrite/formula-assist";

await initSheetwrite({ addons: [formulaAssistAddon()] });
```

Grids created after `initSheetwrite` get suggestions in their formula bar. The cell editor keeps Excel's AutoComplete. The add-on entry only registers itself; the predictor is a separate chunk that starts loading when the grid mounts, then counts the workbook's formulas while the page is idle.

## Keys

| Key | With ghost text | Without ghost text |
| --- | --- | --- |
| Tab | Takes the whole suggestion | Inside a call that still lacks a required argument (the argument guide shows it): writes `,` and moves to the next argument. Elsewhere: Excel's Tab. |
| Ctrl+→ (also ⌥→ on macOS) | Takes one word: a function name with its `(`, a whole reference, a number, a string or an operator | Moves the caret by a word |
| Esc | Hides the suggestion until the text changes | Excel's Esc |
| Enter | Commits the typed text only | Excel's Enter |

While the function list is open, Tab takes the list's entry, as in Excel. A suggestion shows then only when it is exactly what one entry inserts, and that entry becomes the active one.

## How it predicts

Predictions are deterministic. They use no network and no AI, only the workbook. In order of strength:

1. **Neighbouring formulas.** A formula the cells above and below, or left and right, agree on once it is moved to the cell as a fill would move it.
2. **Syntax.** Closing brackets, the one function or visible sheet name the typed letters can start.
3. **The column's pattern.** The nearest formula above or below in the same column, inside the same block of filled cells, moved to the cell.
4. **The workbook's formulas.** The formulas of every visible sheet, counted by shape; the most common one that fits the typed text, once it holds most of those that do.

The add-on counts the workbook's formulas in idle time, keeps the count current as cells change, reads visible sheets only, and keeps the count in memory only: at most 100,000 formula cells and 5,000 different formulas per workbook.

Argument roles, repeats within a formula, the AutoSum range, range ends, the formulas typed in the session and the same cell on other sheets were measured too, and saved nothing, so they are not part of it.

Each kind of candidate carries the share of such candidates that were right on a benchmark of real workbooks. A suggestion shows only when it is likely enough and clearly ahead of the next one. `bench/README.md` describes the benchmark and its bar.
