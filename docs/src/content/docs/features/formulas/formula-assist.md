---
title: Formula assist
description: The optional formula-assist add-on predicts the rest of the formula typed in the formula bar and shows it as ghost text that Tab accepts.
---

`@sheetwrite/formula-assist` is an optional add-on. While you type a formula in the formula bar, it shows the most likely rest of the formula as dimmed text after the caret. Tab takes it.

```ts prelude="none" title="Install the add-on"
import { initSheetwrite } from "@sheetwrite/core";
import { formulaAssistAddon } from "@sheetwrite/formula-assist";

await initSheetwrite({ addons: [formulaAssistAddon()] });
```

Grids created after `initSheetwrite` show suggestions in their [formula bar](/docs/features/grid/toolbar-and-ribbon/). The add-on adds nothing to the page's first load until it is installed. Its entry only registers it, and the predictor loads on the first formula edit.

## What it adds to Excel

Excel's own keys and defaults keep working: the function list, Tab to take its entry, Enter, Esc, F2, F4 and pointing at cells. The add-on adds these on top:

- **The rest of the formula, before you type it.** Under a column of `=C4*D4`, typing `=` in row 5 shows `C5*D5`. Excel completes only function names, so you would retype what the sheet already shows. One key replaces a dozen, and you read the formula before you take it.
- **One word at a time.** Ctrl+→ takes one word of the suggestion: a function name with its `(`, a whole reference such as `Sheet2!$A$2:$A$90`, a number, a string or an operator. You keep the part you agree with and type the rest.
- **The next argument on Tab.** Inside a call that still lacks a required argument, Tab writes the `,` and moves to the next argument, where the suggestion for that argument appears. Excel's Tab can only refuse a formula with too few arguments there.
- **Where it points.** The ranges a suggestion names get a faint fill on the grid in their reference colour, before you take it. A wrong suggestion is easy to see.

## Keys

| Key | With a suggestion | Without a suggestion |
| --- | --- | --- |
| Tab | Takes the whole suggestion | Inside a call that still lacks a required argument, while the argument guide shows it: writes `,` and moves to the next argument. Everywhere else: Excel's Tab. |
| Ctrl+→ (also ⌥→ on macOS) | Takes one word | Moves the caret by a word |
| Esc | Hides the suggestion until the text changes. The add-on doesn't suggest the same formula again during this edit. | Excel's Esc |
| Enter | Commits only the text you typed | Excel's Enter |

While the function list is open, Tab takes the list's entry, as in Excel. A suggestion shows then only when it is exactly what one entry inserts, and that entry becomes the selected one. Suggestions show only while the caret is at the end of the text, with nothing selected and no IME composition open. The cell editor has no suggestions: it keeps Excel's AutoComplete.

## How it predicts

Predictions are deterministic. They use the workbook only: no network, no AI. Three signals each propose whole formulas, strongest first:

1. **Neighbouring formulas.** The formulas two cells up, down, left and right of the cell, moved to it as a fill would move them. When the formulas above and below agree, the cell almost surely continues them.
2. **The shape of the data.** Once you type a range's first cell and `:`, the end is where its block of filled cells ends, the cell Ctrl+Shift+Arrow would reach. A range along the cell's own row or column stops right before the cell.
3. **Syntax.** The one function or sheet name that the typed letters can start, and the brackets that close calls which have all the arguments they can take.

The benchmark also measured argument roles (the row's key as a lookup value) and text the formula repeats. Neither was right often enough to show, so neither ships.

Each kind of proposal carries the share of such proposals that were right on a benchmark of real workbooks. A suggestion shows only when it is at least 90% likely and 15 points ahead of the next different one. When two strong proposals disagree only further on, the part they share shows. A suggestion stays steady while you type it, so it doesn't flicker.

## Accessibility

The suggestion is drawn in the layer that colours the formula's references, so screen readers don't read it twice. A polite status announces "Suggestion: … Tab to accept." once a suggestion has held for 400 ms, never on every key.

## Styles

The ghost text uses the field's text colour at `--sheetwrite-formula-ghost-opacity` (0.45 by default, at least 3:1 contrast on the light and dark grid backgrounds). It is part of `@sheetwrite/core/styles/formula-help.css`.

## Write your own suggester

The formula bar reads suggestions from any add-on that registers a `FormulaSuggester` in its grid hook:

```ts prelude="none" title="A suggester that closes SUM calls"
import type { FormulaSuggester, SheetwriteAddon } from "@sheetwrite/core";

const suggester: FormulaSuggester = {
  open: () => ({
    suggest: (text) => (/^=SUM\([A-Z]+\d+:[A-Z]+\d+$/i.test(text) ? { text: ")" } : null),
    close: () => {},
  }),
};

const closeSums: SheetwriteAddon = {
  name: "closeSums",
  grid: ({ formulaSuggestions }) => formulaSuggestions(suggester),
};
```

`open` runs once per edit, with the cell and `reads`: formulas, values, Ctrl+Arrow edges, the current region, the range AutoSum would sum, and reference moves. `suggest` runs on every key with the text and its [`analyzeFormula`](/docs/features/formulas/formula-help/) result, and must return within a frame. `openFormulaEdit` from `@sheetwrite/core/testing` builds the same edit without a grid, for tests and benchmarks.
