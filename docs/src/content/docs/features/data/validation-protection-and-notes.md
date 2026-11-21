---
title: Validation, protection and notes
description: Restrict what users can enter, protect ranges from local edits, and attach plain-text notes to cells.
---

Validation rules check what users type, as Excel's Data Validation does. Protected ranges refuse local edits, and notes attach plain text to a cell.

```ts prelude="core" partial="requires an initialized grid with the rows shown below" title="A list rule, a protected header row, and a note"
grid.setValidationRule({
  id: "status",
  range: { sheet: "sheet1", start: { row: 1, col: 2 }, end: { row: 99, col: 2 } },
  condition: { kind: "list", values: ["Open", "Closed"] },
  policy: "reject",
  helpText: "Choose Open or Closed.",
});
grid.setProtectedRange({
  id: "header",
  range: { sheet: "sheet1", start: { row: 0, col: 0 }, end: { row: 0, col: 9 } },
  label: "Header row",
});
grid.setProtectionResolver(() => "deny", "atomic");
grid.setNote({ sheet: "sheet1", row: 1, col: 0 }, "Checked by finance");
```

<div class="sw-grid-result" data-selected="C2" data-notes="A2" data-lists="C2:C3">

| <strong>Invoice</strong> | <strong>Amount</strong> | <strong>Status</strong> |
| --- | ---: | --- |
| INV-001 | 120 | Open |
| INV-002 | 80 | Closed |

<dl>
<dt>C2:C100 · list validation</dt><dd>Open or Closed. Other values are rejected; an attempted “Pending” leaves C2 as Open.</dd>
<dt>A1:J1 · protected header</dt><dd>Local edits denied. Atomic mode rejects the whole transaction.</dd>
<dt>A2 · note</dt><dd>Checked by finance</dd>
</dl>

<figcaption>Result: the rules applied to the existing invoice rows. As in the grid, the amber corner marks the note and the arrow marks a list cell.</figcaption>

</div>

The setup has ten columns and at least 100 rows; A1:C3 contain the invoice data shown above. The code adds metadata, not those input values. The result also shows what stays in C2 after an invalid local edit. `grid.getNote({ sheet: "sheet1", row: 1, col: 0 })` returns `"Checked by finance"`.

**Try it live:** [Data tools showcase](/showcases/data-tools/) — try an invalid units value or a protected order-ID edit, and inspect the validation/protection feedback. Its rules differ from this invoice example.

**Full setup:** create and initialize the grid with [Your first grid](/docs/start/first-grid/), using the sheet dimensions and input rows described above, then apply this snippet.

## Validation

`DataValidationRule` covers Excel's Allow choices: any value, whole number and decimal (`number`), list, date, time, text length and custom, and a checkbox. A rule has a stable ID, a range, a `reject` / `warn` / `allow` policy, optional blank handling, and Excel's Error Alert and Input Message.

### The Data Validation dialog

**Data › Data Validation** opens Excel's dialog for the selection, with its three tabs: Settings (Allow, Data, the bounds, Source, In-cell dropdown, Formula, Ignore blank), Input Message and Error Alert. The command is `grid.actions.dataValidation()`.

- **OK** applies the rule to the selected cells as one undoable step. Selected cells that belonged to a larger rule leave it, and the rest of that rule stays.
- **Apply these changes to all other cells with the same settings** changes the whole rule instead.
- **Clear All**, then OK, removes the rule.
- When the selection holds several kinds of rule, or cells with and without one, Excel's question comes first.

### Lists, bounds and custom rules

A list's `source` is what Excel's Source box takes: a range such as `"=$H$2:$H$5"` or `"=Lists!$A$1:$A$9"`, or a defined name such as `"=Regions"`. The list shows the cells' current values, so it follows edits to them. Its references follow inserted and deleted rows and columns.

Bounds can be formulas too (`"=B1"`, `"=TODAY()"`). A custom rule passes a value when its formula is TRUE with the value in the cell: `"=COUNTIF($A:$A,A1)=1"` refuses duplicates. Formulas are relative to the rule's top-left cell, and text matches list items without case, as in Excel.

### The dropdown list

A selected cell of a list rule shows a dropdown arrow just right of it, as in Excel. The arrow and Alt+Down open the list, an ARIA `combobox` with a `listbox`, with the cell's value highlighted; the cell keeps showing its value, as in Excel. Typing, in the cell or with the list open, replaces the value as in Excel, and keeps only the items that contain the typed text, ignoring case, as Excel's AutoComplete for dropdown lists does.

| Key | Result |
| --- | --- |
| Up, Down | Highlight an item. |
| Enter | Store the highlighted item. With none highlighted, store the item the text names, or the text as typed, which the rule then checks. |
| Tab | Store the item and move on. |
| Escape | Close the list and keep the cell as it was. |
| F2, double-click | Edit the cell's text, as in Excel. |

Checkbox rules open a real ARIA `checkbox`; Space toggles it.

