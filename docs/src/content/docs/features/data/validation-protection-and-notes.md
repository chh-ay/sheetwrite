---
title: Validation, protection and notes
description: Restrict what users can enter, protect ranges from local edits, and attach plain-text notes to cells.
---

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

`DataValidationRule` covers list, numeric range, date range, text-length, and checkbox conditions. A rule has a stable ID, a range, a `reject` / `warn` / `allow` policy, optional blank handling, and help text.

List rules open a keyboard-operable `listbox`. Checkbox rules open a real ARIA `checkbox`. Arrow keys and typeahead change a list choice, Space toggles a checkbox, Enter commits, Tab commits and moves, and Escape cancels.

Every mutation path passes through the same validation boundary, including paste, fill, clear, and host transactions.

## Protection

`ProtectedRange` is serializable client policy metadata. Local writes to it are denied by default. A host `ProtectionResolver` can allow them. Atomic mode rejects the whole transaction. Partial mode applies the allowed operations and reports the rest.

## Notes

Plain-text notes use `setNote(addr, text)` and `getNote(addr)`. The focused cell's note is its ARIA description. Notes serialize, rebase with structural edits, take part in undo and redo, and round-trip through Sheetwrite XLSX metadata.

## Options

| Field or API | Values | Effect |
| --- | --- | --- |
| `DataValidationRule.condition.kind` | `list`, `number`, `date`, `textLength`, `checkbox` | The kind of check. |
| `DataValidationRule.policy` | `"reject"`, `"warn"`, `"allow"` | What happens to a value that fails the check. |
| `DataValidationRule.allowBlank` | `boolean` | Blank cells are allowed unless you turn this off. |
| `DataValidationRule.helpText` | `string` | Help text for the rule. |
| `ProtectedRange.label` / `permissionKey` | `string` | Optional metadata for the resolver and UI. |
| `GridOptions.protectionResolver` / `grid.setProtectionResolver(resolver, mode?)` | `(request) => "allow" \| "deny"` | Decides each local write to a protected range. |
| `GridOptions.mutationPolicy` | `"atomic"`, `"partial"` | Reject the whole transaction, or skip only the denied operations. |
| `grid.setNote(addr, text)` | `string`, or `null` to remove | Set or remove a cell's note. |

Sheets can also carry `validationRules`, `protectedRanges` and `notes` in the workbook. See [DataValidationRule](/docs/api/core/data-validation-rule/), [ProtectedRange](/docs/api/core/protected-range/) and [ProtectionResolver](/docs/api/core/protection-resolver/).

## Edge cases and limits

- Remote operations bypass the protection policy. Protection is client UX, not authorization: a server must enforce its own authorization.
- Validation applies to paste, fill, clear, and host transactions, not only to typing.

## See also

- [Editing and clipboard](/docs/features/grid/editing-and-clipboard/)
- [Collaboration](/docs/features/collaboration/)
- [Accessibility](/docs/features/accessibility/)
