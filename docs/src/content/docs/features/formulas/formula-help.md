---
title: Formula help
description: Function autocomplete, the argument guide, live errors, coloured references and Explain Formula, and the analyzeFormula API that they use.
---

When a cell editor or the formula bar holds a formula (text that starts with `=`), the grid shows formula help:

- **Autocomplete.** A list of the functions whose names start with the name at the caret. It lists the built-in functions of the active engine and the [custom functions](/docs/features/formulas/custom-functions/) of the store, shorter names first.
- **Argument guide.** The signature of the function around the caret, for example `ROUND(number, digits)`, with the current argument in bold, and the function's description.
- **Live errors.** Syntax errors, unknown function names and wrong argument counts are underlined in the text, and the guide shows the first one. The syntax check is the parser of the active engine, so formula help marks exactly the formulas that the engine rejects. An error that only says the formula is not finished, such as a missing `)`, waits while the caret is at the end of the text.
- **Coloured references.** Each reference gets a colour in the text, and its range on the grid gets a fill in the same colour. Equal references share one colour.

Formula help does not calculate. It reads the text and the function metadata only, so it never runs a volatile or host function.

## Keys

While the function list is open:

| Key | Action |
| --- | --- |
| Arrow Down, Arrow Up | Move through the list. The list wraps at both ends. |
| Enter, Tab | Replace the name at the caret with the selected function and type `(`. |
| Escape | Close the list. The list stays closed until the text changes. |

While the list is closed, the keys do what the editor does: Enter commits, Tab moves, and Escape cancels the edit. A click on a list item picks it.

## Accessibility

- The editor field has `aria-autocomplete="list"`, `aria-controls` names the list, and `aria-activedescendant` names the selected item. The formula bar is an ARIA combobox with `aria-expanded`. The cell editor is a multi-line text field, which cannot take the combobox role, so it uses the same attributes without it.
- The list is an ARIA listbox with one option per function.
- The argument guide is a polite live region (`role="status"`) and describes the field (`aria-describedby`). A screen reader reads the guide when the function, the argument or the first error changes.
- The field has `aria-invalid="true"` while it shows an error.

## Explain Formula

**Formulas › Formula Auditing › Explain Formula** opens a side panel for the formula in the focus cell. The panel shows:

- the formula, with each reference in its colour;
- each function call, with its signature, its description and the text of each argument;
- each distinct reference, with its size and its sheet;
- the problems that formula help finds.

The panel follows the selection and the edits. The text comes from the function metadata; the panel does not calculate.

## Loading

Formula help is not in the grid's first download. The cell editor and the formula bar load it, with the function table, on the first edit of a formula. The Explain Formula panel loads when it first opens. A grid that never edits a formula never downloads them.

## analyzeFormula

Host editors can use the same analysis. Import `analyzeFormula` from `@sheetwrite/core/functions`, and give it the text, the caret offset and the list from [`listFunctions`](/docs/features/formulas/custom-functions/#function-metadata). The tokens and the syntax error come from the engine, so call it after `initSheetwrite()`.

```ts prelude="core" partial="requires an initialized grid" title="Read the argument at the caret"
import { analyzeFormula, listFunctions } from "@sheetwrite/core/functions";

const functions = await listFunctions(grid.store);
const text = "=ROUND(A1, ";
const analysis = analyzeFormula(text, text.length, functions);

console.log(analysis.call?.name); // "ROUND"
console.log(analysis.call?.argument?.name); // "digits"
```

The result has these fields. Every `from` and `to` is a UTF-16 offset into the text.

| Field | Contents |
| --- | --- |
| `tokens` | Each token with its kind (`number`, `string`, `function`, `reference`, `operator` and so on), for syntax colours. |
| `references` | Each cell, range, whole-column or whole-row reference: its sheet name as written (or `null` for the formula's own sheet), its 0-based `start` and `end`, and a `colorIndex` that equal references share. |
| `call` | The innermost function call around the caret: its name, the 0-based `argumentIndex`, and the metadata of the function and of the argument. `null` outside every call. |
| `completion` | The functions that complete the name at the caret, and the span to replace. `null` when there is no name to complete. |
| `diagnostics` | Each problem with its span and message: the first syntax error that the engine's parser finds, then each unknown function name and each wrong argument count. `incomplete` marks a problem at the end of an unfinished formula. |

Commas inside strings, array constants such as `{1, 2}` and union groups such as `(A1, B1)` do not count as argument separators. A repeating argument, such as the numbers of `SUM`, takes every later position. The argument count of a call is checked only after its `)`. With an empty function list, `completion` is `null` and no name is reported as unknown.

The engine packages export the two reads that `analyzeFormula` uses: `formulaTokens(text)` returns four numbers per token (kind, start offset, end offset, and 1 when whitespace comes before the token), and `formulaSyntaxError(text)` returns the first syntax error, or `undefined`.

## Limits

- Formula help does not show the result of the formula while you type.
- There is no multi-line formula editor.
- Reference colours repeat after six distinct references.
- A reference to a sheet that the workbook does not have gets a colour in the text but no fill on the grid.
