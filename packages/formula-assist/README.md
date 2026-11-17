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

Grids created after `initSheetwrite` get suggestions in their formula bar. The cell editor keeps Excel's AutoComplete. The add-on entry only registers itself; the predictor loads on the first formula edit.

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

1. **Neighbouring formulas.** The formulas next to the cell, moved to it as a fill would move them.
2. **Syntax.** Closing brackets, the one function or sheet name the typed letters can start.

Argument roles, repeats within a formula, the AutoSum range and range ends were measured too, and saved nothing, so they are not part of it.

Each kind of candidate carries the share of such candidates that were right on a benchmark of real workbooks. A suggestion shows only when it is likely enough and clearly ahead of the next one. `bench/README.md` describes the benchmark and its bar.
