---
title: Formula assist
description: The optional formula-assist add-on predicts the rest of the formula typed in the formula bar and shows it as ghost text that Tab accepts.
---

`@sheetwrite/formula-assist` is an optional add-on. While you type a formula in the formula bar, it shows the most likely rest of the formula as dimmed text after the caret. Tab takes it.

```ts compile title="Install the add-on"
import { initSheetwrite } from "@sheetwrite/core";
import { formulaAssistAddon } from "@sheetwrite/formula-assist";

await initSheetwrite({ addons: [formulaAssistAddon()] });
```

Grids created after `initSheetwrite` show suggestions in their [formula bar](/docs/features/grid/toolbar-and-ribbon/). The add-on adds nothing to the page's first load until it is installed. Its entry only registers it. The predictor is a separate chunk that starts loading when the grid mounts, so it is ready by the first formula edit. Once it is there, it counts the workbook's formulas while the page is idle.

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

A suggestion stays while you type it: after `=` shows `SUM(D2:D11)`, typing `S` leaves `UM(D2:D11)`, and a character that differs takes it away. While the function list is open, a new suggestion shows only when it starts with what one entry inserts, and that entry becomes the selected one. Tab takes the suggestion while it shows; once you move to another entry of the list, Tab takes that entry, as in Excel. Suggestions show only while the caret is at the end of the text, with nothing selected and no IME composition open. The cell editor has no suggestions: it keeps Excel's AutoComplete.

## How it predicts

Predictions are deterministic. They use the workbook only: no network, no AI. Four signals each propose whole formulas, strongest first:

1. **Neighbouring formulas.** The formulas up to two cells up, down, left and right of the cell, moved to it as a fill would move them. A formula is proposed only when the cells above and below, or left and right, agree on it: then the cell almost surely continues them.
2. **Syntax.** The one function or visible sheet name that the typed letters can start, and the brackets that close calls which have all the arguments they can take. Hidden and very hidden sheets are never suggested.
3. **The column's pattern.** The nearest formula above or below in the same column, up to 100 rows away inside the same block of filled cells, moved to the cell. A formula that several cells in a row repeat is likelier, and so is one whose inputs in the cell's own row are filled: an empty row is often a total.
4. **The workbook's formulas.** The formulas of every visible sheet, counted by their shape: two formulas have the same shape when a fill or a paste turns one into the other. The most common shapes are moved to the cell, and one shows once it holds most of the formulas that still fit what you typed.

The add-on counts the workbook's formulas while the page is idle, never during its first load, and keeps the count current as cells change. It reads visible sheets only, keeps the count in memory only, and counts at most 100,000 formula cells and 5,000 different formulas per workbook. At that limit, the count takes about 7 MB of memory (6.6 MiB measured on a 100,000-row sheet).

The benchmark also measured argument roles (the row's key as a lookup value), text the formula repeats, the range AutoSum would sum, the end of the block a typed range starts, the formulas typed earlier in the session, and the formula in the same cell of other sheets. None was right often enough to show, so none ships.

Each kind of proposal carries the share of such proposals that were right on a benchmark of real workbooks. A suggestion from the neighbours or the syntax shows only when it is at least 90% likely, and one from the column or the workbook only when it is at least 98% likely. It must also be 15 points ahead of the next different one. When two strong proposals disagree only further on, the part they share shows. A suggestion stays steady while you type it, so it doesn't flicker.

### When it isn't sure

It shows nothing. If no proposal clears the bar above, no ghost text appears and you type as usual. A suggestion you refuse with Esc doesn't come back during that edit.

### How well it does

The add-on was measured on workbooks from the Enron spreadsheet corpus that it was never tuned on, with real formulas typed key by key in their own workbooks:

| Set | Formulas | Keystrokes saved | Wrong suggestions | Excel's function list alone |
| --- | ---: | ---: | ---: | ---: |
| 50 whole workbooks | 966 | 62.2% | 0.7% (5 of 735 shown) | 5.8% saved |
| 50 workbooks, the cells near each formula | 975 | 48.4% | 2.0% (14 of 713 shown) | 3.1% saved |

A wrong suggestion is one that wasn't how the formula went on. The neighbouring formulas give most of the savings; the column's pattern and the workbook's formulas add suggestions where the neighbours don't agree on one, such as the last row of a column. A one-off formula mostly gets only function names and closing brackets. The benchmark and its sets are described in the package's `bench/README.md`.

## Accessibility

The suggestion is drawn in the layer that colours the formula's references, so screen readers don't read it twice. A polite status announces "Suggestion: … Tab to accept." once a suggestion has held for 400 ms, never on every key.

## Styles

The ghost text uses the field's text colour at `--sheetwrite-formula-ghost-opacity` (0.45 by default, at least 3:1 contrast on the light and dark grid backgrounds). It is part of `@sheetwrite/core/styles/formula-help.css`.

## Write your own suggester

The formula bar reads suggestions from any add-on that registers a `FormulaSuggester` in its grid hook:

```ts compile title="A suggester that closes SUM calls"
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

`open` runs once per edit, with the cell and `reads`: formulas, values, Ctrl+Arrow edges and reference moves. `suggest` runs on every key with the text and its [`analyzeFormula`](/docs/features/formulas/formula-help/) result, and must return within a frame. `openFormulaEdit` from `@sheetwrite/core/testing` builds the same edit without a grid, for tests and benchmarks.