### Error alerts and input messages

A typed value that fails a rule shows Excel's error alert before it is stored. A formula is checked by its result. The alert shows `errorTitle` and `helpText`, or Excel's default message.

| Rule | Alert and its buttons |
| --- | --- |
| `reject` | **Stop.** Retry returns to the entry with its text selected; Cancel drops it. |
| `warn` | **Warning.** Yes keeps the value; No returns to the entry; Cancel drops it. |
| `warn` with `errorStyle: "information"` | **Information.** OK keeps the value; Cancel drops it. |
| `allow` | **None,** as with Excel's alert turned off: the value is stored as typed. |

While a cell of a rule is selected, the rule's `inputTitle` and `inputMessage` show in a box below it, as in Excel, unless `showInputMessage` is `false`. Screen readers hear the input message as the cell's description.

### Paste and validation

Typing, clear and host transactions pass through the same validation check. A paste works as Excel's does: its values land unchecked, and the cells it covers take the copied cells' rules in place of their own. Paste Values, and a paste from outside the grid, keep the target's rules.

A fill works as in Excel. The fill handle, Ctrl/Cmd + D and Ctrl/Cmd + R land their values unchecked. Each filled cell takes the rules of the source cell it repeats, in place of its own. A rule over the whole source extends over the filled cells. Copy Cells, Fill Series and Fill Formatting Only in Auto Fill Options do the same, because Excel counts a cell's validation with its formats. Fill Without Formatting keeps the filled cells' own rules. `paste.keepValidation` applies to pastes only.

With `GridConfig.paste.keepValidation: true`, a paste keeps the target's rules instead, and checks the values:

- a value a `reject` rule refuses is not pasted;
- a value a `warn` rule refuses lands;
- the status bar names both kinds of cell, such as "3 cells refused: B4, B7, B9.", with a **Select them** button.

This goes beyond Excel: a dropdown list keeps working after a paste, and the user sees at once which pasted values did not fit.

## Protection

`ProtectedRange` is serializable client policy metadata. Local writes to it are denied by default. A host `ProtectionResolver` can allow them. Atomic mode rejects the whole transaction. Partial mode applies the allowed operations and reports the rest.

## Notes

Plain-text notes use `setNote(addr, text)` and `getNote(addr)`. The focused cell's note is its ARIA description. Notes serialize, rebase with structural edits, take part in undo and redo, and round-trip through Sheetwrite XLSX metadata.

## Options

| Field or API | Values | Effect |
| --- | --- | --- |
| `DataValidationRule.condition.kind` | `any`, `list`, `number`, `date`, `time`, `textLength`, `custom`, `checkbox` | The kind of check. |
| `condition.source` (list) / `condition.formula` (custom) | formula with `=` | A list from a range or defined name; a custom check. |
| `DataValidationRule.inCellDropdown` | `boolean` | A list rule's dropdown arrow and list; `true` unless you turn it off. |
| `DataValidationRule.policy` | `"reject"`, `"warn"`, `"allow"` | What happens to a value that fails the check. |
| `DataValidationRule.allowBlank` | `boolean` | Blank cells are allowed unless you turn this off. |
| `DataValidationRule.errorStyle` | `"stop"`, `"warning"`, `"information"` | The error alert's style: `stop` for `reject`, `warning` (default) or `information` for `warn`. |
| `DataValidationRule.errorTitle` / `helpText` | `string` | The error alert's title (32 characters at most) and message (255). |
| `DataValidationRule.inputTitle` / `inputMessage` | `string` | The input message's title and text, shown in a box below a selected cell. |
| `DataValidationRule.showInputMessage` | `boolean` | Show the input message; `true` unless you turn it off. |
| `ProtectedRange.label` / `permissionKey` | `string` | Optional metadata for the resolver and UI. |
| `GridOptions.protectionResolver` / `grid.setProtectionResolver(resolver, mode?)` | `(request) => "allow" \| "deny"` | Decides each local write to a protected range. |
| `GridOptions.mutationPolicy` | `"atomic"`, `"partial"` | Reject the whole transaction, or skip only the denied operations. |
| `grid.setNote(addr, text)` | `string`, or `null` to remove | Set or remove a cell's note. |

Sheets can also carry `validationRules`, `protectedRanges` and `notes` in the workbook. See [DataValidationRule](/docs/api/core/data-validation-rule/), [ProtectedRange](/docs/api/core/protected-range/) and [ProtectionResolver](/docs/api/core/protection-resolver/).

## Edge cases and limits

- Remote operations bypass the protection policy. Protection is client UX, not authorization: a server must enforce its own authorization.
- Validation applies to typing, clear and host transactions. A paste or a fill lands its values unchecked, as in Excel, unless `paste.keepValidation` is on for a paste.

## See also

- [Editing and clipboard](/docs/features/grid/editing-and-clipboard/)
- [Collaboration](/docs/features/collaboration/)
- [Accessibility](/docs/features/accessibility/)
